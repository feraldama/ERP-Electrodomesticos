import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { createSupplierPayment } from "../services/payments.js";

// =====================================================================
// PAGOS A PROVEEDORES (a cuenta del saldo; las compras no generan cuotas)
// =====================================================================
export const pagosRouter = Router();
pagosRouter.use(authRequired, companyRequired);

const paymentSchema = z.object({
  supplierId: z.number().int(),
  fecha: z.string().min(1),
  metodo: z.enum(["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"]).default("EFECTIVO"),
  monto: z.number().positive(),
  observacion: z.string().optional().nullable(),
});

pagosRouter.post(
  "/",
  requirePermission("FINI006"),
  asyncHandler(async (req, res) => {
    const d = paymentSchema.parse(req.body);
    const companyId = req.companyId!;

    const supplier = await prisma.supplier.findFirst({ where: { id: d.supplierId, activo: true } });
    if (!supplier) throw new HttpError(400, "Proveedor invalido");

    let payment;
    try {
      payment = await prisma.$transaction((tx) =>
        createSupplierPayment(tx, {
          companyId,
          supplierId: d.supplierId,
          fecha: new Date(d.fecha),
          metodo: d.metodo,
          monto: d.monto,
          observacion: d.observacion ?? null,
          usuarioId: req.auth?.userId ?? null,
        })
      );
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }

    res.status(201).json(payment);
  })
);

// Historial de pagos (con nombre del proveedor resuelto aparte)
pagosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagos = await prisma.paymentMade.findMany({
      where: { companyId: req.companyId },
      orderBy: { fecha: "desc" },
      take: 200,
    });
    const supplierIds = [...new Set(pagos.map((p) => p.supplierId))];
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, person: { select: { razonSocial: true } } },
    });
    const nombre = new Map(suppliers.map((s) => [s.id, s.person.razonSocial]));
    res.json(pagos.map((p) => ({ ...p, proveedorNombre: nombre.get(p.supplierId) ?? null })));
  })
);
