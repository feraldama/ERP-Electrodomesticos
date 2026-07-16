import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { applyStockMovement, applyTransfer } from "../services/stock.js";
import { requirePermission } from "../middleware/permission.js";
import { parseListParams, paginated, wantsPagination, listOrPaginate, buildWordSearch } from "../lib/listQuery.js";

// Depositos (por empresa)
export const warehousesRouter = Router();
warehousesRouter.use(authRequired, companyRequired);

warehousesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = {
      companyId: req.companyId,
      ...buildWordSearch(q, ["codigo", "nombre"]),
    };
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: { codigo: "codigo", nombre: "nombre", estado: "activo" }, defaultSort: "codigo" },
        ({ orderBy, skip, take }) => prisma.warehouse.findMany({ where, orderBy, skip, take }),
        () => prisma.warehouse.count({ where }),
        300
      )
    );
  })
);

const warehouseSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  activo: z.boolean().optional(),
});

warehousesRouter.post(
  "/",
  requirePermission("STKM004"),
  asyncHandler(async (req, res) => {
    const data = warehouseSchema.parse(req.body);
    const warehouse = await prisma.warehouse.create({
      data: { ...data, companyId: req.companyId! },
    });
    res.status(201).json(warehouse);
  })
);

warehousesRouter.put(
  "/:id",
  requirePermission("STKM004"),
  asyncHandler(async (req, res) => {
    const data = warehouseSchema.partial().parse(req.body);
    // Scoping por empresa: solo actualiza si el deposito pertenece a la empresa activa
    const result = await prisma.warehouse.updateMany({
      where: { id: Number(req.params.id), companyId: req.companyId },
      data,
    });
    if (result.count === 0) throw new HttpError(404, "Deposito no encontrado");
    const warehouse = await prisma.warehouse.findUnique({ where: { id: Number(req.params.id) } });
    res.json(warehouse);
  })
);

// Eliminar un deposito. Solo si esta "vacio": sin existencias, sin movimientos
// historicos (kardex) y sin series/IMEI. Se depuran los saldos en cero (filas de
// StockByWarehouse creadas por el catalogo pero sin cantidad) antes de borrar.
warehousesRouter.delete(
  "/:id",
  requirePermission("STKM004"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const warehouse = await prisma.warehouse.findFirst({ where: { id, companyId: req.companyId } });
    if (!warehouse) throw new HttpError(404, "Deposito no encontrado");

    const [stockConSaldo, movimientos, series] = await Promise.all([
      prisma.stockByWarehouse.count({ where: { warehouseId: id, cantidad: { not: 0 } } }),
      prisma.stockMovement.count({ where: { OR: [{ warehouseId: id }, { warehouseDestId: id }] } }),
      prisma.articleSerial.count({ where: { warehouseId: id } }),
    ]);

    if (stockConSaldo > 0) {
      throw new HttpError(409, "No se puede eliminar: el deposito tiene existencias. Transfiere o ajusta el stock a cero primero.");
    }
    if (series > 0) {
      throw new HttpError(409, "No se puede eliminar: el deposito tiene series/IMEI asignadas.");
    }
    if (movimientos > 0) {
      throw new HttpError(409, "No se puede eliminar: el deposito tiene movimientos historicos. Desactivalo en lugar de borrarlo.");
    }

    await prisma.$transaction(async (tx) => {
      // Saldos en cero (sin historial) que quedaron del catalogo: se pueden depurar.
      await tx.stockByWarehouse.deleteMany({ where: { warehouseId: id } });
      await tx.warehouse.delete({ where: { id } });
    });

    res.json({ ok: true });
  })
);

// Consulta de stock por deposito (STKC009)
export const stockRouter = Router();
stockRouter.use(authRequired, companyRequired);

const stockSortable = {
  deposito: "warehouse.nombre",
  codigo: "article.codigo",
  articulo: "article.descripcion",
  cantidad: "cantidad",
  stockMinimo: "article.stockMinimo",
} as const;

// Vista resumida: una fila por articulo (existencia = suma de depositos). No hay
// columna "deposito"; el orden por defecto es articulo.
const summarySortable = {
  codigo: "codigo",
  articulo: "descripcion",
  cantidad: "existencia",
  stockMinimo: "stockMinimo",
} as const;

