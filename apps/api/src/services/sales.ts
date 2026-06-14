import type { MedioPago, Prisma } from "@prisma/client";
import { applyStockMovement } from "./stock.js";
import { consumirSeriesVenta, revertirSeriesVenta } from "./serials.js";
import { desglosarIvaIncluido } from "./iva.js";

export interface SaleItemInput {
  articleId: number;
  cantidad: number;
  precioUnitario: number; // con IVA incluido (precio de la lista)
  series?: string[]; // requerido (largo === cantidad) si el articulo controla serie
}

export interface SalePaymentInput {
  medio: MedioPago;
  monto: number;
}

export interface CreateSaleInput {
  companyId: number;
  customerId: number;
  priceListId: number;
  warehouseId: number; // deposito desde donde se descarga el stock
  fecha: Date;
  observacion?: string | null;
  usuarioId?: number | null;
  items: SaleItemInput[];
  // Credito: nro de cuotas (override del de la lista). Contado: ignorado.
  cuotas?: number;
  // Contado: el pago total. Credito: la entrega inicial (puede ser vacio = 0).
  payments?: SalePaymentInput[];
}

// Redondeo a entero (Guaranies sin decimales)
const r = (n: number) => Math.round(n);

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * Reparte un monto entero entre varios grupos segun pesos (los totales de cada
 * grupo), de forma que la suma de las partes sea exactamente el monto. El
 * remanente del redondeo se distribuye de a 1.
 */
function allocate(amount: number, weights: number[]): number[] {
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const out = weights.map((w) => Math.floor((amount * w) / totalW));
  let rem = amount - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rem > 0; i = (i + 1) % out.length) {
    out[i] += 1;
    rem -= 1;
  }
  return out;
}

/**
 * Crea una venta y, en una sola transaccion:
 *  1) agrupa los items por rubro y emite UN comprobante por rubro,
 *     secuenciando con el PuntoExpedicion de cada rubro (estab-punto-numero).
 *  2) registra cada factura con su detalle, totales (IVA incluido desglosado)
 *     y las formas de pago cobradas al momento (efectivo/tarjetas/transferencia).
 *  3) descarga stock del deposito (applyStockMovement EGRESO).
 *  4) si es a credito: registra la cuenta corriente (deuda total menos entrega),
 *     genera las cuotas sobre el saldo financiado y el pagare.
 *  5) encola el evento contable.
 *
 * En contado el desglose de pagos debe sumar el total. En credito el desglose es
 * la entrega inicial; el saldo (total - entrega) se financia en `cuotas` cuotas.
 *
 * Cuando la venta abarca varios rubros (varios comprobantes), la entrega y cada
 * forma de pago se reparten proporcionalmente al total de cada comprobante.
 *
 * Devuelve la lista de comprobantes generados (uno por rubro).
 */
