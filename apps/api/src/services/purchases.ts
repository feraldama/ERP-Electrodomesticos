import type { IvaTipo, Prisma } from "@prisma/client";
import { applyStockMovement } from "./stock.js";
import { crearSeriesCompra, eliminarSeriesCompra } from "./serials.js";
import { desglosarIvaIncluido } from "./iva.js";

export interface PurchaseItemInput {
  articleId: number;
  cantidad: number;
  costoUnitario: number; // con IVA incluido (como figura en la factura)
  ivaTipo: IvaTipo;
  series?: string[]; // requerido (largo === cantidad) si el articulo controla serie
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

  // --- Validacion de series para articulos que controlan serie/IMEI ---
  const articleIds = [...new Set(input.items.map((i) => i.articleId))];
  const arts = await prisma.article.findMany({
    where: { id: { in: articleIds } },
    select: { id: true, controlaSerie: true, descripcion: true },
  });
  const artById = new Map(arts.map((a) => [a.id, a]));
  for (const it of input.items) {
    const art = artById.get(it.articleId);
    if (art?.controlaSerie) {
      const series = (it.series ?? []).map((s) => s.trim()).filter(Boolean);
      if (!Number.isInteger(it.cantidad) || series.length !== it.cantidad) {
        throw new Error(`Para "${art.descripcion}" carga ${it.cantidad} serie(s)/IMEI (una por unidad)`);
      }
    }
  }

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

    // Series/IMEI de las unidades ingresadas (si el articulo lo controla)
    if (artById.get(c.articleId)?.controlaSerie && c.series?.length) {
      await crearSeriesCompra(prisma, {
        articleId: c.articleId,
        warehouseId: input.warehouseId,
        purchaseInvoiceId: invoice.id,
        series: c.series,
      });
    }
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

export interface AnularPurchaseInput {
  companyId: number;
  invoiceId: number;
  usuarioId?: number | null;
}

/**
 * Anula una compra CONFIRMADA revirtiendo lo que hizo createPurchase: egresa el stock
 * ingresado y revierte la cuenta corriente del proveedor, y encola el evento contable.
 *
 * Guardas: ya anulada, o con notas de credito de compra.
 * Nota: puede dejar stock negativo si la mercaderia ya se uso; NO revierte costoActual.
 */
export async function anularPurchase(prisma: Prisma.TransactionClient, input: AnularPurchaseInput) {
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: input.invoiceId, companyId: input.companyId },
  });
  if (!invoice) throw new Error("Compra no encontrada");
  if (invoice.estado === "ANULADO") throw new Error("La compra ya esta anulada");

  const ncCount = await prisma.purchaseCreditNote.count({ where: { invoiceId: invoice.id } });
  if (ncCount > 0) throw new Error("La compra tiene notas de credito; no se puede anular");

  // Series/IMEI: bloquea si alguna unidad ya salio; si todas EN_STOCK, las elimina.
  await eliminarSeriesCompra(prisma, invoice.id);

  // 1) Egreso de stock: invierte cada movimiento de la compra
  const movs = await prisma.stockMovement.findMany({
    where: { companyId: input.companyId, origenTipo: "COMPRA", origenId: invoice.id },
  });
  for (const m of movs) {
    await applyStockMovement(prisma, {
      companyId: input.companyId,
      articleId: m.articleId,
      warehouseId: m.warehouseId,
      cantidad: -Number(m.cantidad), // invierte el ingreso original
      tipo: "EGRESO",
      costoUnitario: m.costoUnitario != null ? Number(m.costoUnitario) : null,
      origenTipo: "ANULACION_COMPRA",
      origenId: invoice.id,
      observacion: `Anulacion compra ${invoice.nroComprobante}`,
      usuarioId: input.usuarioId ?? null,
    });
  }

  // 2) Cuenta corriente proveedor: inverso del haber original
  await prisma.supplierAccountEntry.create({
    data: {
      companyId: input.companyId,
      supplierId: invoice.supplierId,
      concepto: `Anulacion compra ${invoice.nroComprobante}`,
      debe: invoice.total,
      origenTipo: "ANULACION_COMPRA",
      origenId: invoice.id,
    },
  });

  // 3) Evento contable de reversa
  await prisma.accountingEvent.create({
    data: {
      companyId: input.companyId,
      tipo: "COMPRA_ANULADA",
      origenTipo: "ANULACION_COMPRA",
      origenId: invoice.id,
      payload: {
        nroComprobante: invoice.nroComprobante,
        condicion: invoice.condicion,
        subtotalExenta: invoice.subtotalExenta,
        subtotal5: invoice.subtotal5,
        subtotal10: invoice.subtotal10,
        iva5: invoice.iva5,
        iva10: invoice.iva10,
        total: invoice.total,
      },
    },
  });

  // 4) Estado
  await prisma.purchaseInvoice.update({ where: { id: invoice.id }, data: { estado: "ANULADO" } });

  return { id: invoice.id, nroComprobante: invoice.nroComprobante, estado: "ANULADO" as const };
}