// Reconstruye el saldo por (articulo, deposito) a una fecha de corte sumando los
// StockMovement hasta esa fecha. OJO: una TRANSFERENCIA se guarda como UNA fila con
// `cantidad` positiva (warehouseId = origen, warehouseDestId = destino), asi que su
// signo NO esta en `cantidad`. Por eso el saldo de un deposito es:
//   saldo(w) = Σ(cantidad | warehouseId=w, tipo≠TRANSF)   (ingresos/egresos ya firmados)
//            − Σ(cantidad | warehouseId=w, tipo=TRANSF)    (salio del origen)
//            + Σ(cantidad | warehouseDestId=w, tipo=TRANSF) (entro al destino)
// Es exacto porque todo el stock pasa unicamente por applyStockMovement/applyTransfer.
async function reconstruirSaldosAFecha(baseWhere: Record<string, unknown>) {
  const [noTransf, transfOut, transfIn] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ["articleId", "warehouseId"],
      where: { ...baseWhere, tipo: { not: "TRANSFERENCIA" } },
      _sum: { cantidad: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["articleId", "warehouseId"],
      where: { ...baseWhere, tipo: "TRANSFERENCIA" },
      _sum: { cantidad: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["articleId", "warehouseDestId"],
      where: { ...baseWhere, tipo: "TRANSFERENCIA" },
      _sum: { cantidad: true },
    }),
  ]);

  // Map<"articleId|warehouseId", saldo>
  const bal = new Map<string, number>();
  const add = (articleId: number, warehouseId: number | null, v: number) => {
    if (warehouseId == null) return;
    const k = `${articleId}|${warehouseId}`;
    bal.set(k, (bal.get(k) ?? 0) + v);
  };
  for (const g of noTransf) add(g.articleId, g.warehouseId, Number(g._sum.cantidad ?? 0));
  for (const g of transfOut) add(g.articleId, g.warehouseId, -Number(g._sum.cantidad ?? 0));
  for (const g of transfIn) add(g.articleId, g.warehouseDestId, Number(g._sum.cantidad ?? 0));
  return bal;
}

// Ordena en memoria (para las vistas resumido/historico, que no salen de un findMany
// directo) y pagina. `comparadores` mapea la clave de columna publica a su comparador.
function ordenarYPaginar<T>(
  rows: T[],
  query: Record<string, unknown>,
  sortable: Record<string, string>,
  defaultSort: string,
  comparadores: Record<string, (a: T, b: T) => number>
) {
  const { page, pageSize, sort, dir } = parseListParams(query, { sortable, defaultSort });
  const factor = dir === "asc" ? 1 : -1;
  const cmp = comparadores[sort] ?? comparadores[defaultSort];
  rows.sort((a, b) => factor * cmp(a, b));
  const total = rows.length;
  const items = rows.slice((page - 1) * pageSize, page * pageSize);
  return paginated(items, total, page, pageSize);
}

stockRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
    const articleId = req.query.articleId ? Number(req.query.articleId) : undefined;
    const brandId = req.query.brandId ? Number(req.query.brandId) : undefined;
    const rubroId = req.query.rubroId ? Number(req.query.rubroId) : undefined;
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined; // "Clasificacion"
    const q = (req.query.q as string | undefined)?.trim();
    // Existencia cero: por defecto false (compat con el listado legacy /stock?warehouseId=..
    // que consume la pantalla de transferencias). La UI nueva lo envia explicito.
    const soloConStock = (req.query.soloConStock as string | undefined) === "true";
    const resumido = (req.query.resumido as string | undefined) === "true";
    // Fecha de corte: si esta presente, se reconstruye el saldo historico.
    const hasta = (req.query.hasta as string | undefined)?.trim();

    // Filtro por atributos del articulo (marca / rubro / clasificacion), como relacion.
    const articleAttrWhere = {
      ...(brandId ? { brandId } : {}),
      ...(rubroId ? { rubroId } : {}),
      ...(categoryId ? { categoryId } : {}),
    };
    const hasArticleAttrs = Object.keys(articleAttrWhere).length > 0;

    // ---- Modo HISTORICO (con fecha de corte) --------------------------------
    if (hasta) {
      const hastaExclusivo = new Date(new Date(hasta).getTime() + 24 * 60 * 60 * 1000);
      const baseWhere = {
        companyId,
        fecha: { lt: hastaExclusivo },
        ...(hasArticleAttrs ? { article: articleAttrWhere } : {}),
        ...buildWordSearch(q, ["article.codigo", "article.descripcion"]),
      };
      const bal = await reconstruirSaldosAFecha(baseWhere);

      // Metadatos de articulos y depositos involucrados.
      const articleIds = new Set<number>();
      const whIds = new Set<number>();
      for (const key of bal.keys()) {
        const [aId, wId] = key.split("|").map(Number);
        articleIds.add(aId);
        whIds.add(wId);
      }
      const [articles, whs] = await Promise.all([
        prisma.article.findMany({
          where: { id: { in: [...articleIds] } },
          select: { id: true, codigo: true, descripcion: true, stockMinimo: true },
        }),
        prisma.warehouse.findMany({
          where: { id: { in: [...whIds] }, companyId },
          select: { id: true, codigo: true, nombre: true },
        }),
      ]);
      const aMap = new Map(articles.map((a) => [a.id, a]));
      const wMap = new Map(whs.map((w) => [w.id, w]));

      if (resumido) {
        // Una fila por articulo: suma los saldos de sus depositos (acotado a la empresa
        // y, si se pidio, a un deposito puntual).
        const porArticulo = new Map<number, number>();
        for (const [key, saldo] of bal) {
          const [aId, wId] = key.split("|").map(Number);
          if (!wMap.has(wId)) continue; // deposito de otra empresa: fuera de alcance
          if (warehouseId && wId !== warehouseId) continue;
          porArticulo.set(aId, (porArticulo.get(aId) ?? 0) + saldo);
        }
        let rows = [...porArticulo.entries()]
          .map(([aId, existencia]) => {
            const a = aMap.get(aId);
            return a
              ? { articleId: aId, codigo: a.codigo, descripcion: a.descripcion, existencia, stockMinimo: Number(a.stockMinimo) }
              : null;
          })
          .filter((r): r is NonNullable<typeof r> => r != null);
        if (soloConStock) rows = rows.filter((r) => r.existencia !== 0);
        return res.json(
          ordenarYPaginar(rows, req.query, summarySortable, "articulo", {
            codigo: (a, b) => a.codigo.localeCompare(b.codigo, "es"),
            articulo: (a, b) => a.descripcion.localeCompare(b.descripcion, "es"),
            cantidad: (a, b) => a.existencia - b.existencia,
            stockMinimo: (a, b) => a.stockMinimo - b.stockMinimo,
          })
        );
      }

      // Detallado: una fila por (articulo, deposito).
      let rows = [...bal.entries()]
        .map(([key, cantidad]) => {
          const [aId, wId] = key.split("|").map(Number);
          const a = aMap.get(aId);
          const w = wMap.get(wId);
          if (!a || !w) return null; // deposito fuera de alcance de la empresa
          if (warehouseId && wId !== warehouseId) return null;
          return {
            id: 0, // sin fila de StockByWarehouse; la key unica es articulo+deposito
            cantidad: String(cantidad),
            article: { id: a.id, codigo: a.codigo, descripcion: a.descripcion, stockMinimo: String(a.stockMinimo) },
            warehouse: w,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r != null);
      if (soloConStock) rows = rows.filter((r) => Number(r.cantidad) !== 0);
      return res.json(
        ordenarYPaginar(rows, req.query, stockSortable, "articulo", {
          deposito: (a, b) => a.warehouse.nombre.localeCompare(b.warehouse.nombre, "es"),
          codigo: (a, b) => a.article.codigo.localeCompare(b.article.codigo, "es"),
          articulo: (a, b) => a.article.descripcion.localeCompare(b.article.descripcion, "es"),
          cantidad: (a, b) => Number(a.cantidad) - Number(b.cantidad),
          stockMinimo: (a, b) => Number(a.article.stockMinimo) - Number(b.article.stockMinimo),
        })
      );
    }

    // ---- Modo RESUMIDO actual (sin fecha de corte) --------------------------
    if (resumido) {
      const stockWhere = {
        warehouse: { companyId },
        ...(warehouseId ? { warehouseId } : {}),
      };
      const CAP = 5000;
      const articles = await prisma.article.findMany({
        where: {
          ...articleAttrWhere,
          ...buildWordSearch(q, ["codigo", "descripcion"]),
          ...(soloConStock ? { stocks: { some: { ...stockWhere, cantidad: { not: 0 } } } } : {}),
        },
        select: {
          id: true,
          codigo: true,
          descripcion: true,
          stockMinimo: true,
          stocks: { where: stockWhere, select: { cantidad: true } },
        },
        take: CAP,
      });
      let rows = articles.map((a) => ({
        articleId: a.id,
        codigo: a.codigo,
        descripcion: a.descripcion,
        existencia: a.stocks.reduce((acc, s) => acc + Number(s.cantidad), 0),
        stockMinimo: Number(a.stockMinimo),
      }));
      if (soloConStock) rows = rows.filter((r) => r.existencia !== 0);
      return res.json(
        ordenarYPaginar(rows, req.query, summarySortable, "articulo", {
          codigo: (a, b) => a.codigo.localeCompare(b.codigo, "es"),
          articulo: (a, b) => a.descripcion.localeCompare(b.descripcion, "es"),
          cantidad: (a, b) => a.existencia - b.existencia,
          stockMinimo: (a, b) => a.stockMinimo - b.stockMinimo,
        })
      );
    }

    // ---- Modo DETALLADO actual (sin fecha de corte) — fast path Prisma ------
    const where = {
      warehouse: { companyId },
      ...(warehouseId ? { warehouseId } : {}),
      ...(articleId ? { articleId } : {}),
      ...(soloConStock ? { cantidad: { not: 0 } } : {}),
      ...(hasArticleAttrs ? { article: articleAttrWhere } : {}),
      ...buildWordSearch(q, ["article.codigo", "article.descripcion"]),
    };
    const include = {
      article: { select: { id: true, codigo: true, descripcion: true, stockMinimo: true } },
      warehouse: { select: { id: true, codigo: true, nombre: true } },
    };
    const { skip, take, orderBy, page, pageSize } = parseListParams(req.query, {
      sortable: stockSortable,
      defaultSort: "articulo",
    });

    if (!wantsPagination(req.query)) {
      const rows = await prisma.stockByWarehouse.findMany({
        where,
        include,
        orderBy: [{ warehouseId: "asc" }, { article: { descripcion: "asc" } }],
        take: 500,
      });
      return res.json(rows);
    }

    const [items, total] = await prisma.$transaction([
      prisma.stockByWarehouse.findMany({ where, include, orderBy, skip, take }),
      prisma.stockByWarehouse.count({ where }),
    ]);
    res.json(paginated(items, total, page, pageSize));
  })
);