export async function createSale(prisma: Prisma.TransactionClient, input: CreateSaleInput) {
  // --- Lista de precios -> condicion y nro de cuotas ---
  const priceList = await prisma.priceList.findUnique({ where: { id: input.priceListId } });
  if (!priceList) throw new Error("Lista de precios invalida");
  if (!priceList.activo) throw new Error("La lista de precios esta inactiva");
  const esCredito = priceList.condicion === "CREDITO";

  const cuotas = esCredito ? input.cuotas ?? priceList.cuotas : 0;
  if (esCredito && cuotas <= 0) {
    throw new Error("Indica la cantidad de cuotas para la venta a credito");
  }

  // --- Articulos involucrados (rubro + tipo de IVA) ---
  const articleIds = [...new Set(input.items.map((i) => i.articleId))];
  const articles = await prisma.article.findMany({
    where: { id: { in: articleIds } },
    select: { id: true, descripcion: true, rubroId: true, ivaTipo: true, costoActual: true, tipo: true, controlaSerie: true },
  });
  const byId = new Map(articles.map((a) => [a.id, a]));

  // --- Validacion de series/IMEI para articulos que controlan serie ---
  for (const it of input.items) {
    const art = byId.get(it.articleId);
    if (art?.controlaSerie) {
      const series = (it.series ?? []).map((s) => s.trim()).filter(Boolean);
      if (!Number.isInteger(it.cantidad) || series.length !== it.cantidad) {
        throw new Error(`Para "${art.descripcion}" elegi ${it.cantidad} serie(s)/IMEI (una por unidad)`);
      }
    }
  }

  // --- Validacion de stock disponible en el deposito (solo PRODUCTO; los SERVICIO no mueven stock) ---
  const requeridoPorArticulo = new Map<number, number>();
  for (const it of input.items) {
    const art = byId.get(it.articleId);
    if (!art || art.tipo === "SERVICIO") continue;
    requeridoPorArticulo.set(it.articleId, (requeridoPorArticulo.get(it.articleId) ?? 0) + it.cantidad);
  }
  if (requeridoPorArticulo.size > 0) {
    const stocks = await prisma.stockByWarehouse.findMany({
      where: { warehouseId: input.warehouseId, articleId: { in: [...requeridoPorArticulo.keys()] } },
      select: { articleId: true, cantidad: true },
    });
    const disponiblePorArticulo = new Map(stocks.map((s) => [s.articleId, Number(s.cantidad)]));
    for (const [articleId, requerido] of requeridoPorArticulo) {
      const disponible = disponiblePorArticulo.get(articleId) ?? 0;
      if (disponible < requerido) {
        const art = byId.get(articleId)!;
        throw new Error(`Stock insuficiente de "${art.descripcion}": disponible ${disponible}, requerido ${requerido}`);
      }
    }
  }

  // --- Agrupacion por rubro (cada rubro factura con su punto de expedicion) ---
  const groupsMap = new Map<number, SaleItemInput[]>();
  for (const it of input.items) {
    const art = byId.get(it.articleId);
    if (!art) throw new Error(`Articulo ${it.articleId} inexistente`);
    if (!art.rubroId) {
      throw new Error(`El articulo "${art.descripcion}" no tiene rubro asignado y no se puede facturar`);
    }
    const arr = groupsMap.get(art.rubroId) ?? [];
    arr.push(it);
    groupsMap.set(art.rubroId, arr);
  }

  // --- 1er pase: calcular totales por grupo (sin crear nada todavia) ---
  const groups = [...groupsMap.entries()].map(([rubroId, items]) => {
    let subtotalExenta = 0, subtotal5 = 0, subtotal10 = 0, iva5 = 0, iva10 = 0;
    const computed = items.map((it) => {
      const art = byId.get(it.articleId)!;
      const bruto = r(it.cantidad * it.precioUnitario);
      const { neto, iva } = desglosarIvaIncluido(bruto, art.ivaTipo);
      if (art.ivaTipo === "IVA10") { subtotal10 += neto; iva10 += iva; }
      else if (art.ivaTipo === "IVA5") { subtotal5 += neto; iva5 += iva; }
      else subtotalExenta += bruto;
      return { ...it, ivaTipo: art.ivaTipo, costoActual: Number(art.costoActual), totalLinea: bruto };
    });
    const total = subtotalExenta + subtotal5 + subtotal10 + iva5 + iva10;
    return { rubroId, computed, subtotalExenta, subtotal5, subtotal10, iva5, iva10, total };
  });

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  // --- Validacion y consolidacion de pagos ---
  const payments = (input.payments ?? []).filter((p) => p.monto > 0);
  // Pago default en contado sin desglose: todo efectivo
  if (!esCredito && payments.length === 0 && grandTotal > 0) {
    payments.push({ medio: "EFECTIVO", monto: grandTotal });
  }
  const pagosTotal = payments.reduce((s, p) => s + r(p.monto), 0);

  if (!esCredito && pagosTotal !== grandTotal) {
    throw new Error(`El pago (${pagosTotal}) debe sumar el total de la venta (${grandTotal})`);
  }
  if (esCredito && pagosTotal > grandTotal) {
    throw new Error("La entrega inicial no puede superar el total de la venta");
  }

  // Monto por medio de pago (consolidado)
  const porMedio = new Map<MedioPago, number>();
  for (const p of payments) porMedio.set(p.medio, (porMedio.get(p.medio) ?? 0) + r(p.monto));

  // Reparto de cada medio entre los grupos (proporcional al total de cada uno)
  const weights = groups.map((g) => g.total);
  const allocByMedio = new Map<MedioPago, number[]>();
  for (const [medio, monto] of porMedio) allocByMedio.set(medio, allocate(monto, weights));

  const invoices = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];

    // Punto de expedicion del rubro + secuencia del numero
    const punto = await prisma.puntoExpedicion.findUnique({
      where: { companyId_rubroId: { companyId: input.companyId, rubroId: g.rubroId } },
      include: { timbrado: true, rubro: { select: { nombre: true } } },
    });
    if (!punto) {
      throw new Error("Un rubro de la venta no tiene punto de expedicion asignado en esta empresa");
    }
    if (!punto.activo) throw new Error(`El punto de expedicion del rubro ${punto.rubro.nombre} esta inactivo`);

    const seq = await prisma.puntoExpedicion.update({
      where: { id: punto.id },
      data: { numeroActual: { increment: 1 } },
      select: { numeroActual: true },
    });
    const nextNumero = seq.numeroActual;
    if (punto.numeroFinal && nextNumero > punto.numeroFinal) {
      throw new Error(`Se agoto el rango autorizado del punto ${punto.codigo} (rubro ${punto.rubro.nombre})`);
    }
    const numeroStr = String(nextNumero).padStart(7, "0");
    const nroComprobante = `${punto.timbrado.establecimiento}-${punto.codigo}-${numeroStr}`;

    // Pagos asignados a este comprobante
    const pagosGrupo: Array<{ medio: MedioPago; monto: number }> = [];
    for (const [medio, alloc] of allocByMedio) {
      if (alloc[gi] > 0) pagosGrupo.push({ medio, monto: alloc[gi] });
    }
    const entregaGrupo = pagosGrupo.reduce((s, p) => s + p.monto, 0);
    const financiado = g.total - entregaGrupo;

    // Cabecera + detalle + formas de pago
    const invoice = await prisma.salesInvoice.create({
      data: {
        companyId: input.companyId,
        customerId: input.customerId,
        priceListId: priceList.id,
        establecimiento: punto.timbrado.establecimiento,
        puntoExpedicion: punto.codigo,
        numero: numeroStr,
        timbrado: punto.timbrado.numero,
        tipoDocumento: punto.tipoDocumento,
        fecha: input.fecha,
        condicion: priceList.condicion,
        subtotalExenta: g.subtotalExenta,
        subtotal5: g.subtotal5,
        subtotal10: g.subtotal10,
        iva5: g.iva5,
        iva10: g.iva10,
        total: g.total,
        entregaInicial: entregaGrupo,
        estado: "CONFIRMADO",
        observacion: input.observacion ?? null,
        usuarioId: input.usuarioId ?? null,
        items: {
          create: g.computed.map((c) => ({
            articleId: c.articleId,
            cantidad: c.cantidad,
            precioUnitario: c.precioUnitario,
            ivaTipo: c.ivaTipo,
            total: c.totalLinea,
          })),
        },
        payments: {
          create: pagosGrupo.map((p) => ({ companyId: input.companyId, medio: p.medio, monto: p.monto })),
        },
      },
    });

    // Descarga de stock (egreso) por cada item PRODUCTO (los SERVICIO no mueven stock)
    for (const c of g.computed) {
      const art = byId.get(c.articleId);
      if (art?.tipo === "SERVICIO") continue;
      await applyStockMovement(prisma, {
        companyId: input.companyId,
        articleId: c.articleId,
        warehouseId: input.warehouseId,
        cantidad: -c.cantidad, // egreso
        tipo: "EGRESO",
        costoUnitario: c.costoActual,
        origenTipo: "VENTA",
        origenId: invoice.id,
        observacion: `Venta ${nroComprobante}`,
        usuarioId: input.usuarioId ?? null,
      });
      // Series/IMEI: marca como VENDIDO las unidades elegidas (valida estado/deposito)
      if (art?.controlaSerie && c.series?.length) {
        await consumirSeriesVenta(prisma, {
          articleId: c.articleId,
          warehouseId: input.warehouseId,
          saleInvoiceId: invoice.id,
          soldAt: input.fecha,
          series: c.series,
        });
      }
    }

    // Credito: cuenta corriente (deuda total, menos la entrega) + cuotas + pagare
    if (esCredito) {
      await prisma.customerAccountEntry.create({
        data: {
          companyId: input.companyId,
          customerId: input.customerId,
          concepto: `Venta a credito ${nroComprobante}`,
          debe: g.total,
          haber: entregaGrupo,
          origenTipo: "VENTA",
          origenId: invoice.id,
        },
      });

      if (financiado > 0) {
        const cuotaBase = Math.floor(financiado / cuotas);
        for (let i = 1; i <= cuotas; i++) {
          // La ultima cuota absorbe el redondeo para que la suma cierre exacta.
          const montoCuota = i < cuotas ? cuotaBase : financiado - cuotaBase * (cuotas - 1);
          await prisma.installment.create({
            data: {
              companyId: input.companyId,
              invoiceId: invoice.id,
              nroCuota: i,
              fechaVencimiento: addMonths(input.fecha, i),
              montoCuota,
            },
          });
        }

        await prisma.promissoryNote.create({
          data: {
            companyId: input.companyId,
            invoiceId: invoice.id,
            numero: nroComprobante,
            montoTotal: financiado,
            fechaEmision: input.fecha,
          },
        });
      }
    }

    // Evento contable (lo procesa contabilidad luego)
    await prisma.accountingEvent.create({
      data: {
        companyId: input.companyId,
        tipo: esCredito ? "VENTA_CREDITO" : "VENTA_CONTADO",
        origenTipo: "VENTA",
        origenId: invoice.id,
        payload: {
          nroComprobante,
          condicion: priceList.condicion,
          subtotalExenta: g.subtotalExenta,
          subtotal5: g.subtotal5,
          subtotal10: g.subtotal10,
          iva5: g.iva5,
          iva10: g.iva10,
          total: g.total,
          entrega: entregaGrupo,
          financiado: esCredito ? financiado : 0,
          pagos: pagosGrupo,
        },
      },
    });

    invoices.push({ ...invoice, nroComprobante });
  }

  return invoices;
}

