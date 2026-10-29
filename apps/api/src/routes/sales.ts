import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { createSale, anularSale } from "../services/sales.js";
import { parseListParams, paginated, wantsPagination, listOrPaginate, buildWordSearch, buildWordSearchSql } from "../lib/listQuery.js";
import { contabilizar } from "../lib/contabilizar.js";
import { parseFechaDoc, parseRange } from "../lib/fechas.js";
import { Prisma } from "@prisma/client";

// =====================================================================
// LISTAS DE PRECIOS (compartidas entre empresas, como el catalogo)
// =====================================================================
export const priceListsRouter = Router();
priceListsRouter.use(authRequired);

const priceListSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  condicion: z.enum(["CONTADO", "CREDITO"]).default("CONTADO"),
  cuotas: z.number().int().nonnegative().default(0),
  orden: z.number().int().nonnegative().optional(),
  esDefault: z.boolean().optional(),
  activo: z.boolean().optional(),
});

priceListsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = buildWordSearch(q, ["nombre"]);
    const include = { _count: { select: { prices: true } } };
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: { nombre: "nombre", orden: "orden", condicion: "condicion" }, defaultSort: "orden" },
        ({ orderBy, skip, take }) => prisma.priceList.findMany({ where, include, orderBy, skip, take }),
        () => prisma.priceList.count({ where }),
        300
      )
    );
  })
);

priceListsRouter.post(
  "/",
  requirePermission("VENM010"),
  asyncHandler(async (req, res) => {
    const d = priceListSchema.parse(req.body);
    if (d.condicion === "CREDITO" && d.cuotas <= 0) {
      throw new HttpError(400, "Una lista a credito debe tener cantidad de cuotas");
    }
    const list = await prisma.$transaction(async (tx) => {
      if (d.esDefault) await tx.priceList.updateMany({ data: { esDefault: false } });
      return tx.priceList.create({ data: { ...d, codigo: d.codigo.trim().toUpperCase() } });
    });
    res.status(201).json(list);
  })
);

priceListsRouter.put(
  "/:id",
  requirePermission("VENM010"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const d = priceListSchema.partial().parse(req.body);
    const list = await prisma.$transaction(async (tx) => {
      if (d.esDefault) await tx.priceList.updateMany({ where: { id: { not: id } }, data: { esDefault: false } });
      const result = await tx.priceList.updateMany({
        where: { id },
        data: { ...d, ...(d.codigo ? { codigo: d.codigo.trim().toUpperCase() } : {}) },
      });
      if (result.count === 0) throw new HttpError(404, "Lista de precios no encontrada");
      return tx.priceList.findUnique({ where: { id } });
    });
    res.json(list);
  })
);

// =====================================================================
// PRECIOS POR ARTICULO Y LISTA
// =====================================================================
export const articlePricesRouter = Router();
articlePricesRouter.use(authRequired);

// Grilla de precios para una lista: todos los articulos activos con su precio
// en esa lista (null si todavia no se cargo).
articlePricesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const priceListId = Number(req.query.priceListId);
    if (!priceListId) throw new HttpError(400, "Falta priceListId");
    const q = (req.query.q as string | undefined)?.trim();

    const articles = await prisma.article.findMany({
      where: {
        activo: true,
        ...buildWordSearch(q, ["codigo", "descripcion"]),
      },
      orderBy: { descripcion: "asc" },
      take: 500,
      select: {
        id: true,
        codigo: true,
        descripcion: true,
        ivaTipo: true,
        precioVenta: true,
        rubro: { select: { id: true, nombre: true } },
        prices: { where: { priceListId }, select: { precio: true } },
      },
    });

    res.json(
      articles.map((a) => ({
        id: a.id,
        codigo: a.codigo,
        descripcion: a.descripcion,
        ivaTipo: a.ivaTipo,
        precioVenta: a.precioVenta,
        rubro: a.rubro,
        precio: a.prices[0]?.precio ?? null,
      }))
    );
  })
);

