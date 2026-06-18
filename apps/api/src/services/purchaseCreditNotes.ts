import type { Prisma } from "@prisma/client";
import { applyStockMovement } from "./stock.js";
import { desglosarIvaIncluido } from "./iva.js";

export interface PurchaseCreditNoteItemInput {
  articleId: number;
  cantidad: number;
  costoUnitario: number; // con IVA incluido (como en la compra)
}

export interface CreatePurchaseCreditNoteInput {
  companyId: number;
  invoiceId: number;
  nroComprobante: string; // nro de la NC del proveedor (documento recibido)
  fecha: Date;
  motivo?: string | null;
  usuarioId?: number | null;
  warehouseId?: number; // requerido si hay items (egreso de stock)
  items?: PurchaseCreditNoteItemInput[];
  montoManual?: number;
}

const r = (n: number) => Math.round(n);

function allocate(amount: number, weights: number[]): number[] {
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const out = weights.map((w) => Math.floor((amount * w) / totalW));
  let rem = amount - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rem > 0 && out.length; i = (i + 1) % out.length) {
    out[i] += 1;
    rem -= 1;
  }
  return out;
}

/**
 * Crea una nota de credito de compra (recibida del proveedor). Dos modos:
 *  - con items: devuelve articulos al proveedor -> egreso de stock; total con IVA
 *    desglosado por item (tope: comprado menos lo ya acreditado en NCs previas).
 *  - por monto: sin items (descuento/error) -> sin stock; IVA prorrateado segun la
 *    composicion de la compra (tope: saldo creditable de la compra).
 * En ambos casos registra el debe en la cuenta del proveedor (reduce lo que
 * debemos) y encola el evento contable. Devuelve la NC creada.
 */
