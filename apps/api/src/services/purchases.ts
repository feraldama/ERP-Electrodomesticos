import { randomUUID } from "node:crypto";
import type { IvaTipo, Prisma } from "@prisma/client";
import { applyStockMovement } from "./stock.js";
import { crearSeriesCompra, eliminarSeriesCompra } from "./serials.js";
import { desglosarIvaIncluido } from "./iva.js";
import { agruparPorCategoria, assertPeriodoAbierto } from "./accounting.js";

export interface PurchaseItemInput {
  articleId: number;
  cantidad: number; // unidades que ingresan (compradas + bonificadas)
  cantidadBonificada?: number; // sin cargo, incluidas en cantidad
  costoUnitario: number; // precio por unidad comprada, con IVA incluido (como figura en la factura)
  descuento?: number; // descuento de la linea en Gs (con IVA)
  ivaTipo: IvaTipo;
  // Importe de la linea (con IVA) por tasa. Si viene, manda sobre costo x cantidad - descuento
  // y permite que un mismo articulo tenga una parte gravada y otra exenta.
  importes?: Partial<Record<IvaTipo, number>>;
  series?: string[]; // requerido (largo === cantidad) si el articulo controla serie
}

export interface CreatePurchaseInput {
  companyId: number;
  supplierId: number;
  branchId?: number | null;
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

const TASAS: IvaTipo[] = ["IVA10", "IVA5", "EXENTA"];

export interface ParteIva {
  ivaTipo: IvaTipo;
  total: number; // con IVA
}

/**
 * Partes por tasa de un item de compra grabado. Los items anteriores al detalle por
 * tasa (importes en 0) se toman enteros en su `ivaTipo`.
 */
export function partesIvaItem(it: {
  ivaTipo: IvaTipo;
  total: Prisma.Decimal | number;
  importe10: Prisma.Decimal | number;
  importe5: Prisma.Decimal | number;
  importeExenta: Prisma.Decimal | number;
}): ParteIva[] {
  const partes = [
    { ivaTipo: "IVA10" as const, total: Number(it.importe10) },
    { ivaTipo: "IVA5" as const, total: Number(it.importe5) },
    { ivaTipo: "EXENTA" as const, total: Number(it.importeExenta) },
  ].filter((p) => p.total > 0);
  return partes.length ? partes : [{ ivaTipo: it.ivaTipo, total: Number(it.total) }];
}

const importeDe = (partes: ParteIva[], t: IvaTipo) => partes.find((p) => p.ivaTipo === t)?.total ?? 0;

/**
 * Crea una compra y, en una sola transaccion:
 *  1) registra la factura y su detalle
 *  2) ingresa stock al deposito (applyStockMovement)
 *  3) actualiza el costo del articulo + historial de costos
 *  4) genera la cuenta por pagar al proveedor (cuenta corriente)
 *  5) encola el evento contable
 */
export async function createPurchase(prisma: Prisma.TransactionClient, input: CreatePurchaseInput) {
  // Antes de grabar: un ejercicio cerrado no admite la operacion (su asiento nunca se postearia).
  await assertPeriodoAbierto(prisma, input.companyId, input.fecha);

  // --- Calculo de totales (costo neto + IVA) ---
  let subtotalExenta = 0;
  let subtotal5 = 0;
  let subtotal10 = 0;
  let iva5 = 0;
  let iva10 = 0;

  const computed = input.items.map((it) => {
    // costoUnitario viene con IVA incluido -> el total de linea (bruto) tambien.
    // Se cobran solo las unidades compradas (no las bonificadas), menos el descuento.
    const bonificada = it.cantidadBonificada ?? 0;
    const descuento = it.descuento ?? 0;
    const comprada = it.cantidad - bonificada;
    if (bonificada < 0 || comprada < 0) throw new Error("La cantidad bonificada no puede superar la cantidad de la linea");

    // Importe de la linea por tasa (con IVA)
    let partes: ParteIva[];
    if (it.importes) {
      if (TASAS.some((t) => (it.importes?.[t] ?? 0) < 0)) throw new Error("Los importes de la linea no pueden ser negativos");
      partes = TASAS.map((t) => ({ ivaTipo: t, total: r(it.importes?.[t] ?? 0) })).filter((p) => p.total > 0);
    } else {
      const b = r(comprada * it.costoUnitario - descuento);
      if (b < 0) throw new Error("El descuento no puede superar el importe de la linea");
      partes = b > 0 ? [{ ivaTipo: it.ivaTipo, total: b }] : [];
    }
    const bruto = partes.reduce((s, p) => s + p.total, 0);

    let neto = 0;
    let iva = 0;
    for (const p of partes) {
      const d = desglosarIvaIncluido(p.total, p.ivaTipo);
      neto += d.neto;
      iva += d.iva;
      if (p.ivaTipo === "IVA10") {
        subtotal10 += d.neto;
        iva10 += d.iva;
      } else if (p.ivaTipo === "IVA5") {
        subtotal5 += d.neto;
        iva5 += d.iva;
      } else {
        subtotalExenta += p.total;
      }
    }
    // Tasa predominante (la de mayor importe), para listados que muestran una sola.
    const ivaTipo = partes.length ? partes.reduce((a, b) => (b.total > a.total ? b : a)).ivaTipo : it.ivaTipo;
    // Costo efectivo por unidad ingresada (con IVA): es el que se guarda y valoriza el stock.
    const costoUnitario = it.cantidad !== 0 ? Math.round((bruto / it.cantidad) * 10000) / 10000 : 0;
    return { ...it, ivaTipo, partes, costoUnitario, bonificada, descuento, neto, iva, totalLinea: bruto };
  });

  const total = subtotalExenta + subtotal5 + subtotal10 + iva5 + iva10;

  // --- Validacion de series para articulos que controlan serie/IMEI ---
  const articleIds = [...new Set(input.items.map((i) => i.articleId))];
  const arts = await prisma.article.findMany({
    where: { id: { in: articleIds } },
    select: { id: true, controlaSerie: true, descripcion: true, categoryId: true },
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
      branchId: input.branchId ?? null,
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
          cantidadBonificada: c.bonificada,
          costoUnitario: c.costoUnitario,
          descuento: c.descuento,
          ivaTipo: c.ivaTipo,
          total: c.totalLinea,
          importe10: importeDe(c.partes, "IVA10"),
          importe5: importeDe(c.partes, "IVA5"),
          importeExenta: importeDe(c.partes, "EXENTA"),
        })),
      },
    },
  });

  // --- 2,3) Stock + costo por cada item ---
  const loteId = randomUUID();
  for (const c of computed) {
    // Costo Promedio Ponderado (PMP). Ponderamos el costo NETO (sin IVA, que es
    // credito fiscal recuperable, no costo) contra la existencia total del articulo
    // ANTES de ingresar esta linea. costoActual es global por articulo, por eso la
    // base es la suma de saldos en TODOS los depositos, no solo el de la compra.
    //   nuevoCosto = (existenciaPrev * costoAnterior + netoLinea) / (existenciaPrev + cantidad)
    // Se lee fresco en cada iteracion para que dos lineas del mismo articulo en la
    // misma factura se ponderen en cascada (la 2da sobre el resultado de la 1ra).
    const existenciaAgg = await prisma.stockByWarehouse.aggregate({
      where: { articleId: c.articleId },
      _sum: { cantidad: true },
    });
    const existenciaPrev = Number(existenciaAgg._sum.cantidad ?? 0);
    const art = await prisma.article.findUnique({
      where: { id: c.articleId },
      select: { costoActual: true },
    });
    const costoAnterior = Number(art?.costoActual ?? 0);

    // Costo neto unitario de ESTA compra (el neto de linea repartido por unidad).
    const costoNetoUnitario = c.cantidad !== 0 ? c.neto / c.cantidad : 0;
    const existenciaPost = existenciaPrev + c.cantidad;
    // Sin existencia previa util (0 o negativa) no hay promedio que ponderar: el
    // costo pasa a ser el neto de esta compra.
    const nuevoCosto =
      existenciaPrev > 0 && existenciaPost > 0
        ? (existenciaPrev * costoAnterior + c.neto) / existenciaPost
        : costoNetoUnitario;
    // costoActual es Decimal(18,4): redondeo determinista a 4 decimales.
    const costoRedondeado = Math.round(nuevoCosto * 10000) / 10000;

    await applyStockMovement(prisma, {
      companyId: input.companyId,
      articleId: c.articleId,
      warehouseId: input.warehouseId,
      cantidad: c.cantidad, // ingreso
      tipo: "INGRESO",
      costoUnitario: c.costoUnitario,
      origenTipo: "COMPRA",
      origenId: invoice.id,
      loteId,
      observacion: `Compra ${input.nroComprobante}`,
      usuarioId: input.usuarioId ?? null,
    });

    // Costo actual = costo promedio ponderado (neto). El historial guarda el
    // promedio resultante despues de este ingreso.
    await prisma.article.update({
      where: { id: c.articleId },
      data: { costoActual: costoRedondeado },
    });
    await prisma.articleCostHistory.create({
      data: {
        articleId: c.articleId,
        costo: costoRedondeado,
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
  // Solo la compra a credito genera deuda: la de contado se paga en el acto (su
  // asiento acredita Caja), igual que la venta de contado no toca la cuenta del cliente.
  if (input.condicion === "CREDITO") {
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
  }

  // --- 5) Evento contable (lo procesa el modulo de contabilidad luego) ---
  await prisma.accountingEvent.create({
    data: {
      companyId: input.companyId,
      tipo: "COMPRA",
      origenTipo: "COMPRA",
      origenId: invoice.id,
      payload: {
        nroComprobante: input.nroComprobante,
        fecha: input.fecha,
        condicion: input.condicion,
        subtotalExenta,
        subtotal5,
        subtotal10,
        iva5,
        iva10,
        total,
        categorias: agruparPorCategoria(
          computed.flatMap((c) =>
            c.partes.map((p) => ({ categoryId: artById.get(c.articleId)?.categoryId ?? null, ivaTipo: p.ivaTipo, total: p.total }))
          )
        ),
      },
    },
  });

  return invoice;
}

export interface AnularPurchaseInput {
  companyId: number;
  invoiceId: number;
  usuarioId?: number | null;
  motivoAnulacionId?: number | null;
  observacion?: string | null;
  /** La factura anulada figura en el Libro IVA Compras (con montos en 0). */
  enLibroIva?: boolean;
}

/**
 * Anula una compra CONFIRMADA revirtiendo lo que hizo createPurchase: egresa el stock
 * ingresado y revierte la cuenta corriente del proveedor, y encola el evento contable.
 *
 * Guardas: ya anulada, o con notas de credito de compra.
 * Nota: puede dejar stock negativo si la mercaderia ya se uso; NO revierte costoActual.
 */
export async function anularPurchase(prisma: Prisma.TransactionClient, input: AnularPurchaseInput) {
  // La reversa se fecha hoy: el ejercicio de hoy debe estar abierto.
  await assertPeriodoAbierto(prisma, input.companyId, new Date());

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: input.invoiceId, companyId: input.companyId },
    include: { items: true },
  });
  if (!invoice) throw new Error("Compra no encontrada");
  if (invoice.estado === "ANULADO") throw new Error("La compra ya esta anulada");

  const ncCount = await prisma.purchaseCreditNote.count({ where: { invoiceId: invoice.id } });
  if (ncCount > 0) throw new Error("La compra tiene notas de credito; no se puede anular");

  // Categoria de cada articulo, para revertir la compra contra la misma cuenta de compra.
  const catByArticle = new Map<number, number | null>(
    (
      await prisma.article.findMany({
        where: { id: { in: [...new Set(invoice.items.map((i) => i.articleId))] } },
        select: { id: true, categoryId: true },
      })
    ).map((a) => [a.id, a.categoryId ?? null])
  );
  const categorias = agruparPorCategoria(
    invoice.items.map((it) => ({ categoryId: catByArticle.get(it.articleId) ?? null, ivaTipo: it.ivaTipo, total: Number(it.total) }))
  );

  // Series/IMEI: bloquea si alguna unidad ya salio; si todas EN_STOCK, las elimina.
  await eliminarSeriesCompra(prisma, invoice.id);

  // 1) Egreso de stock: invierte cada movimiento de la compra
  const movs = await prisma.stockMovement.findMany({
    where: { companyId: input.companyId, origenTipo: "COMPRA", origenId: invoice.id },
  });
  const loteAnulacion = randomUUID();
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
      loteId: loteAnulacion,
      observacion: `Anulacion compra ${invoice.nroComprobante}`,
      usuarioId: input.usuarioId ?? null,
    });
  }

  // 2) Cuenta corriente proveedor: inverso del haber original (solo credito lo genero)
  if (invoice.condicion === "CREDITO") {
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
  }

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
        categorias,
      },
    },
  });

  // 4) Estado
  await prisma.purchaseInvoice.update({
    where: { id: invoice.id },
    data: {
      estado: "ANULADO",
      anuladoAt: new Date(),
      anuladoPorId: input.usuarioId ?? null,
      motivoAnulacionId: input.motivoAnulacionId ?? null,
      observacionAnulacion: input.observacion || null,
      anuladoEnLibroIva: input.enLibroIva ?? false,
    },
  });

  return { id: invoice.id, nroComprobante: invoice.nroComprobante, estado: "ANULADO" as const };
}