// Guardado en lote de precios de una lista.
const bulkSchema = z.object({
  priceListId: z.number().int(),
  items: z
    .array(z.object({ articleId: z.number().int(), precio: z.number().nonnegative() }))
    .min(1, "No hay precios para guardar"),
});

articlePricesRouter.put(
  "/",
  requirePermission("VENM011"),
  asyncHandler(async (req, res) => {
    const d = bulkSchema.parse(req.body);
    const list = await prisma.priceList.findUnique({ where: { id: d.priceListId } });
    if (!list) throw new HttpError(400, "Lista de precios invalida");

    await prisma.$transaction(
      d.items.map((it) =>
        prisma.articlePrice.upsert({
          where: { articleId_priceListId: { articleId: it.articleId, priceListId: d.priceListId } },
          create: { articleId: it.articleId, priceListId: d.priceListId, precio: it.precio },
          update: { precio: it.precio },
        })
      )
    );
    res.json({ ok: true, guardados: d.items.length });
  })
);

// Resuelve el precio de un articulo en una lista (para la pantalla de venta).
articlePricesRouter.get(
  "/resolve",
  asyncHandler(async (req, res) => {
    const priceListId = Number(req.query.priceListId);
    const articleId = Number(req.query.articleId);
    if (!priceListId || !articleId) throw new HttpError(400, "Faltan priceListId y articleId");
    const row = await prisma.articlePrice.findUnique({
      where: { articleId_priceListId: { articleId, priceListId } },
    });
    res.json({ precio: row?.precio ?? null });
  })
);

// Vista inversa: un articulo y su precio en TODAS las listas activas.
articlePricesRouter.get(
  "/by-article",
  asyncHandler(async (req, res) => {
    const articleId = Number(req.query.articleId);
    if (!articleId) throw new HttpError(400, "Falta articleId");

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        codigo: true,
        descripcion: true,
        ivaTipo: true,
        rubro: { select: { id: true, nombre: true } },
      },
    });
    if (!article) throw new HttpError(404, "Articulo no encontrado");

    const lists = await prisma.priceList.findMany({
      where: { activo: true },
      orderBy: { orden: "asc" },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        condicion: true,
        cuotas: true,
        esDefault: true,
        prices: { where: { articleId }, select: { precio: true } },
      },
    });

    res.json({
      article,
      lists: lists.map((l) => ({
        priceListId: l.id,
        codigo: l.codigo,
        nombre: l.nombre,
        condicion: l.condicion,
        cuotas: l.cuotas,
        esDefault: l.esDefault,
        precio: l.prices[0]?.precio ?? null,
      })),
    });
  })
);

// Guardado en lote de los precios de UN articulo en varias listas.
const bulkByArticleSchema = z.object({
  articleId: z.number().int(),
  items: z
    .array(z.object({ priceListId: z.number().int(), precio: z.number().nonnegative() }))
    .min(1, "No hay precios para guardar"),
});

articlePricesRouter.put(
  "/by-article",
  requirePermission("VENM011"),
  asyncHandler(async (req, res) => {
    const d = bulkByArticleSchema.parse(req.body);
    const article = await prisma.article.findUnique({ where: { id: d.articleId } });
    if (!article) throw new HttpError(400, "Articulo invalido");

    await prisma.$transaction(
      d.items.map((it) =>
        prisma.articlePrice.upsert({
          where: { articleId_priceListId: { articleId: d.articleId, priceListId: it.priceListId } },
          create: { articleId: d.articleId, priceListId: it.priceListId, precio: it.precio },
          update: { precio: it.precio },
        })
      )
    );
    res.json({ ok: true, guardados: d.items.length });
  })
);

// =====================================================================
// VENTAS (facturacion)
// =====================================================================
export const salesRouter = Router();
salesRouter.use(authRequired, companyRequired);