// Ajuste manual de inventario (STKI006)
const adjustmentSchema = z.object({
  warehouseId: z.number().int(),
  observacion: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        articleId: z.number().int(),
        tipo: z.enum(["INGRESO", "EGRESO"]),
        cantidad: z.number().positive(),
        costoUnitario: z.number().nonnegative().optional().nullable(),
      })
    )
    .min(1, "Agrega al menos un articulo"),
});

stockRouter.post(
  "/adjustments",
  requirePermission("STKI006"),
  asyncHandler(async (req, res) => {
    const data = adjustmentSchema.parse(req.body);
    const companyId = req.companyId!;

    // Validar que el deposito pertenezca a la empresa
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: data.warehouseId, companyId },
    });
    if (!warehouse) throw new HttpError(400, "Deposito invalido para la empresa");

    const loteId = randomUUID();
    await prisma.$transaction(async (tx) => {
      for (const item of data.items) {
        const signo = item.tipo === "INGRESO" ? 1 : -1;
        await applyStockMovement(tx, {
          companyId,
          articleId: item.articleId,
          warehouseId: data.warehouseId,
          cantidad: signo * item.cantidad,
          tipo: "AJUSTE",
          costoUnitario: item.costoUnitario ?? null,
          origenTipo: "AJUSTE",
          loteId,
          observacion: data.observacion ?? null,
          usuarioId: req.auth?.userId ?? null,
        });
      }
    });

    res.status(201).json({ ok: true, movimientos: data.items.length });
  })
);

// Transferencia entre depositos (STKI005)
const transferSchema = z.object({
  fromWarehouseId: z.number().int(),
  toWarehouseId: z.number().int(),
  observacion: z.string().optional().nullable(),
  items: z
    .array(z.object({ articleId: z.number().int(), cantidad: z.number().positive() }))
    .min(1, "Agrega al menos un articulo"),
});

stockRouter.post(
  "/transfers",
  requirePermission("STKI005"),
  asyncHandler(async (req, res) => {
    const d = transferSchema.parse(req.body);
    const companyId = req.companyId!;
    if (d.fromWarehouseId === d.toWarehouseId) throw new HttpError(400, "El origen y el destino deben ser distintos");

    const [from, to] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: d.fromWarehouseId, companyId } }),
      prisma.warehouse.findFirst({ where: { id: d.toWarehouseId, companyId } }),
    ]);
    if (!from || !to) throw new HttpError(400, "Deposito invalido para la empresa");

    const loteId = randomUUID();
    try {
      await prisma.$transaction(async (tx) => {
        for (const item of d.items) {
          await applyTransfer(tx, {
            companyId,
            articleId: item.articleId,
            fromWarehouseId: d.fromWarehouseId,
            toWarehouseId: d.toWarehouseId,
            cantidad: item.cantidad,
            loteId,
            observacion: d.observacion ?? null,
            usuarioId: req.auth?.userId ?? null,
          });
        }
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }

    res.status(201).json({ ok: true, movimientos: d.items.length });
  })
);

