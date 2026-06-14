import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { createSale, anularSale } from "../services/sales.js";
import { parseListParams, paginated, wantsPagination, listOrPaginate } from "../lib/listQuery.js";

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
    const where = q ? { nombre: { contains: q, mode: "insensitive" as const } } : {};
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
        ...(q
          ? {
              OR: [
                { codigo: { contains: q, mode: "insensitive" } },
                { descripcion: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
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
  // Credito: nro de cuotas (override del de la lista)
  cuotas: z.number().int().positive().optional(),
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
          fecha: new Date(d.fecha),
          observacion: d.observacion ?? null,
          usuarioId: req.auth?.userId ?? null,
          items: d.items,
          cuotas: d.cuotas,
          payments: d.payments,
        })
      );
    } catch (err) {
      // Validaciones de negocio del servicio -> 400 (no 500)
      if (err instanceof HttpError) throw err;
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }

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
      ...(q
        ? {
            OR: [
              { numero: { contains: q, mode: "insensitive" as const } },
              { customer: { person: { razonSocial: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
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
      res.json(result);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }
  })
);
