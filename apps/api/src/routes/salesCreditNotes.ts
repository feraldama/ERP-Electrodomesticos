import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { createSalesCreditNote } from "../services/salesCreditNotes.js";

// =====================================================================
// NOTAS DE CREDITO DE VENTA (con o sin devolucion de stock)
// =====================================================================
export const notasCreditoVentaRouter = Router();
notasCreditoVentaRouter.use(authRequired, companyRequired);

function nroComp(i: { establecimiento: string; puntoExpedicion: string; numero: string }) {
  return `${i.establecimiento}-${i.puntoExpedicion}-${i.numero}`;
}

// Info acreditable de una factura: items con vendido / acreditado / restante.
notasCreditoVentaRouter.get(
  "/creditable",
  asyncHandler(async (req, res) => {
    const invoiceId = Number(req.query.invoiceId);
    if (!invoiceId) throw new HttpError(400, "Falta invoiceId");

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: invoiceId, companyId: req.companyId },
      include: {
        items: { include: { article: { select: { codigo: true, descripcion: true, controlaSerie: true } } } },
        customer: { include: { person: { select: { razonSocial: true } } } },
      },
    });
    if (!invoice) throw new HttpError(404, "Factura no encontrada");

    const prevNotes = await prisma.salesCreditNote.findMany({
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
        nroComprobante: nroComp(invoice),
        fecha: invoice.fecha,
        condicion: invoice.condicion,
        total: invoice.total,
        cliente: invoice.customer.person.razonSocial,
      },
      items: invoice.items.map((it) => {
        const vendido = Number(it.cantidad);
        const acreditado = creditadoQty.get(it.articleId) ?? 0;
        return {
          articleId: it.articleId,
          codigo: it.article.codigo,
          descripcion: it.article.descripcion,
          controlaSerie: it.article.controlaSerie,
          ivaTipo: it.ivaTipo,
          precioUnitario: it.precioUnitario,
          vendido,
          acreditado,
          restante: vendido - acreditado,
        };
      }),
      creditadoTotal,
      creditableRestante: Number(invoice.total) - creditadoTotal,
    });
  })
);

const ncSchema = z.object({
  invoiceId: z.number().int(),
  fecha: z.string().min(1),
  motivo: z.string().optional().nullable(),
  warehouseId: z.number().int().optional(),
  items: z
    .array(
      z.object({
        articleId: z.number().int(),
        cantidad: z.number().positive(),
        precioUnitario: z.number().nonnegative(),
        series: z.array(z.string()).optional(),
      })
    )
    .optional(),
  montoManual: z.number().nonnegative().optional(),
});

notasCreditoVentaRouter.post(
  "/",
  requirePermission("VENI004"),
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
        createSalesCreditNote(tx, {
          companyId,
          invoiceId: d.invoiceId,
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

// Listado de notas de credito
notasCreditoVentaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const notas = await prisma.salesCreditNote.findMany({
      where: { companyId: req.companyId },
      include: { invoice: { select: { establecimiento: true, puntoExpedicion: true, numero: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(notas);
  })
);
