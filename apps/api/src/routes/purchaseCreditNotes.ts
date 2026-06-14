import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { createPurchaseCreditNote } from "../services/purchaseCreditNotes.js";

// =====================================================================
// NOTAS DE CREDITO DE COMPRA (recibidas; con o sin devolucion de stock)
// =====================================================================
export const notasCreditoCompraRouter = Router();
notasCreditoCompraRouter.use(authRequired, companyRequired);

// Info acreditable de una compra: items con comprado / acreditado / restante.
notasCreditoCompraRouter.get(
  "/creditable",
  asyncHandler(async (req, res) => {
    const invoiceId = Number(req.query.invoiceId);
    if (!invoiceId) throw new HttpError(400, "Falta invoiceId");

    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: invoiceId, companyId: req.companyId },
      include: {
        items: { include: { article: { select: { codigo: true, descripcion: true } } } },
        supplier: { include: { person: { select: { razonSocial: true } } } },
      },
    });
    if (!invoice) throw new HttpError(404, "Compra no encontrada");

    const prevNotes = await prisma.purchaseCreditNote.findMany({
      where: { invoiceId, companyId: req.companyId },
      include: { items: true },
    });
    const creditadoTotal = prevNotes.reduce((s, n) => s + Number(n.total), 0);
    const creditadoQty = new Map<number, number>();
    for (const n of prevNotes)
      for (const it of n.items)
        creditadoQty.set(it.articleId, (creditadoQty.get(it.articleId) ?? 0) + Number(it.cantidad));

    res.json({
      invoice: {
        id: invoice.id,
        nroComprobante: invoice.nroComprobante,
        fecha: invoice.fecha,
        condicion: invoice.condicion,
        total: invoice.total,
        proveedor: invoice.supplier.person.razonSocial,
      },
      items: invoice.items.map((it) => {
        const comprado = Number(it.cantidad);
        const acreditado = creditadoQty.get(it.articleId) ?? 0;
        return {
          articleId: it.articleId,
          codigo: it.article.codigo,
          descripcion: it.article.descripcion,
          ivaTipo: it.ivaTipo,
          costoUnitario: it.costoUnitario,
          comprado,
          acreditado,
          restante: comprado - acreditado,
        };
      }),
      creditadoTotal,
      creditableRestante: Number(invoice.total) - creditadoTotal,
    });
  })
);

const ncSchema = z.object({
  invoiceId: z.number().int(),
  nroComprobante: z.string().min(1, "Ingresa el nro de la NC del proveedor"),
  fecha: z.string().min(1),
  motivo: z.string().optional().nullable(),
  warehouseId: z.number().int().optional(),
  items: z
    .array(z.object({ articleId: z.number().int(), cantidad: z.number().positive(), costoUnitario: z.number().nonnegative() }))
    .optional(),
  montoManual: z.number().nonnegative().optional(),
});

notasCreditoCompraRouter.post(
  "/",
  requirePermission("COMI002"),
  asyncHandler(async (req, res) => {
    const d = ncSchema.parse(req.body);
    const companyId = req.companyId!;

    if (d.warehouseId) {
      const wh = await prisma.warehouse.findFirst({ where: { id: d.warehouseId, companyId } });
      if (!wh) throw new HttpError(400, "Deposito invalido para la empresa");
    }

    let nc;
    try {
      nc = await prisma.$transaction((tx) =>
        createPurchaseCreditNote(tx, {
          companyId,
          invoiceId: d.invoiceId,
          nroComprobante: d.nroComprobante.trim(),
          fecha: new Date(d.fecha),
          motivo: d.motivo ?? null,
          usuarioId: req.auth?.userId ?? null,
          warehouseId: d.warehouseId,
          items: d.items,
          montoManual: d.montoManual,
        })
      );
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }

    res.status(201).json(nc);
  })
);

notasCreditoCompraRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const notas = await prisma.purchaseCreditNote.findMany({
      where: { companyId: req.companyId },
      include: { invoice: { select: { nroComprobante: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(notas);
  })
);
