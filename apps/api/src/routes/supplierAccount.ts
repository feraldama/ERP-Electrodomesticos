import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";

// =====================================================================
// CUENTA CORRIENTE PROVEEDOR (debe/haber + saldo a pagar)
// =====================================================================
export const cuentaProveedorRouter = Router();
cuentaProveedorRouter.use(authRequired, companyRequired);

cuentaProveedorRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const supplierId = Number(req.query.supplierId);
    if (!supplierId) throw new HttpError(400, "Falta supplierId");

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: { person: { select: { razonSocial: true, ruc: true, nroDoc: true } } },
    });
    if (!supplier) throw new HttpError(404, "Proveedor no encontrado");

    const entries = await prisma.supplierAccountEntry.findMany({
      where: { companyId: req.companyId, supplierId },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });

    // Para proveedores: haber = lo que debemos, debe = lo que pagamos.
    // Saldo a pagar = haber - debe (positivo = le debemos al proveedor).
    let saldo = 0;
    let totalDebe = 0;
    let totalHaber = 0;
    const movimientos = entries.map((e) => {
      const debe = Number(e.debe);
      const haber = Number(e.haber);
      totalDebe += debe;
      totalHaber += haber;
      saldo += haber - debe;
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

    // Compras a credito (referencia de lo facturado a credito)
    const compras = await prisma.purchaseInvoice.findMany({
      where: { companyId: req.companyId, supplierId, condicion: "CREDITO", estado: { not: "ANULADO" } },
      orderBy: { fecha: "desc" },
      take: 100,
      select: { id: true, nroComprobante: true, fecha: true, total: true },
    });

    res.json({
      supplier: {
        id: supplier.id,
        razonSocial: supplier.person.razonSocial,
        documento: supplier.person.ruc ?? supplier.person.nroDoc,
      },
      resumen: { totalDebe, totalHaber, saldo },
      movimientos,
      compras,
    });
  })
);
