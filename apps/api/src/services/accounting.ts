import { prisma } from "../db.js";
import { HttpError } from "../http.js";

// Claves de cuentas operativas. Cada una se resuelve a una cuenta concreta del plan
// de la empresa via AccountingConfig (tabla editable), no por codigo fijo. El plan del
// cliente separa ventas / IVA / costos por tasa, asi que el posting desglosa 10/5/exenta.
export const CLAVES = [
  "CAJA",
  "CLIENTES",
  "PROVEEDORES",
  "IVA_DEBITO_10",
  "IVA_DEBITO_5",
  "IVA_CREDITO_10",
  "IVA_CREDITO_5",
  "VENTAS_10",
  "VENTAS_5",
  "VENTAS_EXENTA",
  "COMPRAS_GRAV",
  "COMPRAS_EXENTA",
  "RESULTADO_EJERCICIO",
] as const;

interface LineDraft {
  clave: string;
  debe: number;
  haber: number;
  detalle?: string;
}

const r = (n: number) => Math.round(Number(n) || 0);

// Lineas de reconocimiento de ventas (ventas gravadas/exentas + IVA debito), por tasa.
// side="haber": reconocimiento normal; side="debe": reversa (NC / anulacion).
function ventasLines(p: Record<string, unknown>, side: "debe" | "haber"): LineDraft[] {
  const num = (k: string) => r(p[k] as number);
  const put = (clave: string, monto: number): LineDraft =>
    side === "haber" ? { clave, debe: 0, haber: monto } : { clave, debe: monto, haber: 0 };
  return [
    put("VENTAS_10", num("subtotal10")),
    put("VENTAS_5", num("subtotal5")),
    put("VENTAS_EXENTA", num("subtotalExenta")),
    put("IVA_DEBITO_10", num("iva10")),
    put("IVA_DEBITO_5", num("iva5")),
  ];
}

// Lineas de costo de compras (mercaderia gravada/exenta + IVA credito), por tasa.
// side="debe": compra normal; side="haber": reversa (NC / anulacion).
function comprasLines(p: Record<string, unknown>, side: "debe" | "haber"): LineDraft[] {
  const num = (k: string) => r(p[k] as number);
  const put = (clave: string, monto: number): LineDraft =>
    side === "debe" ? { clave, debe: monto, haber: 0 } : { clave, debe: 0, haber: monto };
  return [
    put("COMPRAS_GRAV", num("subtotal10") + num("subtotal5")),
    put("COMPRAS_EXENTA", num("subtotalExenta")),
    put("IVA_CREDITO_10", num("iva10")),
    put("IVA_CREDITO_5", num("iva5")),
  ];
}

/**
 * Traduce un evento contable a las lineas del asiento (debe/haber por clave de cuenta).
 * Modelo paraguayo (IVA incluido ya desglosado en el evento). Las lineas en cero se
 * descartan luego.
 */
