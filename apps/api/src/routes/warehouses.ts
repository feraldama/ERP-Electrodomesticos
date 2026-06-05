import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { applyStockMovement } from "../services/stock.js";

// Depositos (por empresa)
export const warehousesRouter = Router();
warehousesRouter.use(authRequired, companyRequired);

warehousesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const warehouses = await prisma.warehouse.findMany({
      where: { companyId: req.companyId },
      orderBy: { codigo: "asc" },
    });
    res.json(warehouses);
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

stockRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
    const q = (req.query.q as string | undefined)?.trim();

    const rows = await prisma.stockByWarehouse.findMany({
      where: {
        warehouse: { companyId: req.companyId },
        ...(warehouseId ? { warehouseId } : {}),
        ...(q
          ? {
              article: {
                OR: [
                  { codigo: { contains: q, mode: "insensitive" } },
                  { descripcion: { contains: q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: {
        article: { select: { id: true, codigo: true, descripcion: true, stockMinimo: true } },
        warehouse: { select: { id: true, codigo: true, nombre: true } },
      },
      orderBy: [{ warehouseId: "asc" }, { article: { descripcion: "asc" } }],
      take: 500,
    });
    res.json(rows);
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