export async function createPurchaseCreditNote(prisma: Prisma.TransactionClient, input: CreatePurchaseCreditNoteInput) {
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: input.invoiceId, companyId: input.companyId },
    include: { items: true },
  });
  if (!invoice) throw new Error("Compra no encontrada");
  if (invoice.estado === "ANULADO") throw new Error("La compra esta anulada");

  const prevNotes = await prisma.purchaseCreditNote.findMany({
    where: { invoiceId: invoice.id, companyId: input.companyId },
    include: { items: true },
  });
  const creditadoTotalPrev = prevNotes.reduce((s, n) => s + Number(n.total), 0);
  const creditadoQty = new Map<number, number>();
  for (const n of prevNotes)
    for (const it of n.items)
      creditadoQty.set(it.articleId, (creditadoQty.get(it.articleId) ?? 0) + Number(it.cantidad));

  const items = input.items ?? [];
  const hasItems = items.length > 0;

  let subtotalExenta = 0, subtotal5 = 0, subtotal10 = 0, iva5 = 0, iva10 = 0, total = 0;
  const computed: Array<{ articleId: number; cantidad: number; costoUnitario: number; ivaTipo: "IVA10" | "IVA5" | "EXENTA"; total: number }> = [];

  if (hasItems) {
    if (!input.warehouseId) throw new Error("Indica el deposito desde donde sale el stock devuelto");
    for (const it of items) {
      const invItem = invoice.items.find((x) => x.articleId === it.articleId);
      if (!invItem) throw new Error("Un articulo no pertenece a la compra original");
      if (it.cantidad <= 0) throw new Error("Las cantidades deben ser mayores a cero");
      const comprado = Number(invItem.cantidad);
      const yaCred = creditadoQty.get(it.articleId) ?? 0;
      const restante = comprado - yaCred;
      if (it.cantidad > restante + 1e-6) {
        throw new Error(`No se puede devolver mas de lo comprado (restante ${restante})`);
      }
      const ivaTipo = invItem.ivaTipo;
      const bruto = r(it.cantidad * it.costoUnitario);
      const { neto, iva } = desglosarIvaIncluido(bruto, ivaTipo);
      if (ivaTipo === "IVA10") { subtotal10 += neto; iva10 += iva; }
      else if (ivaTipo === "IVA5") { subtotal5 += neto; iva5 += iva; }
      else subtotalExenta += bruto;
      computed.push({ articleId: it.articleId, cantidad: it.cantidad, costoUnitario: it.costoUnitario, ivaTipo, total: bruto });
    }
    total = subtotalExenta + subtotal5 + subtotal10 + iva5 + iva10;
  } else {
    const monto = r(input.montoManual ?? 0);
    if (monto <= 0) throw new Error("Ingresa el monto de la nota de credito");
    if (!input.motivo || !input.motivo.trim()) throw new Error("Indica el motivo de la nota de credito por monto");
    const creditableRestante = Number(invoice.total) - creditadoTotalPrev;
    if (monto > creditableRestante + 1e-6) {
      throw new Error(`El monto supera lo que queda por acreditar de la compra (${r(creditableRestante)})`);
    }
    const grossExenta = Number(invoice.subtotalExenta);
    const gross5 = Number(invoice.subtotal5) + Number(invoice.iva5);
    const gross10 = Number(invoice.subtotal10) + Number(invoice.iva10);
    const [mE, m5, m10] = allocate(monto, [grossExenta, gross5, gross10]);
    subtotalExenta = mE;
    const d5 = desglosarIvaIncluido(m5, "IVA5"); subtotal5 = d5.neto; iva5 = d5.iva;
    const d10 = desglosarIvaIncluido(m10, "IVA10"); subtotal10 = d10.neto; iva10 = d10.iva;
    total = monto;
  }

  const nc = await prisma.purchaseCreditNote.create({
    data: {
      companyId: input.companyId,
      supplierId: invoice.supplierId,
      invoiceId: invoice.id,
      warehouseId: hasItems ? input.warehouseId : null,
      nroComprobante: input.nroComprobante,
      fecha: input.fecha,
      motivo: input.motivo ?? null,
      conStock: hasItems,
      subtotalExenta, subtotal5, subtotal10, iva5, iva10, total,
      usuarioId: input.usuarioId ?? null,
      items: hasItems
        ? { create: computed.map((c) => ({ articleId: c.articleId, cantidad: c.cantidad, costoUnitario: c.costoUnitario, ivaTipo: c.ivaTipo, total: c.total })) }
        : undefined,
    },
  });

  // Egreso de stock (los articulos vuelven al proveedor)
  if (hasItems) {
    for (const c of computed) {
      await applyStockMovement(prisma, {
        companyId: input.companyId,
        articleId: c.articleId,
        warehouseId: input.warehouseId!,
        cantidad: -c.cantidad, // egreso
        tipo: "EGRESO",
        costoUnitario: c.costoUnitario,
        origenTipo: "NOTA_CREDITO_COMPRA",
        origenId: nc.id,
        observacion: `NC compra ${input.nroComprobante}`,
        usuarioId: input.usuarioId ?? null,
      });
    }
  }

  // Cuenta corriente proveedor: debe = total (reduce lo que debemos)
  await prisma.supplierAccountEntry.create({
    data: {
      companyId: input.companyId,
      supplierId: invoice.supplierId,
      concepto: `Nota de credito ${input.nroComprobante}`,
      debe: total,
      origenTipo: "NOTA_CREDITO_COMPRA",
      origenId: nc.id,
    },
  });

  await prisma.accountingEvent.create({
    data: {
      companyId: input.companyId,
      tipo: "NOTA_CREDITO_COMPRA",
      origenTipo: "NOTA_CREDITO_COMPRA",
      origenId: nc.id,
      payload: { nroComprobante: input.nroComprobante, fecha: nc.fecha, invoiceId: invoice.id, total, conStock: hasItems, subtotalExenta, subtotal5, subtotal10, iva5, iva10 },
    },
  });

  return nc;
}