function buildLines(tipo: string, p: Record<string, unknown>): LineDraft[] {
  const num = (k: string) => r(p[k] as number);
  const total = num("total");

  switch (tipo) {
    case "VENTA_CONTADO":
      return [{ clave: "CAJA", debe: total, haber: 0 }, ...ventasLines(p, "haber")];
    case "VENTA_CREDITO": {
      const entrega = num("entrega");
      const financiado = total - entrega;
      return [
        { clave: "CAJA", debe: entrega, haber: 0 },
        { clave: "CLIENTES", debe: financiado, haber: 0 },
        ...ventasLines(p, "haber"),
      ];
    }
    case "COMPRA": {
      const contado = (p.condicion as string) === "CONTADO";
      return [
        ...comprasLines(p, "debe"),
        { clave: contado ? "CAJA" : "PROVEEDORES", debe: 0, haber: total },
      ];
    }
    case "COBRO":
      return [
        { clave: "CAJA", debe: num("montoTotal"), haber: 0 },
        { clave: "CLIENTES", debe: 0, haber: num("montoTotal") },
      ];
    case "PAGO":
      return [
        { clave: "PROVEEDORES", debe: num("montoTotal"), haber: 0 },
        { clave: "CAJA", debe: 0, haber: num("montoTotal") },
      ];
    case "PAGO_ANULADO": // reversa de pago (cheque rechazado/anulado): repone la deuda
      return [
        { clave: "CAJA", debe: num("montoTotal"), haber: 0 },
        { clave: "PROVEEDORES", debe: 0, haber: num("montoTotal") },
      ];
    case "NOTA_CREDITO_VENTA": // reversa de venta
      return [...ventasLines(p, "debe"), { clave: "CLIENTES", debe: 0, haber: total }];
    case "NOTA_CREDITO_COMPRA": // reversa de compra
      return [{ clave: "PROVEEDORES", debe: total, haber: 0 }, ...comprasLines(p, "haber")];
    case "VENTA_ANULADA": {
      // Reversa exacta del asiento de la venta (contado o credito).
      const contado = (p.condicion as string) === "CONTADO";
      if (contado) {
        return [...ventasLines(p, "debe"), { clave: "CAJA", debe: 0, haber: total }];
      }
      const entrega = num("entrega");
      const financiado = total - entrega;
      return [
        ...ventasLines(p, "debe"),
        { clave: "CAJA", debe: 0, haber: entrega },
        { clave: "CLIENTES", debe: 0, haber: financiado },
      ];
    }
    case "COMPRA_ANULADA": {
      const contado = (p.condicion as string) === "CONTADO";
      return [
        { clave: contado ? "CAJA" : "PROVEEDORES", debe: total, haber: 0 },
        ...comprasLines(p, "haber"),
      ];
    }
    default:
      throw new Error(`Tipo de evento sin mapeo contable: ${tipo}`);
  }
}

function glosaDe(tipo: string, p: Record<string, unknown>): string {
  const ref = (p.nroComprobante as string) || (p.numero as string) || "";
  const label: Record<string, string> = {
    VENTA_CONTADO: "Venta contado",
    VENTA_CREDITO: "Venta credito",
    COMPRA: "Compra",
    COBRO: "Cobro de cuotas",
    PAGO: "Pago a proveedor",
    NOTA_CREDITO_VENTA: "Nota de credito venta",
    NOTA_CREDITO_COMPRA: "Nota de credito compra",
    VENTA_ANULADA: "Anulacion de venta",
    COMPRA_ANULADA: "Anulacion de compra",
    PAGO_ANULADO: "Reversa de pago (cheque)",
  };
  return `${label[tipo] ?? tipo}${ref ? ` ${ref}` : ""}`.trim();
}

export interface AccountBalance {
  accountId: number;
  codigo: string;
  nombre: string;
  tipo: string;
  debe: number;
  haber: number;
  saldo: number; // debe - haber
}

/** Filtro de fecha (rango) para asientos, usado por reportes y cierre. */
export interface FechaRange {
  gte?: Date;
  lte?: Date;
}

/**
 * Saldos por cuenta (solo cuentas con movimiento), ordenados por codigo.
 * Si se pasa `fecha`, acota a los asientos dentro del rango (reportes por periodo).
 * `excludeCierre` deja fuera los asientos de cierre de ejercicio (para que el estado
 * de resultados muestre el resultado operativo y no quede neteado a cero).
 */
