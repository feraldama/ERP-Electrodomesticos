import type { IvaTipo, Prisma } from "@prisma/client";
import { applyStockMovement } from "./stock.js";
import { desglosarIvaIncluido } from "./iva.js";

export interface PurchaseItemInput {
  articleId: number;
  cantidad: number;
  costoUnitario: number; // con IVA incluido (como figura en la factura)
  ivaTipo: IvaTipo;
}

export interface CreatePurchaseInput {
  companyId: number;
  supplierId: number;
  warehouseId: number;
  nroComprobante: string;
  timbrado?: string | null;
  fecha: Date;
  condicion: "CONTADO" | "CREDITO";
  moneda?: string;
  observacion?: string | null;
  usuarioId?: number | null;
  items: PurchaseItemInput[];
}

// Redondeo a entero (Guaranies sin decimales)
const r = (n: number) => Math.round(n);

/**
 * Crea una compra y, en una sola transaccion:
 *  1) registra la factura y su detalle
 *  2) ingresa stock al deposito (applyStockMovement)
 *  3) actualiza el costo del articulo + historial de costos
 *  4) genera la cuenta por pagar al proveedor (cuenta corriente)
 *  5) encola el evento contable
 */
export async function createPurchase(prisma: Prisma.TransactionClient, input: CreatePurchaseInput) {
  // --- Calculo de totales (costo neto + IVA) ---
  let subtotalExenta = 0;
  let subtotal5 = 0;
  let subtotal10 = 0;
  let iva5 = 0;
  let iva10 = 0;

  const computed = input.items.map((it) => {
    // costoUnitario viene con IVA incluido -> el total de linea (bruto) tambien
    const bruto = r(it.cantidad * it.costoUnitario);
    const { neto, iva } = desglosarIvaIncluido(bruto, it.ivaTipo);
    if (it.ivaTipo === "IVA10") {
      subtotal10 += neto;
      iva10 += iva;
    } else if (it.ivaTipo === "IVA5") {
      subtotal5 += neto;
      iva5 += iva;
    } else {
      subtotalExenta += bruto;
    }
    return { ...it, neto, iva, totalLinea: bruto };
  });

  const total = subtotalExenta + subtotal5 + subtotal10 + iva5 + iva10;

  // --- 1) Cabecera + detalle ---
  const invoice = await prisma.purchaseInvoice.create({
    data: {
      companyId: input.companyId,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      timbrado: input.timbrado ?? null,
      nroComprobante: input.nroComprobante,
      fecha: input.fecha,
      condicion: input.condicion,
      moneda: input.moneda ?? "PYG",
      subtotalExenta,
      subtotal5,
      subtotal10,
      iva5,
      iva10,
      total,
      estado: "CONFIRMADO",
      observacion: input.observacion ?? null,
      usuarioId: input.usuarioId ?? null,
      items: {
        create: computed.map((c) => ({
          articleId: c.articleId,
          cantidad: c.cantidad,
          costoUnitario: c.costoUnitario,
          ivaTipo: c.ivaTipo,
          total: c.totalLinea,
        })),
      },
    },
  });

  // --- 2,3) Stock + costo por cada item ---
  for (const c of computed) {
    await applyStockMovement(prisma, {
      companyId: input.companyId,
      articleId: c.articleId,
      warehouseId: input.warehouseId,
      cantidad: c.cantidad, // ingreso
      tipo: "INGRESO",
      costoUnitario: c.costoUnitario,
      origenTipo: "COMPRA",
      origenId: invoice.id,
      observacion: `Compra ${input.nroComprobante}`,
      usuarioId: input.usuarioId ?? null,
    });

    // Costo actual = ultimo costo de compra (neto) + historial
    await prisma.article.update({
      where: { id: c.articleId },
      data: { costoActual: c.costoUnitario },
    });
    await prisma.articleCostHistory.create({
      data: {
        articleId: c.articleId,
        costo: c.costoUnitario,
        moneda: input.moneda ?? "PYG",
        origenTipo: "COMPRA",
        origenId: invoice.id,
      },
    });
  }

  // --- 4) Cuenta corriente proveedor (haber = lo que debemos) ---
  await prisma.supplierAccountEntry.create({
    data: {
      companyId: input.companyId,
      supplierId: input.supplierId,
      concepto: `Compra ${input.nroComprobante}`,
      haber: total,
      origenTipo: "COMPRA",
      origenId: invoice.id,
    },
  });

  // --- 5) Evento contable (lo procesa el modulo de contabilidad luego) ---
  await prisma.accountingEvent.create({
    data: {
      companyId: input.companyId,
      tipo: "COMPRA",
      origenTipo: "COMPRA",
      origenId: invoice.id,
      payload: {
        nroComprobante: input.nroComprobante,
        condicion: input.condicion,
        subtotalExenta,
        subtotal5,
        subtotal10,
        iva5,
        iva10,
        total,
      },
    },
  });

  return invoice;
}