const saleSchema = z.object({
  customerId: z.number().int(),
  priceListId: z.number().int(),
  warehouseId: z.number().int(),
  fecha: z.string().min(1),
  observacion: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        articleId: z.number().int(),
        cantidad: z.number().positive(),
        precioUnitario: z.number().nonnegative(),
        series: z.array(z.string()).optional(),
      })
    )
    .min(1, "Agrega al menos un articulo"),
  // Condicion de la venta (independiente de la lista). Si no viene, se usa la de la lista.
  condicion: z.enum(["CONTADO", "CREDITO"]).optional(),
  // Credito: nro de cuotas (override del de la lista)
  cuotas: z.number().int().positive().optional(),
  // Credito: fecha de vencimiento de cada cuota (yyyy-mm-dd), en orden. Si no viene o
  // falta alguna, esa cuota cae al default (fecha de la venta + N meses).
  vencimientos: z.array(z.string()).optional(),
  // Contado: pago total. Credito: entrega inicial (puede ir vacio)
  payments: z
    .array(
      z.object({
        medio: z.enum(["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"]),
        monto: z.number().nonnegative(),
      })
    )
    .optional(),
});

salesRouter.post(
  "/",
  requirePermission("VENI001"),
  asyncHandler(async (req, res) => {
    const d = saleSchema.parse(req.body);
    const companyId = req.companyId!;

    const [customer, warehouse] = await Promise.all([
      prisma.customer.findFirst({ where: { id: d.customerId, activo: true } }),
      prisma.warehouse.findFirst({ where: { id: d.warehouseId, companyId } }),
    ]);
    if (!customer) throw new HttpError(400, "Cliente invalido");
    if (!warehouse) throw new HttpError(400, "Deposito invalido para la empresa");

    let invoices;
    try {
      invoices = await prisma.$transaction((tx) =>
        createSale(tx, {
          companyId,
          customerId: d.customerId,
          priceListId: d.priceListId,
          warehouseId: d.warehouseId,
          fecha: parseFechaDoc(d.fecha),
          observacion: d.observacion ?? null,
          usuarioId: req.auth?.userId ?? null,
          items: d.items,
          condicion: d.condicion,
          cuotas: d.cuotas,
          vencimientos: d.vencimientos,
          payments: d.payments,
        })
      );
    } catch (err) {
      // Validaciones de negocio del servicio -> 400 (no 500)
      if (err instanceof HttpError) throw err;
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }

    await contabilizar(res, companyId, invoices.map((i) => ({ origenTipo: "VENTA", origenId: i.id })));
    res.status(201).json({ invoices });
  })
);

const salesSortable = {
  id: "id",
  fecha: "fecha",
  comprobante: "numero",
  cliente: "customer.person.razonSocial",
  lista: "priceList.nombre",
  condicion: "condicion",
  total: "total",
} as const;

salesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    // Busqueda en el where (correcta para total/paginacion). El nro de comprobante
    // matchea por `numero`; el cliente por razon social.
    const where = {
      companyId: req.companyId,
      ...buildWordSearch(q, ["numero", "customer.person.razonSocial"]),
    };
    const include = {
      customer: { include: { person: { select: { razonSocial: true } } } },
      priceList: { select: { nombre: true } },
    };
    const { skip, take, orderBy, page, pageSize } = parseListParams(req.query, {
      sortable: salesSortable,
      defaultSort: "fecha",
      defaultDir: "desc",
    });

    if (!wantsPagination(req.query)) {
      const invoices = await prisma.salesInvoice.findMany({ where, include, orderBy, take: 200 });
      return res.json(invoices);
    }

    const [items, total] = await prisma.$transaction([
      prisma.salesInvoice.findMany({ where, include, orderBy, skip, take }),
      prisma.salesInvoice.count({ where }),
    ]);
    res.json(paginated(items, total, page, pageSize));
  })
);

