import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";

// =====================================================================
// ESTADO DE CUENTA DEL CLIENTE (cuenta corriente: debe/haber + saldo)
// =====================================================================
export const cuentaClienteRouter = Router();
cuentaClienteRouter.use(authRequired, companyRequired);

cuentaClienteRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const customerId = Number(req.query.customerId);
    if (!customerId) throw new HttpError(400, "Falta customerId");

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { person: { select: { razonSocial: true, ruc: true, nroDoc: true } } },
    });
    if (!customer) throw new HttpError(404, "Cliente no encontrado");

    const entries = await prisma.customerAccountEntry.findMany({
      where: { companyId: req.companyId, customerId },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });

    // Saldo corriente acumulado (debe suma, haber resta)
    let saldo = 0;
    let totalDebe = 0;
    let totalHaber = 0;
    const movimientos = entries.map((e) => {
      const debe = Number(e.debe);
      const haber = Number(e.haber);
      totalDebe += debe;
      totalHaber += haber;
      saldo += debe - haber;
      return {
        id: e.id,
        fecha: e.fecha,
        concepto: e.concepto,
        origenTipo: e.origenTipo,
        origenId: e.origenId,
        debe: e.debe,
        haber: e.haber,
        saldo,
      };
    });

    // Cuotas pendientes (proximos vencimientos)
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
    const montoPendiente = cuotas.reduce((s, c) => s + (Number(c.montoCuota) - Number(c.montoPagado)), 0);

    res.json({
      customer: {
        id: customer.id,
        razonSocial: customer.person.razonSocial,
        documento: customer.person.ruc ?? customer.person.nroDoc,
        limiteCredito: customer.limiteCredito,
        diasCredito: customer.diasCredito,
      },
      resumen: {
        totalDebe,
        totalHaber,
        saldo,
        cuotasPendientes: cuotas.length,
        montoPendiente,
      },
      movimientos,
      cuotas,
    });
  })
);