export interface AnularSaleInput {
  companyId: number;
  invoiceId: number;
  usuarioId?: number | null;
}

/**
 * Anula una venta CONFIRMADA revirtiendo, en una sola transaccion, exactamente lo que
 * hizo createSale: reingresa el stock, revierte la cuenta corriente (si credito),
 * borra cuotas y pagare, y encola el evento contable de reversa.
 *
 * Guardas (lanzan Error -> 400): ya anulada, con notas de credito, o con cobros
 * aplicados (alguna cuota con montoPagado > 0).
 */
export async function anularSale(prisma: Prisma.TransactionClient, input: AnularSaleInput) {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: input.invoiceId, companyId: input.companyId },
  });
  if (!invoice) throw new Error("Venta no encontrada");
  if (invoice.estado === "ANULADO") throw new Error("La venta ya esta anulada");

  const nroComprobante = `${invoice.establecimiento}-${invoice.puntoExpedicion}-${invoice.numero}`;

  // Guarda: notas de credito previas
  const ncCount = await prisma.salesCreditNote.count({ where: { invoiceId: invoice.id } });
  if (ncCount > 0) throw new Error("La venta tiene notas de credito; no se puede anular");

  // Guarda: cobros aplicados a sus cuotas
  const cuotaPagada = await prisma.installment.findFirst({
    where: { invoiceId: invoice.id, montoPagado: { gt: 0 } },
    select: { id: true },
  });
  if (cuotaPagada) throw new Error("La venta tiene cobros aplicados; revertilos antes de anular");

  // 1) Reingreso de stock: invierte cada movimiento de la venta
  const movs = await prisma.stockMovement.findMany({
    where: { companyId: input.companyId, origenTipo: "VENTA", origenId: invoice.id },
  });
  for (const m of movs) {
    await applyStockMovement(prisma, {
      companyId: input.companyId,
      articleId: m.articleId,
      warehouseId: m.warehouseId,
      cantidad: -Number(m.cantidad), // invierte el egreso original
      tipo: "INGRESO",
      costoUnitario: m.costoUnitario != null ? Number(m.costoUnitario) : null,
      origenTipo: "ANULACION_VENTA",
      origenId: invoice.id,
      observacion: `Anulacion venta ${nroComprobante}`,
      usuarioId: input.usuarioId ?? null,
    });
  }

  // Series/IMEI: las unidades vendidas vuelven a EN_STOCK (la venta nunca ocurrio)
  await revertirSeriesVenta(prisma, invoice.id);

  // 2) Cuenta corriente (solo credito): asiento inverso al de la venta
  if (invoice.condicion === "CREDITO") {
    await prisma.customerAccountEntry.create({
      data: {
        companyId: input.companyId,
        customerId: invoice.customerId,
        concepto: `Anulacion venta ${nroComprobante}`,
        debe: invoice.entregaInicial,
        haber: invoice.total,
        origenTipo: "ANULACION_VENTA",
        origenId: invoice.id,
      },
    });
  }

  // 3) Cuotas + pagare (no hay cobros: validado arriba)
  await prisma.installment.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.promissoryNote.deleteMany({ where: { invoiceId: invoice.id } });

  // 4) Evento contable de reversa
  await prisma.accountingEvent.create({
    data: {
      companyId: input.companyId,
      tipo: "VENTA_ANULADA",
      origenTipo: "ANULACION_VENTA",
      origenId: invoice.id,
      payload: {
        nroComprobante,
        condicion: invoice.condicion,
        subtotalExenta: invoice.subtotalExenta,
        subtotal5: invoice.subtotal5,
        subtotal10: invoice.subtotal10,
        iva5: invoice.iva5,
        iva10: invoice.iva10,
        total: invoice.total,
        entrega: invoice.entregaInicial,
      },
    },
  });

  // 5) Estado
  await prisma.salesInvoice.update({ where: { id: invoice.id }, data: { estado: "ANULADO" } });

  return { id: invoice.id, nroComprobante, estado: "ANULADO" as const };
}