// =====================================================================
// HISTORIAL DE VENTAS POR ARTICULO (VENC012)
// Una fila por articulo vendido (linea de factura) y, si se incluyen devoluciones,
// una fila en negativo por articulo devuelto con nota de credito (ventas netas). No
// cuenta ventas anuladas. Facturas y NC se combinan en SQL para que paginacion,
// orden y totales sean exactos. Margen = venta neta sin IVA - costo (PMP al vender).
// =====================================================================
const idParam = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

// Venta neta sin IVA de una linea (mismo desglose que desglosarIvaIncluido) y su costo.
const NETO_SQL = `(l.monto - CASE l."ivaTipo" WHEN 'IVA10' THEN ROUND(l.monto / 11) WHEN 'IVA5' THEN ROUND(l.monto / 21) ELSE 0 END)`;
const COSTO_SQL = `(l.cantidad * l."costoUnitario")`;

const historialOrden: Record<string, string> = {
  fecha: "l.fecha",
  comprobante: "l.comprobante",
  cliente: `p."razonSocial"`,
  articulo: "a.descripcion",
  vendedor: "u.nombre",
  cantidad: "l.cantidad",
  monto: "l.monto",
  margen: `(${NETO_SQL} - ${COSTO_SQL})`,
};

/** CTE `lineas` (ventas + devoluciones) y el FROM/WHERE con los filtros de la consulta. */
function historialSql(req: { companyId?: number; query: Record<string, unknown> }) {
  const companyId = req.companyId!;
  const qp = req.query;
  const incluirDevoluciones = qp.devoluciones !== "0";
  const fecha = parseRange(req);
  const condicion = qp.condicion === "CONTADO" || qp.condicion === "CREDITO" ? (qp.condicion as string) : undefined;

  const cte = Prisma.sql`
    WITH lineas AS (
      SELECT 'VENTA'::text AS tipo, it.id AS "lineaId", i.id AS "invoiceId", i.fecha,
             i.establecimiento || '-' || i."puntoExpedicion" || '-' || i.numero AS comprobante,
             i.condicion::text AS condicion, i."customerId", i."branchId", i."usuarioId",
             it."articleId", it.cantidad, it."precioUnitario", it.total AS monto,
             it."ivaTipo"::text AS "ivaTipo", it."costoUnitario"
        FROM sales_invoice_items it
        JOIN sales_invoices i ON i.id = it."invoiceId"
       WHERE i."companyId" = ${companyId} AND i.estado <> 'ANULADO'
      UNION ALL
      SELECT 'DEVOLUCION', nci.id, nc."invoiceId", nc.fecha, 'NC ' || nc.numero,
             i.condicion::text, i."customerId", i."branchId", nc."usuarioId",
             nci."articleId", -nci.cantidad, nci."precioUnitario", -nci.total,
             nci."ivaTipo"::text,
             -- costo de lo devuelto: el de la venta original (o el actual del articulo)
             COALESCE((SELECT it2."costoUnitario" FROM sales_invoice_items it2
                        WHERE it2."invoiceId" = nc."invoiceId" AND it2."articleId" = nci."articleId"
                        ORDER BY it2.id LIMIT 1), a0."costoActual")
        FROM sales_credit_note_items nci
        JOIN sales_credit_notes nc ON nc.id = nci."creditNoteId"
        JOIN articles a0 ON a0.id = nci."articleId"
        LEFT JOIN sales_invoices i ON i.id = nc."invoiceId"
       WHERE nc."companyId" = ${companyId} AND ${incluirDevoluciones}
    )`;

  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  const num = (k: string) => idParam(qp[k]);
  if (fecha?.gte) conds.push(Prisma.sql`l.fecha >= ${fecha.gte}`);
  if (fecha?.lte) conds.push(Prisma.sql`l.fecha <= ${fecha.lte}`);
  if (num("articleId")) conds.push(Prisma.sql`l."articleId" = ${num("articleId")}`);
  if (num("brandId")) conds.push(Prisma.sql`a."brandId" = ${num("brandId")}`);
  if (num("categoryId")) conds.push(Prisma.sql`a."categoryId" = ${num("categoryId")}`);
  if (num("rubroId")) conds.push(Prisma.sql`a."rubroId" = ${num("rubroId")}`);
  if (num("customerId")) conds.push(Prisma.sql`l."customerId" = ${num("customerId")}`);
  if (num("branchId")) conds.push(Prisma.sql`l."branchId" = ${num("branchId")}`);
  if (num("usuarioId")) conds.push(Prisma.sql`l."usuarioId" = ${num("usuarioId")}`);
  if (condicion) conds.push(Prisma.sql`l.condicion = ${condicion}`);
  conds.push(
    buildWordSearchSql((qp.q as string | undefined)?.trim(), ["a.codigo", "a.descripcion", "l.comprobante", `p."razonSocial"`])
  );

  const fromWhere = Prisma.sql`
    FROM lineas l
    JOIN articles a ON a.id = l."articleId"
    LEFT JOIN customers c ON c.id = l."customerId"
    LEFT JOIN persons p ON p.id = c."personId"
    LEFT JOIN users u ON u.id = l."usuarioId"
    LEFT JOIN brands b ON b.id = a."brandId"
    LEFT JOIN categories cat ON cat.id = a."categoryId"
    WHERE ${Prisma.join(conds, " AND ")}`;
  return { cte, fromWhere };
}