// Historial de movimientos de stock (kardex) — STKC012.
// Filtrable por deposito (origen o destino), tipo, rango de fechas y busqueda de
// articulo. Enriquece cada registro con articulo, deposito origen/destino y usuario.
const movementsSortable = {
  fecha: "fecha",
  tipo: "tipo",
  cantidad: "cantidad",
  articulo: "article.descripcion",
} as const;

const MOV_TIPOS = ["INGRESO", "EGRESO", "TRANSFERENCIA", "AJUSTE"] as const;

stockRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const q = (req.query.q as string | undefined)?.trim();
    const articleId = req.query.articleId ? Number(req.query.articleId) : undefined;
    const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
    const tipoRaw = (req.query.tipo as string | undefined)?.trim();
    const tipo = tipoRaw && (MOV_TIPOS as readonly string[]).includes(tipoRaw) ? tipoRaw : undefined;
    const desde = (req.query.desde as string | undefined)?.trim();
    const hasta = (req.query.hasta as string | undefined)?.trim();
    // loteId: trae las lineas de un "movimiento" (lote) puntual, para su detalle.
    const loteId = (req.query.loteId as string | undefined)?.trim();

    // Rango de fechas: `hasta` es inclusivo (hasta el fin de ese dia).
    let fechaFilter: { gte?: Date; lt?: Date } | undefined;
    if (desde || hasta) {
      fechaFilter = {};
      if (desde) fechaFilter.gte = new Date(desde);
      if (hasta) fechaFilter.lt = new Date(new Date(hasta).getTime() + 24 * 60 * 60 * 1000);
    }

    const where = {
      companyId,
      ...(articleId ? { articleId } : {}),
      ...(loteId ? { loteId } : {}),
      ...(tipo ? { tipo: tipo as (typeof MOV_TIPOS)[number] } : {}),
      // Un deposito puede aparecer como origen (warehouseId) o destino (warehouseDestId).
      ...(warehouseId ? { OR: [{ warehouseId }, { warehouseDestId: warehouseId }] } : {}),
      ...(fechaFilter ? { fecha: fechaFilter } : {}),
      ...buildWordSearch(q, ["article.codigo", "article.descripcion"]),
    };

    const { skip, take, orderBy, page, pageSize } = parseListParams(req.query, {
      sortable: movementsSortable,
      defaultSort: "fecha",
      defaultDir: "desc",
    });
    const include = { article: { select: { id: true, codigo: true, descripcion: true } } };

    const fetchRows = (opts: { orderBy: Record<string, unknown>; skip: number; take: number }) =>
      prisma.stockMovement.findMany({ where, include, ...opts });

    const paginate = wantsPagination(req.query);
    const [rows, total] = paginate
      ? await prisma.$transaction([
          prisma.stockMovement.findMany({ where, include, orderBy, skip, take }),
          prisma.stockMovement.count({ where }),
        ])
      : [await fetchRows({ orderBy, skip: 0, take: 200 }), 0];

    // Nombres de depositos (StockMovement guarda solo los IDs, sin relacion).
    const whIds = new Set<number>();
    for (const r of rows) {
      whIds.add(r.warehouseId);
      if (r.warehouseDestId) whIds.add(r.warehouseDestId);
    }
    const whs = await prisma.warehouse.findMany({
      where: { id: { in: [...whIds] } },
      select: { id: true, codigo: true, nombre: true },
    });
    const whMap = new Map(whs.map((w) => [w.id, w]));

    const userIds = [...new Set(rows.map((r) => r.usuarioId).filter((x): x is number => x != null))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.nombre]));

    const items = rows.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      tipo: r.tipo,
      cantidad: r.cantidad,
      costoUnitario: r.costoUnitario,
      origenTipo: r.origenTipo,
      observacion: r.observacion,
      article: r.article,
      origen: whMap.get(r.warehouseId) ?? null,
      destino: r.warehouseDestId ? whMap.get(r.warehouseDestId) ?? null : null,
      usuario: r.usuarioId ? userMap.get(r.usuarioId) ?? null : null,
    }));

    res.json(paginate ? paginated(items, total, page, pageSize) : items);
  })
);

