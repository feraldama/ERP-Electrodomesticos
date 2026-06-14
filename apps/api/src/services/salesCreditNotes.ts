import type { Prisma } from "@prisma/client";
import { applyStockMovement } from "./stock.js";
import { desglosarIvaIncluido } from "./iva.js";

export interface CreditNoteItemInput {
  articleId: number;
  cantidad: number;
  precioUnitario: number; // con IVA incluido
}

export interface CreateSalesCreditNoteInput {
  companyId: number;
  invoiceId: number;
  fecha: Date;
  motivo?: string | null;
  usuarioId?: number | null;
  warehouseId?: number; // requerido si hay items (reingreso de stock)
  items?: CreditNoteItemInput[]; // si vacio -> NC por monto
  montoManual?: number; // NC por monto (sin items)
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
 * Crea una nota de credito de venta. Dos modos:
 *  - con items: devuelve articulos de la factura original -> reingresa stock y
 *    calcula el total con IVA desglosado por item (tope: lo vendido menos lo ya
 *    acreditado en NCs previas).
 *  - por monto: sin items (descuento/error) -> sin stock, IVA prorrateado segun
 *    la composicion de la factura (tope: saldo creditable de la factura).
 * En ambos casos acredita la cuenta corriente del cliente (haber = total) y
 * encola el evento contable. Devuelve la NC creada.
 */
export async function createSalesCreditNote(prisma: Prisma.TransactionClient, input: CreateSalesCreditNoteInput) {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: input.invoiceId, companyId: input.companyId },
    include: { items: true },
  });
  if (!invoice) throw new Error("Factura no encontrada");
  if (invoice.estado === "ANULADO") throw new Error("La factura esta anulada");

  // Lo ya acreditado por NCs previas (total y por articulo)
  const prevNotes = await prisma.salesCreditNote.findMany({
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
  const computed: Array<{ articleId: number; cantidad: number; precioUnitario: number; ivaTipo: "IVA10" | "IVA5" | "EXENTA"; total: number }> = [];

  if (hasItems) {
    if (!input.warehouseId) throw new Error("Indica el deposito para reingresar el stock devuelto");
    for (const it of items) {
      const invItem = invoice.items.find((x) => x.articleId === it.articleId);
      if (!invItem) throw new Error("Un articulo no pertenece a la factura original");
      if (it.cantidad <= 0) throw new Error("Las cantidades deben ser mayores a cero");
      const vendido = Number(invItem.cantidad);
      const yaCred = creditadoQty.get(it.articleId) ?? 0;
      const restante = vendido - yaCred;
      if (it.cantidad > restante + 1e-6) {
        throw new Error(`No se puede devolver mas de lo vendido (restante ${restante})`);
      }
      const ivaTipo = invItem.ivaTipo;
      const bruto = r(it.cantidad * it.precioUnitario);
      const { neto, iva } = desglosarIvaIncluido(bruto, ivaTipo);
      if (ivaTipo === "IVA10") { subtotal10 += neto; iva10 += iva; }
      else if (ivaTipo === "IVA5") { subtotal5 += neto; iva5 += iva; }
      else subtotalExenta += bruto;
      computed.push({ articleId: it.articleId, cantidad: it.cantidad, precioUnitario: it.precioUnitario, ivaTipo, total: bruto });
    }
    total = subtotalExenta + subtotal5 + subtotal10 + iva5 + iva10;
  } else {
    const monto = r(input.montoManual ?? 0);
    if (monto <= 0) throw new Error("Ingresa el monto de la nota de credito");
    if (!input.motivo || !input.motivo.trim()) throw new Error("Indica el motivo de la nota de credito por monto");
    const creditableRestante = Number(invoice.total) - creditadoTotalPrev;
    if (monto > creditableRestante + 1e-6) {
      throw new Error(`El monto supera lo que queda por acreditar de la factura (${r(creditableRestante)})`);
    }
    // Prorrateo del monto segun la composicion (bruto) de la factura por tasa de IVA
    const grossExenta = Number(invoice.subtotalExenta);
    const gross5 = Number(invoice.subtotal5) + Number(invoice.iva5);
    const gross10 = Number(invoice.subtotal10) + Number(invoice.iva10);
    const [mE, m5, m10] = allocate(monto, [grossExenta, gross5, gross10]);
    subtotalExenta = mE;
    const d5 = desglosarIvaIncluido(m5, "IVA5"); subtotal5 = d5.neto; iva5 = d5.iva;
    const d10 = desglosarIvaIncluido(m10, "IVA10"); subtotal10 = d10.neto; iva10 = d10.iva;
    total = monto;
  }

  // Numero de NC: secuencial por empresa (SIFEN/punto de NC queda pendiente)
  const count = await prisma.salesCreditNote.count({ where: { companyId: input.companyId } });
  const numero = String(count + 1).padStart(7, "0");

  const nc = await prisma.salesCreditNote.create({
    data: {
      companyId: input.companyId,
      invoiceId: invoice.id,
      warehouseId: hasItems ? input.warehouseId : null,
      numero,
      fecha: input.fecha,
      motivo: input.motivo ?? null,
      conStock: hasItems,
      subtotalExenta, subtotal5, subtotal10, iva5, iva10, total,
      usuarioId: input.usuarioId ?? null,
      items: hasItems
        ? { create: computed.map((c) => ({ articleId: c.articleId, cantidad: c.cantidad, precioUnitario: c.precioUnitario, ivaTipo: c.ivaTipo, total: c.total })) }
        : undefined,
    },
  });

  // Reingreso de stock por cada item devuelto
  if (hasItems) {
    for (const c of computed) {
      await applyStockMovement(prisma, {
        companyId: input.companyId,
        articleId: c.articleId,
        warehouseId: input.warehouseId!,
        cantidad: c.cantidad, // ingreso
        tipo: "INGRESO",
        origenTipo: "NOTA_CREDITO",
        origenId: nc.id,
        observacion: `NC venta ${numero}`,
        usuarioId: input.usuarioId ?? null,
      });
    }
  }

  // Cuenta corriente cliente: haber = total (reduce lo que debe / genera saldo a favor)
  await prisma.customerAccountEntry.create({
    data: {
      companyId: input.companyId,
      customerId: invoice.customerId,
      concepto: `Nota de credito ${numero}`,
      haber: total,
      origenTipo: "NOTA_CREDITO",
      origenId: nc.id,
    },
  });

  // Evento contable
  await prisma.accountingEvent.create({
    data: {
      companyId: input.companyId,
      tipo: "NOTA_CREDITO_VENTA",
      origenTipo: "NOTA_CREDITO",
      origenId: nc.id,
      payload: { numero, invoiceId: invoice.id, total, conStock: hasItems, subtotalExenta, subtotal5, subtotal10, iva5, iva10 },
    },
  });

  return { ...nc, numero };
}
