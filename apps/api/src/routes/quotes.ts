import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { createQuote } from "../services/quotes.js";

// =====================================================================
// PRESUPUESTOS / COTIZACIONES DE VENTA (VENI003)
// =====================================================================
export const presupuestosRouter = Router();
presupuestosRouter.use(authRequired, companyRequired);

function nroComp(i: { establecimiento: string; puntoExpedicion: string; numero: string }) {
  return `${i.establecimiento}-${i.puntoExpedicion}-${i.numero}`;
}

const quoteSchema = z.object({
  customerId: z.number().int(),
  priceListId: z.number().int().optional().nullable(),
  fecha: z.string().min(1),
  validezDias: z.number().int().positive().optional(),
  observacion: z.string().optional().nullable(),
  items: z
    .array(z.object({ articleId: z.number().int(), cantidad: z.number().positive(), precioUnitario: z.number().nonnegative() }))
    .min(1, "Agrega al menos un articulo"),
});

presupuestosRouter.post(
  "/",
  requirePermission("VENI003"),
  asyncHandler(async (req, res) => {
    const d = quoteSchema.parse(req.body);
    const customer = await prisma.customer.findFirst({ where: { id: d.customerId, activo: true } });
    if (!customer) throw new HttpError(400, "Cliente invalido");
    const quote = await prisma.$transaction((tx) =>
      createQuote(tx, {
        companyId: req.companyId!,
        customerId: d.customerId,
        priceListId: d.priceListId ?? null,
        fecha: new Date(d.fecha),
        validezDias: d.validezDias,
        observacion: d.observacion ?? null,
        usuarioId: req.auth?.userId ?? null,
        items: d.items,
      })
    );
    res.status(201).json(quote);
  })
);

presupuestosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const presupuestos = await prisma.salesQuote.findMany({
      where: { companyId: req.companyId },
      include: {
        customer: { include: { person: { select: { razonSocial: true } } } },
        priceList: { select: { nombre: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(presupuestos);
  })
);

presupuestosRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, "Presupuesto no encontrado");
    const presupuesto = await prisma.salesQuote.findFirst({
      where: { id, companyId: req.companyId },
      include: {
        customer: { include: { person: true } },
        priceList: true,
        items: { include: { article: { select: { codigo: true, descripcion: true } } } },
      },
    });
    if (!presupuesto) throw new HttpError(404, "Presupuesto no encontrado");
    res.json(presupuesto);
  })
);

// Cambiar estado (anular / marcar convertido tras generar la venta)
async function setEstado(req: import("express").Request, res: import("express").Response, estado: "ANULADO" | "CONVERTIDO") {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(404, "Presupuesto no encontrado");
  const result = await prisma.salesQuote.updateMany({ where: { id, companyId: req.companyId }, data: { estado } });
  if (result.count === 0) throw new HttpError(404, "Presupuesto no encontrado");
  res.json({ ok: true });
}

presupuestosRouter.post("/:id/anular", requirePermission("VENI003"), asyncHandler((req, res) => setEstado(req, res, "ANULADO")));
presupuestosRouter.post("/:id/convertir", requirePermission("VENI003"), asyncHandler((req, res) => setEstado(req, res, "CONVERTIDO")));

export { nroComp };
