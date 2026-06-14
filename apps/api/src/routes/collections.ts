import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { createCollection } from "../services/payments.js";

// =====================================================================
// COBROS DE CUOTAS (pagos recibidos de clientes, aplicados a cuotas)
// =====================================================================
export const cobrosRouter = Router();
cobrosRouter.use(authRequired, companyRequired);

// Cuotas pendientes de un cliente (para aplicar el cobro)
cobrosRouter.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const customerId = Number(req.query.customerId);
    if (!customerId) throw new HttpError(400, "Falta customerId");

    const cuotas = await prisma.installment.findMany({
      where: {
        companyId: req.companyId,
        estado: { not: "PAGADA" },
        invoice: { customerId, estado: { not: "ANULADO" } },
      },
      orderBy: { fechaVencimiento: "asc" },
      select: {
        id: true,
        nroCuota: true,
        fechaVencimiento: true,
        montoCuota: true,
        montoPagado: true,
        estado: true,
        invoice: { select: { id: true, establecimiento: true, puntoExpedicion: true, numero: true } },
      },
    });
    res.json(cuotas);
  })
);

const collectionSchema = z.object({
  customerId: z.number().int(),
  fecha: z.string().min(1),
  metodo: z.enum(["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"]).default("EFECTIVO"),
  observacion: z.string().optional().nullable(),
  allocations: z
    .array(z.object({ installmentId: z.number().int(), monto: z.number().positive() }))
    .min(1, "Selecciona al menos una cuota"),
});

cobrosRouter.post(
  "/",
  requirePermission("FINI005"),
  asyncHandler(async (req, res) => {
    const d = collectionSchema.parse(req.body);
    const companyId = req.companyId!;

    const customer = await prisma.customer.findFirst({ where: { id: d.customerId, activo: true } });
    if (!customer) throw new HttpError(400, "Cliente invalido");

    let payment;
    try {
      payment = await prisma.$transaction((tx) =>
        createCollection(tx, {
          companyId,
          customerId: d.customerId,
          fecha: new Date(d.fecha),
          metodo: d.metodo,
          observacion: d.observacion ?? null,
          usuarioId: req.auth?.userId ?? null,
          allocations: d.allocations,
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

// Historial de cobros de la empresa (con el nombre del cliente resuelto aparte,
// ya que PaymentReceived guarda customerId pero no define la relacion).
cobrosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const cobros = await prisma.paymentReceived.findMany({
      where: { companyId: req.companyId },
      include: { allocations: true },
      orderBy: { fecha: "desc" },
      take: 200,
    });
    const customerIds = [...new Set(cobros.map((c) => c.customerId))];
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, person: { select: { razonSocial: true } } },
    });
    const nombre = new Map(customers.map((c) => [c.id, c.person.razonSocial]));
    res.json(cobros.map((c) => ({ ...c, clienteNombre: nombre.get(c.customerId) ?? null })));
  })
);