interface FilaHistorial {
  tipo: "VENTA" | "DEVOLUCION";
  lineaId: number;
  invoiceId: number | null;
  fecha: Date;
  comprobante: string;
  condicion: string | null;
  cliente: string | null;
  clienteDoc: string | null;
  vendedor: string | null;
  articleId: number;
  codigo: string;
  descripcion: string;
  cantidad: Prisma.Decimal;
  precioUnitario: Prisma.Decimal;
  monto: Prisma.Decimal;
  costo: Prisma.Decimal;
  margen: Prisma.Decimal;
}

// Filas del detalle (paginadas o, para exportar, todas hasta `take`).
function filasHistorial(req: { companyId?: number; query: Record<string, unknown> }, take: number, skip: number) {
  const { cte, fromWhere } = historialSql(req);
  const sortRaw = String(req.query.sort ?? "");
  const sort = sortRaw in historialOrden ? sortRaw : "fecha";
  const dir = req.query.dir === "asc" ? "ASC" : req.query.dir === "desc" ? "DESC" : sort === "fecha" ? "DESC" : "ASC";
  return prisma.$queryRaw<FilaHistorial[]>`
    ${cte}
    SELECT l.tipo, l."lineaId", l."invoiceId", l.fecha, l.comprobante, l.condicion,
           p."razonSocial" AS cliente, COALESCE(p.ruc, p."nroDoc") AS "clienteDoc", u.nombre AS vendedor,
           a.id AS "articleId", a.codigo, a.descripcion,
           l.cantidad, l."precioUnitario", l.monto,
           ${Prisma.raw(COSTO_SQL)} AS costo, (${Prisma.raw(NETO_SQL)} - ${Prisma.raw(COSTO_SQL)}) AS margen
    ${fromWhere}
    ORDER BY ${Prisma.raw(historialOrden[sort])} ${Prisma.raw(dir)}, l."invoiceId" DESC NULLS LAST, l.tipo DESC, l."lineaId"
    LIMIT ${take} OFFSET ${skip}`;
}

const filaJson = (f: FilaHistorial) => ({
  id: `${f.tipo === "VENTA" ? "V" : "D"}${f.lineaId}`,
  tipo: f.tipo,
  invoiceId: f.invoiceId,
  fecha: f.fecha,
  comprobante: f.comprobante,
  condicion: f.condicion,
  cliente: f.cliente,
  clienteDoc: f.clienteDoc,
  vendedor: f.vendedor,
  article: { id: f.articleId, codigo: f.codigo, descripcion: f.descripcion },
  cantidad: Number(f.cantidad),
  precioUnitario: Number(f.precioUnitario),
  monto: Number(f.monto),
  costo: Math.round(Number(f.costo)),
  margen: Math.round(Number(f.margen)),
});