// Historial de movimientos AGRUPADOS por lote (STKC012). Un "movimiento" es el conjunto
// de lineas creadas en la misma operacion, identificadas por `loteId` (uuid asignado al
// crear la transferencia/ajuste/compra/venta/nota). Cada fila resume el lote (nro de
// articulos + cantidad total); el detalle de lineas se pide a /movements?loteId=...
// Como todas las lineas de un lote comparten tipo/deposito/usuario/observacion, esos
// campos se agrupan junto al loteId y la fecha se toma como la del primer registro.
stockRouter.get(
  "/movement-batches",
  asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const q = (req.query.q as string | undefined)?.trim();
    const articleId = req.query.articleId ? Number(req.query.articleId) : undefined;
    const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
    const tipoRaw = (req.query.tipo as string | undefined)?.trim();
    const tipo = tipoRaw && (MOV_TIPOS as readonly string[]).includes(tipoRaw) ? tipoRaw : undefined;
    const desde = (req.query.desde as string | undefined)?.trim();
    const hasta = (req.query.hasta as string | undefined)?.trim();

    let fechaFilter: { gte?: Date; lt?: Date } | undefined;
    if (desde || hasta) {
      fechaFilter = {};
      if (desde) fechaFilter.gte = new Date(desde);
      if (hasta) fechaFilter.lt = new Date(new Date(hasta).getTime() + 24 * 60 * 60 * 1000);
    }

    const baseWhere = {
      companyId,
      loteId: { not: null },
      ...(tipo ? { tipo: tipo as (typeof MOV_TIPOS)[number] } : {}),
      ...(warehouseId ? { OR: [{ warehouseId }, { warehouseDestId: warehouseId }] } : {}),
      ...(fechaFilter ? { fecha: fechaFilter } : {}),
    };

    // Filtro por articulo (especifico o texto): selecciona los lotes que CONTIENEN ese
    // articulo y luego resume el lote completo (todos sus articulos), no solo la linea
    // que matcheo. Por eso se resuelven primero los loteId que califican.
    const articuloFilter = { ...(articleId ? { articleId } : {}), ...buildWordSearch(q, ["article.codigo", "article.descripcion"]) };
    let where: Record<string, unknown> = baseWhere;
    if (articleId || q) {
      const matching = await prisma.stockMovement.findMany({
        where: { ...baseWhere, ...articuloFilter },
        select: { loteId: true },
        distinct: ["loteId"],
      });
      const loteIds = matching.map((m) => m.loteId).filter((x): x is string => x != null);
      where = { companyId, loteId: { in: loteIds } };
    }

    const { skip, take, page, pageSize, dir } = parseListParams(req.query, {
      sortable: { fecha: "fecha" },
      defaultSort: "fecha",
      defaultDir: "desc",
    });

    // Una pagina de lotes + total de lotes distintos (la 2da consulta trae solo el
    // loteId; es liviana comparada con traer todas las lineas). Se ordena por la fecha
    // del primer registro de cada lote, respetando la direccion pedida.
    const groups = await prisma.stockMovement.groupBy({
      by: ["loteId", "tipo", "warehouseId", "warehouseDestId", "usuarioId", "observacion"],
      where,
      _count: { _all: true },
      _sum: { cantidad: true },
      _min: { fecha: true },
      orderBy: { _min: { fecha: dir } },
      skip,
      take,
    });
    const allGroups = await prisma.stockMovement.groupBy({ by: ["loteId"], where });
    const total = allGroups.length;

    // Nombres de depositos y usuarios (StockMovement guarda solo IDs).
    const whIds = new Set<number>();
    for (const g of groups) {
      whIds.add(g.warehouseId);
      if (g.warehouseDestId) whIds.add(g.warehouseDestId);
    }
    const whs = await prisma.warehouse.findMany({
      where: { id: { in: [...whIds] } },
      select: { id: true, codigo: true, nombre: true },
    });
    const whMap = new Map(whs.map((w) => [w.id, w]));

    const userIds = [...new Set(groups.map((g) => g.usuarioId).filter((x): x is number => x != null))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.nombre]));

    const items = groups.map((g) => ({
      loteId: g.loteId,
      fecha: g._min.fecha,
      tipo: g.tipo,
      origen: whMap.get(g.warehouseId) ?? null,
      destino: g.warehouseDestId ? whMap.get(g.warehouseDestId) ?? null : null,
      usuario: g.usuarioId ? userMap.get(g.usuarioId) ?? null : null,
      observacion: g.observacion,
      articulos: g._count._all,
      cantidadTotal: g._sum.cantidad ?? 0,
    }));

    res.json(paginated(items, total, page, pageSize));
  })
);