export async function getAccountBalances(
  companyId: number,
  fecha?: FechaRange,
  opts?: { excludeCierre?: boolean }
): Promise<AccountBalance[]> {
  const grupos = await prisma.accountingEntryLine.groupBy({
    by: ["accountId"],
    where: {
      entry: {
        companyId,
        ...(fecha ? { fecha } : {}),
        // Excluir CIERRE conservando asientos con origenTipo nulo (manuales futuros).
        ...(opts?.excludeCierre ? { OR: [{ origenTipo: { not: "CIERRE" } }, { origenTipo: null }] } : {}),
      },
    },
    _sum: { debe: true, haber: true },
  });
  const cuentas = await prisma.chartOfAccount.findMany({
    where: { id: { in: grupos.map((g) => g.accountId) } },
    select: { id: true, codigo: true, nombre: true, tipo: true },
  });
  const byId = new Map(cuentas.map((c) => [c.id, c]));
  return grupos
    .map((g) => {
      const c = byId.get(g.accountId);
      const debe = Number(g._sum.debe ?? 0);
      const haber = Number(g._sum.haber ?? 0);
      return { accountId: g.accountId, codigo: c?.codigo ?? "", nombre: c?.nombre ?? "", tipo: c?.tipo ?? "", debe, haber, saldo: debe - haber };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export interface ProcessResult {
  procesados: number;
  errores: number;
  detalleErrores: Array<{ eventId: number; error: string }>;
}

/**
 * Procesa los AccountingEvent pendientes de una empresa: por cada uno genera un
 * AccountingEntry con sus lineas (validando que el asiento balancee) y marca el
 * evento como procesado. Idempotente: solo toma procesado=false. Un evento que
 * falla guarda su error y no frena al resto.
 */
export async function processPendingEvents(companyId: number): Promise<ProcessResult> {
  const config = await prisma.accountingConfig.findMany({
    where: { companyId },
    select: { clave: true, accountId: true },
  });
  const accId = new Map(config.map((c) => [c.clave, c.accountId]));
  const resolve = (clave: string) => {
    const id = accId.get(clave);
    if (!id) throw new Error(`Falta configurar la cuenta para "${clave}" (Contabilidad > Configuracion de cuentas)`);
    return id;
  };

  const events = await prisma.accountingEvent.findMany({
    where: { companyId, procesado: false },
    orderBy: { id: "asc" },
  });

  // Periodos fiscales de la empresa (pocos): para fechar el asiento en su ejercicio
  // y bloquear el posting sobre un periodo ya cerrado.
  const periods = await prisma.fiscalPeriod.findMany({ where: { companyId } });
  const periodoDe = (fecha: Date) =>
    periods.find((p) => fecha >= p.fechaInicio && fecha <= p.fechaFin) ?? null;

  const result: ProcessResult = { procesados: 0, errores: 0, detalleErrores: [] };

  for (const ev of events) {
    try {
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      // Fecha contable = fecha del documento (si el evento la trae); las reversas /
      // anulaciones no la traen y se fechan el dia del evento (ev.createdAt).
      const fecha = payload.fecha ? new Date(payload.fecha as string) : ev.createdAt;
      const periodo = periodoDe(fecha);
      if (periodo?.cerrado) throw new Error(`El periodo "${periodo.nombre}" esta cerrado; no admite nuevos asientos`);

      const lines = buildLines(ev.tipo, payload).filter((l) => r(l.debe) > 0 || r(l.haber) > 0);
      const totalDebe = lines.reduce((s, l) => s + r(l.debe), 0);
      const totalHaber = lines.reduce((s, l) => s + r(l.haber), 0);
      if (lines.length === 0) throw new Error("El evento no genero lineas");
      if (totalDebe !== totalHaber) throw new Error(`Asiento descuadrado (debe ${totalDebe} != haber ${totalHaber})`);

      await prisma.$transaction(async (tx) => {
        // Numero correlativo por empresa, calculado dentro de la transaccion. La
        // unicidad la garantiza @@unique([companyId, numero]): si dos procesos
        // colisionan, el segundo falla y el evento se reintenta luego.
        const agg = await tx.accountingEntry.aggregate({ where: { companyId }, _max: { numero: true } });
        const numeroAsiento = (agg._max.numero ?? 0) + 1;
        const entry = await tx.accountingEntry.create({
          data: {
            companyId,
            periodId: periodo?.id ?? null,
            numero: numeroAsiento,
            fecha,
            glosa: glosaDe(ev.tipo, payload),
            origenTipo: ev.origenTipo,
            origenId: ev.origenId,
            lines: {
              create: lines.map((l) => ({ accountId: resolve(l.clave), debe: r(l.debe), haber: r(l.haber), detalle: l.detalle ?? null })),
            },
          },
        });
        await tx.accountingEvent.update({
          where: { id: ev.id },
          data: { procesado: true, entryId: entry.id, processedAt: new Date(), error: null },
        });
      });
      result.procesados += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      await prisma.accountingEvent.update({ where: { id: ev.id }, data: { error: msg } });
      result.errores += 1;
      result.detalleErrores.push({ eventId: ev.id, error: msg });
    }
  }

  return result;
}

export interface CierreResult {
  numeroAsiento: number | null;
  totalIngresos: number;
  totalEgresos: number;
  resultado: number;
}

/**
 * Cierra un ejercicio: genera el asiento de cierre (fecha = fin del periodo) que
 * lleva los saldos de las cuentas de INGRESO y EGRESO a cero contra la cuenta de
 * RESULTADO_EJERCICIO (patrimonio), y marca el periodo como cerrado. Idempotente
 * por guardas: falla si ya esta cerrado o si ya existe un asiento de cierre.
 */
export async function cerrarEjercicio(companyId: number, periodId: number): Promise<CierreResult> {
  const periodo = await prisma.fiscalPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!periodo) throw new HttpError(404, "Ejercicio no encontrado");
  if (periodo.cerrado) throw new HttpError(409, "El ejercicio ya esta cerrado");
  const yaCierre = await prisma.accountingEntry.count({ where: { companyId, periodId, origenTipo: "CIERRE" } });
  if (yaCierre > 0) throw new HttpError(409, "El ejercicio ya tiene un asiento de cierre");

  const cfg = await prisma.accountingConfig.findUnique({
    where: { companyId_clave: { companyId, clave: "RESULTADO_EJERCICIO" } },
    select: { accountId: true },
  });
  if (!cfg) throw new HttpError(400, 'Falta configurar la cuenta "RESULTADO_EJERCICIO" (Contabilidad > Configuracion de cuentas)');

  // Saldos de resultado del ejercicio (operativos: sin asientos de cierre previos).
  const bals = await getAccountBalances(companyId, { gte: periodo.fechaInicio, lte: periodo.fechaFin }, { excludeCierre: true });
  const lines: Array<{ accountId: number; debe: number; haber: number }> = [];
  let totalIngresos = 0;
  let totalEgresos = 0;
  for (const b of bals) {
    if (b.tipo === "INGRESO") {
      const ingreso = r(b.haber - b.debe); // saldo acreedor normal
      if (ingreso !== 0) {
        lines.push({ accountId: b.accountId, debe: ingreso, haber: 0 }); // debita para cancelar
        totalIngresos += ingreso;
      }
    } else if (b.tipo === "EGRESO") {
      const egreso = r(b.debe - b.haber); // saldo deudor normal
      if (egreso !== 0) {
        lines.push({ accountId: b.accountId, debe: 0, haber: egreso }); // acredita para cancelar
        totalEgresos += egreso;
      }
    }
  }
  const resultado = totalIngresos - totalEgresos;
  // Contrapartida del resultado contra patrimonio (utilidad al haber, perdida al debe).
  if (resultado > 0) lines.push({ accountId: cfg.accountId, debe: 0, haber: resultado });
  else if (resultado < 0) lines.push({ accountId: cfg.accountId, debe: -resultado, haber: 0 });

  let numeroAsiento: number | null = null;
  await prisma.$transaction(async (tx) => {
    if (lines.length > 0) {
      const agg = await tx.accountingEntry.aggregate({ where: { companyId }, _max: { numero: true } });
      numeroAsiento = (agg._max.numero ?? 0) + 1;
      await tx.accountingEntry.create({
        data: {
          companyId,
          periodId,
          numero: numeroAsiento,
          fecha: periodo.fechaFin,
          glosa: `Cierre de ejercicio ${periodo.nombre}`,
          origenTipo: "CIERRE",
          origenId: periodId,
          lines: { create: lines },
        },
      });
    }
    await tx.fiscalPeriod.update({ where: { id: periodId }, data: { cerrado: true } });
  });

  return { numeroAsiento, totalIngresos, totalEgresos, resultado };
}