salesRouter.get(
  "/historial-articulos",
  asyncHandler(async (req, res) => {
    const { skip, take, page, pageSize } = parseListParams(req.query, {
      sortable: historialOrden,
      defaultSort: "fecha",
      defaultDir: "desc",
    });
    const { cte, fromWhere } = historialSql(req);
    const [filas, conteo] = await Promise.all([
      filasHistorial(req, take, skip),
      prisma.$queryRaw<Array<{ n: bigint }>>`${cte} SELECT COUNT(*) AS n ${fromWhere}`,
    ]);
    res.json(paginated(filas.map(filaJson), Number(conteo[0]?.n ?? 0), page, pageSize));
  })
);

type Dec = Prisma.Decimal | null;

// Resumen con los mismos filtros: totales, devoluciones, margen y ranking por articulo.
salesRouter.get(
  "/historial-articulos/resumen",
  asyncHandler(async (req, res) => {
    const { cte, fromWhere } = historialSql(req);
    const neto = Prisma.raw(NETO_SQL);
    const costo = Prisma.raw(COSTO_SQL);
    const [tot, arts] = await Promise.all([
      prisma.$queryRaw<
        Array<{ cantidad: Dec; monto: Dec; ventas: Dec; devoluciones: Dec; neto: Dec; costo: Dec; comprobantes: bigint; clientes: bigint }>
      >`${cte}
        SELECT SUM(l.cantidad) AS cantidad, SUM(l.monto) AS monto,
               SUM(l.monto) FILTER (WHERE l.tipo = 'VENTA') AS ventas,
               SUM(l.monto) FILTER (WHERE l.tipo = 'DEVOLUCION') AS devoluciones,
               SUM(${neto}) AS neto, SUM(${costo}) AS costo,
               COUNT(DISTINCT l."invoiceId") FILTER (WHERE l.tipo = 'VENTA') AS comprobantes,
               COUNT(DISTINCT l."customerId") AS clientes
        ${fromWhere}`,
      prisma.$queryRaw<
        Array<{ articleId: number; codigo: string; descripcion: string; marca: string | null; categoria: string | null; cantidad: Dec; monto: Dec; neto: Dec; costo: Dec; lineas: bigint }>
      >`${cte}
        SELECT a.id AS "articleId", a.codigo, a.descripcion, b.nombre AS marca, cat.nombre AS categoria,
               SUM(l.cantidad) AS cantidad, SUM(l.monto) AS monto, SUM(${neto}) AS neto, SUM(${costo}) AS costo,
               COUNT(*) FILTER (WHERE l.tipo = 'VENTA') AS lineas
        ${fromWhere}
        GROUP BY a.id, a.codigo, a.descripcion, b.nombre, cat.nombre
        ORDER BY SUM(l.monto) DESC
        LIMIT 50`,
    ]);
    const t = tot[0];
    const n = (v: Dec | undefined) => Number(v ?? 0);
    const comprobantes = Number(t?.comprobantes ?? 0);
    const netoSinIva = Math.round(n(t?.neto));
    const margen = Math.round(n(t?.neto) - n(t?.costo));
    res.json({
      cantidad: n(t?.cantidad),
      monto: n(t?.monto),
      devoluciones: -n(t?.devoluciones),
      netoSinIva,
      costo: Math.round(n(t?.costo)),
      margen,
      margenPct: netoSinIva > 0 ? Math.round((margen / netoSinIva) * 1000) / 10 : null,
      comprobantes,
      clientes: Number(t?.clientes ?? 0),
      ticketPromedio: comprobantes ? Math.round(n(t?.ventas) / comprobantes) : 0,
      articulos: arts.map((a) => ({
        articleId: a.articleId,
        codigo: a.codigo,
        descripcion: a.descripcion,
        marca: a.marca,
        categoria: a.categoria,
        cantidad: n(a.cantidad),
        monto: n(a.monto),
        margen: Math.round(n(a.neto) - n(a.costo)),
        lineas: Number(a.lineas),
      })),
    });
  })
);