// Historial de compras de un articulo (STKL010): proveedor, fecha, costo + resumen
stockRouter.get(
  "/purchase-history",
  asyncHandler(async (req, res) => {
    const articleId = Number(req.query.articleId);
    if (!articleId) throw new HttpError(400, "Falta articleId");
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, codigo: true, descripcion: true, costoActual: true },
    });
    if (!article) throw new HttpError(404, "Articulo no encontrado");

    const items = await prisma.purchaseInvoiceItem.findMany({
      where: { articleId, invoice: { companyId: req.companyId, estado: { not: "ANULADO" } } },
      include: { invoice: { select: { fecha: true, nroComprobante: true, supplierId: true } } },
      orderBy: { invoice: { fecha: "desc" } },
      take: 300,
    });

    const supIds = [...new Set(items.map((i) => i.invoice.supplierId))];
    const sups = await prisma.supplier.findMany({
      where: { id: { in: supIds } },
      select: { id: true, person: { select: { razonSocial: true } } },
    });
    const supName = new Map(sups.map((s) => [s.id, s.person.razonSocial]));

    const compras = items.map((i) => ({
      fecha: i.invoice.fecha,
      nroComprobante: i.invoice.nroComprobante,
      proveedorId: i.invoice.supplierId,
      proveedor: supName.get(i.invoice.supplierId) ?? "-",
      cantidad: i.cantidad,
      costoUnitario: i.costoUnitario,
    }));

    const costos = compras.map((c) => Number(c.costoUnitario));
    const resumen = compras.length
      ? {
          compras: compras.length,
          ultimoCosto: Number(compras[0].costoUnitario),
          costoPromedio: Math.round(costos.reduce((a, b) => a + b, 0) / costos.length),
          costoMin: Math.min(...costos),
          costoMax: Math.max(...costos),
        }
      : { compras: 0, ultimoCosto: 0, costoPromedio: 0, costoMin: 0, costoMax: 0 };

    // Ultimo costo por proveedor (compras ya viene ordenado por fecha desc)
    const porProvMap = new Map<number, { proveedor: string; ultimoCosto: number; fecha: Date; compras: number }>();
    for (const c of compras) {
      const ex = porProvMap.get(c.proveedorId);
      if (!ex) porProvMap.set(c.proveedorId, { proveedor: c.proveedor, ultimoCosto: Number(c.costoUnitario), fecha: c.fecha, compras: 1 });
      else ex.compras += 1;
    }
    const porProveedor = [...porProvMap.values()].sort((a, b) => a.ultimoCosto - b.ultimoCosto);

    res.json({ article, resumen, compras, porProveedor });
  })
);

// Historial de costos de un articulo (STKC011)
stockRouter.get(
  "/cost-history",
  asyncHandler(async (req, res) => {
    const articleId = Number(req.query.articleId);
    if (!articleId) throw new HttpError(400, "Falta articleId");
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, codigo: true, descripcion: true, costoActual: true },
    });
    if (!article) throw new HttpError(404, "Articulo no encontrado");
    const rows = await prisma.articleCostHistory.findMany({
      where: { articleId },
      orderBy: { fecha: "desc" },
      take: 200,
      select: { id: true, costo: true, moneda: true, origenTipo: true, origenId: true, fecha: true },
    });

    // Enriquecer las entradas de COMPRA con proveedor / comprobante / cantidad
    const compraIds = [...new Set(rows.filter((h) => h.origenTipo === "COMPRA" && h.origenId).map((h) => h.origenId!))];
    const [invoices, items] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where: { id: { in: compraIds } },
        select: { id: true, nroComprobante: true, supplier: { select: { person: { select: { razonSocial: true } } } } },
      }),
      prisma.purchaseInvoiceItem.findMany({
        where: { articleId, invoiceId: { in: compraIds } },
        select: { invoiceId: true, cantidad: true },
      }),
    ]);
    const invMap = new Map(invoices.map((i) => [i.id, { nroComprobante: i.nroComprobante, proveedor: i.supplier.person.razonSocial }]));
    const qtyMap = new Map(items.map((it) => [it.invoiceId, it.cantidad]));

    const historial = rows.map((h) => {
      const inv = h.origenId ? invMap.get(h.origenId) : undefined;
      return {
        id: h.id,
        fecha: h.fecha,
        costo: h.costo,
        moneda: h.moneda,
        origenTipo: h.origenTipo,
        proveedor: inv?.proveedor ?? null,
        nroComprobante: inv?.nroComprobante ?? null,
        cantidad: (h.origenId ? qtyMap.get(h.origenId) : null) ?? null,
      };
    });
    res.json({ article, historial });
  })
);

