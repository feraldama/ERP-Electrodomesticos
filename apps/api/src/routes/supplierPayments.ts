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

const paymentSchema = z
  .object({
    supplierId: z.number().int(),
    fecha: z.string().min(1),
    metodo: z.enum(["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA", "CHEQUE"]).default("EFECTIVO"),
    monto: z.number().positive(),
    observacion: z.string().optional().nullable(),
    cheque: z
      .object({
        banco: z.string().optional().nullable(),
        numero: z.string().min(1),
        fechaCobro: z.string().min(1),
      })
      .optional()
      .nullable(),
  })
  .refine((d) => d.metodo !== "CHEQUE" || (d.cheque && d.cheque.numero && d.cheque.fechaCobro), {
    message: "Para pago con cheque indica el numero y la fecha de cobro",
    path: ["cheque"],
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
          cheque: d.cheque
            ? { banco: d.cheque.banco ?? null, numero: d.cheque.numero, fechaCobro: new Date(d.cheque.fechaCobro) }
            : null,
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

// =====================================================================
// CHEQUES EMITIDOS A PROVEEDORES (FINI007)
// =====================================================================
const estadoEnum = z.enum(["PENDIENTE", "COBRADO", "ANULADO", "RECHAZADO"]);

export const chequesRouter = Router();
chequesRouter.use(authRequired, companyRequired);

// Listado de cheques emitidos (con nombre del proveedor y filtro opcional por estado).
chequesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = estadoEnum.safeParse(req.query.estado);
    const estado = parsed.success ? parsed.data : undefined;
    const checks = await prisma.check.findMany({
      where: { companyId: req.companyId, tipo: "EMITIDO", ...(estado ? { estado } : {}) },
      orderBy: [{ estado: "asc" }, { fechaCobro: "asc" }],
      include: { paymentMade: { select: { supplierId: true } } },
      take: 500,
    });
    const supplierIds = [...new Set(checks.map((c) => c.paymentMade?.supplierId).filter((x): x is number => !!x))];
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, person: { select: { razonSocial: true } } },
    });
    const nombre = new Map(suppliers.map((s) => [s.id, s.person.razonSocial]));
    res.json(
      checks.map((c) => ({ ...c, proveedorNombre: c.paymentMade ? nombre.get(c.paymentMade.supplierId) ?? null : null }))
    );
  })
);

// Cambia el estado de un cheque PENDIENTE.
//  - COBRADO: el banco lo debito (no afecta la cuenta del proveedor: el pago ya valia).
//  - RECHAZADO/ANULADO: el pago no se concreto -> REPONE la deuda al proveedor (haber)
//    y encola la reversa contable.
chequesRouter.put(
  "/:id/estado",
  requirePermission("FINI007"),
  asyncHandler(async (req, res) => {
    const { estado } = z.object({ estado: estadoEnum }).parse(req.body);
    const id = Number(req.params.id);
    const cheque = await prisma.check.findFirst({ where: { id, companyId: req.companyId, tipo: "EMITIDO" } });
    if (!cheque) throw new HttpError(404, "Cheque no encontrado");
    if (cheque.estado !== "PENDIENTE") throw new HttpError(400, "Solo se puede cambiar un cheque pendiente");

    const repone = estado === "RECHAZADO" || estado === "ANULADO";
    const pm = repone && cheque.paymentMadeId
      ? await prisma.paymentMade.findUnique({ where: { id: cheque.paymentMadeId } })
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.check.update({ where: { id }, data: { estado } });
      if (repone && pm) {
        const monto = Number(cheque.monto);
        await tx.supplierAccountEntry.create({
          data: {
            companyId: req.companyId!,
            supplierId: pm.supplierId,
            concepto: `Cheque ${estado === "RECHAZADO" ? "rechazado" : "anulado"} ${cheque.numero}`,
            haber: monto, // repone lo que debemos
            origenTipo: "CHEQUE_REVERSA",
            origenId: cheque.id,
          },
        });
        await tx.accountingEvent.create({
          data: {
            companyId: req.companyId!,
            tipo: "PAGO_ANULADO",
            origenTipo: "CHEQUE_REVERSA",
            origenId: cheque.id,
            payload: { montoTotal: monto, numero: cheque.numero },
          },
        });
      }
    });
    res.json({ ok: true });
  })
);