// Vendedores (usuarios que registraron ventas en la empresa), para el filtro.
salesRouter.get(
  "/historial-articulos/vendedores",
  asyncHandler(async (req, res) => {
    const filas = await prisma.$queryRaw<Array<{ id: number; nombre: string }>>`
      SELECT DISTINCT u.id, u.nombre FROM sales_invoices i JOIN users u ON u.id = i."usuarioId"
       WHERE i."companyId" = ${req.companyId!} ORDER BY u.nombre`;
    res.json(filas);
  })
);

// Exportacion a CSV (abre en Excel: separador ";" y BOM UTF-8) con los filtros y el orden aplicados.
const MAX_EXPORT = 50_000;
salesRouter.get(
  "/historial-articulos/exportar",
  asyncHandler(async (req, res) => {
    const filas = (await filasHistorial(req, MAX_EXPORT, 0)).map(filaJson);
    const celda = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fecha = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
    const encabezado = ["Tipo", "Fecha", "Comprobante", "Condicion", "Cliente", "RUC/CI", "Vendedor", "Codigo", "Articulo",
      "Cantidad", "Precio unitario", "Monto", "Costo", "Margen"];
    const lineas = filas.map((f) =>
      [f.tipo === "VENTA" ? "Venta" : "Devolucion", fecha(f.fecha), f.comprobante, f.condicion ?? "", f.cliente ?? "",
        f.clienteDoc ?? "", f.vendedor ?? "", f.article.codigo, f.article.descripcion, f.cantidad,
        Math.round(f.precioUnitario), Math.round(f.monto), f.costo, f.margen].map(celda).join(";")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="historial-ventas.csv"`);
    res.send("﻿" + [encabezado.join(";"), ...lineas].join("\r\n"));
  })
);


salesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        customer: { include: { person: true } },
        priceList: true,
        items: { include: { article: { select: { codigo: true, descripcion: true } } } },
        payments: true,
        installments: { orderBy: { nroCuota: "asc" } },
        promissoryNotes: true,
      },
    });
    if (!invoice) throw new HttpError(404, "Venta no encontrada");
    res.json(invoice);
  })
);

// Datos para el certificado de garantia de una venta: cabecera + items con la
// cantidad de meses de garantia de cada articulo y los numeros de serie vendidos.
salesRouter.get(
  "/:id/garantia",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id, companyId: req.companyId },
      include: {
        customer: { include: { person: true } },
        items: {
          include: {
            article: {
              select: { id: true, codigo: true, descripcion: true, garantiaMeses: true, controlaSerie: true },
            },
          },
        },
      },
    });
    if (!invoice) throw new HttpError(404, "Venta no encontrada");

    // Numeros de serie que salieron con esta venta, agrupados por articulo.
    const serials = await prisma.articleSerial.findMany({
      where: { saleInvoiceId: id },
      select: { articleId: true, serie: true },
      orderBy: { serie: "asc" },
    });
    const serialsByArticle: Record<number, string[]> = {};
    for (const s of serials) (serialsByArticle[s.articleId] ??= []).push(s.serie);

    res.json({ ...invoice, serialsByArticle });
  })
);

// Anular una venta (revierte stock, cuenta corriente, cuotas y contabilidad)
salesRouter.post(
  "/:id/anular",
  requirePermission("VENI001"),
  asyncHandler(async (req, res) => {
    try {
      const result = await prisma.$transaction((tx) =>
        anularSale(tx, {
          companyId: req.companyId!,
          invoiceId: Number(req.params.id),
          usuarioId: req.auth?.userId ?? null,
        })
      );
      await contabilizar(res, req.companyId!, [{ origenTipo: "ANULACION_VENTA", origenId: result.id }]);
      res.json(result);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }
  })
);