// Costo promedio con existencias (STKC030): una fila por articulo con la existencia
// total (suma de saldos en los depositos de la empresa), el costo promedio actual y
// el valorizado (existencia x costo). Filtrable por marca, deposito y busqueda.
// Adaptacion mono-moneda del STKM030 legacy (este ERP no maneja moneda extranjera
// ni periodos mensuales de stock, por eso esas columnas del legacy no aplican).
const costExistenceSortable = {
  codigo: "codigo",
  articulo: "descripcion",
  marca: "marca",
  existencia: "existencia",
  costo: "costo",
  valorizado: "valorizado",
} as const;

interface CostExistenceRow {
  articleId: number;
  codigo: string;
  descripcion: string;
  marca: string | null;
  existencia: number;
  costo: number;
  valorizado: number;
}

stockRouter.get(
  "/cost-existence",
  asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const brandId = req.query.brandId ? Number(req.query.brandId) : undefined;
    const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
    const q = (req.query.q as string | undefined)?.trim();
    // "con existencias": por defecto solo articulos con existencia distinta de cero.
    const soloConStock = (req.query.soloConStock as string | undefined) !== "false";

    // Alcance de stock: saldos de los depositos de la empresa activa (y, si se pide,
    // de un solo deposito). Article es un catalogo global; el scope por empresa vive
    // en el deposito.
    const stockWhere = {
      warehouse: { companyId },
      ...(warehouseId ? { warehouseId } : {}),
    };

    const articleWhere = {
      ...(brandId ? { brandId } : {}),
      ...buildWordSearch(q, ["codigo", "descripcion"]),
      // Con "solo con stock" exigimos al menos un saldo dentro del alcance.
      ...(soloConStock ? { stocks: { some: stockWhere } } : {}),
    };

    // Traemos los articulos que matchean junto con sus saldos ya acotados al alcance.
    // Cap defensivo: el catalogo por empresa es acotado; si se superara, se trunca.
    const CAP = 5000;
    const articles = await prisma.article.findMany({
      where: articleWhere,
      select: {
        id: true,
        codigo: true,
        descripcion: true,
        costoActual: true,
        brand: { select: { nombre: true } },
        stocks: { where: stockWhere, select: { cantidad: true } },
      },
      take: CAP,
    });

    // Agregacion por articulo + filtro final por existencia (un saldo puede ser 0).
    let rows: CostExistenceRow[] = articles.map((a) => {
      const existencia = a.stocks.reduce((acc, s) => acc + Number(s.cantidad), 0);
      const costo = Number(a.costoActual);
      return {
        articleId: a.id,
        codigo: a.codigo,
        descripcion: a.descripcion,
        marca: a.brand?.nombre ?? null,
        existencia,
        costo,
        valorizado: existencia * costo,
      };
    });
    if (soloConStock) rows = rows.filter((r) => r.existencia !== 0);

    // Orden en memoria: existencia/valorizado son calculados (no columnas de Prisma),
    // asi que ordenamos todo aca por consistencia.
    const { page, pageSize, sort, dir } = parseListParams(req.query, {
      sortable: costExistenceSortable,
      defaultSort: "articulo",
    });
    const factor = dir === "asc" ? 1 : -1;
    const comparadores: Record<string, (a: CostExistenceRow, b: CostExistenceRow) => number> = {
      codigo: (a, b) => a.codigo.localeCompare(b.codigo, "es"),
      articulo: (a, b) => a.descripcion.localeCompare(b.descripcion, "es"),
      marca: (a, b) => (a.marca ?? "").localeCompare(b.marca ?? "", "es"),
      existencia: (a, b) => a.existencia - b.existencia,
      costo: (a, b) => a.costo - b.costo,
      valorizado: (a, b) => a.valorizado - b.valorizado,
    };
    rows.sort((a, b) => factor * comparadores[sort](a, b));

    const total = rows.length;
    const items = rows.slice((page - 1) * pageSize, page * pageSize);
    res.json(paginated(items, total, page, pageSize));
  })
);
