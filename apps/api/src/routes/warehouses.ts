import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { applyStockMovement, applyTransfer } from "../services/stock.js";
import { requirePermission } from "../middleware/permission.js";
import { parseListParams, paginated, wantsPagination, listOrPaginate } from "../lib/listQuery.js";

// Depositos (por empresa)
export const warehousesRouter = Router();
warehousesRouter.use(authRequired, companyRequired);

warehousesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = {
      companyId: req.companyId,
      ...(q
        ? {
            OR: [
              { codigo: { contains: q, mode: "insensitive" as const } },
              { nombre: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
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

stockRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
    const q = (req.query.q as string | undefined)?.trim();

    const where = {
      warehouse: { companyId: req.companyId },
      ...(warehouseId ? { warehouseId } : {}),
      ...(q
        ? {
            article: {
              OR: [
                { codigo: { contains: q, mode: "insensitive" as const } },
                { descripcion: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
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

    try {
      await prisma.$transaction(async (tx) => {
        for (const item of d.items) {
          await applyTransfer(tx, {
            companyId,
            articleId: item.articleId,
            fromWarehouseId: d.fromWarehouseId,
            toWarehouseId: d.toWarehouseId,
            cantidad: item.cantidad,
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

// Historial de movimientos de un articulo (kardex simple)
stockRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const articleId = req.query.articleId ? Number(req.query.articleId) : undefined;
    const rows = await prisma.stockMovement.findMany({
      where: { companyId: req.companyId, ...(articleId ? { articleId } : {}) },
      orderBy: { fecha: "desc" },
      take: 200,
    });
    res.json(rows);
  })
);
