import type { IvaTipo } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../http.js";
import { desglosarIvaIncluido } from "./iva.js";

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
  // Cuentas por medio de pago (opcionales): la contrapartida de caja/banco de
  // cobros y de la entrega de la venta se imputa segun el medio. Si no se asignan,
  // el posting cae a CAJA (comportamiento previo).
  "MEDIO_EFECTIVO",
  "MEDIO_TARJETA_DEBITO",
  "MEDIO_TARJETA_CREDITO",
  "MEDIO_TRANSFERENCIA",
  "MEDIO_CHEQUE",
] as const;

// Claves que, si no estan configuradas, el posting resuelve a CAJA en vez de fallar.
export const CLAVES_OPCIONALES: ReadonlySet<string> = new Set([
  "MEDIO_EFECTIVO",
  "MEDIO_TARJETA_DEBITO",
  "MEDIO_TARJETA_CREDITO",
  "MEDIO_TRANSFERENCIA",
  "MEDIO_CHEQUE",
]);

// Medio de pago (ventas/cobros/pagos) -> clave de la cuenta que lo recibe/paga.
const CLAVE_POR_MEDIO: Record<string, string> = {
  EFECTIVO: "MEDIO_EFECTIVO",
  TARJETA_DEBITO: "MEDIO_TARJETA_DEBITO",
  TARJETA_CREDITO: "MEDIO_TARJETA_CREDITO",
  TRANSFERENCIA: "MEDIO_TRANSFERENCIA",
  CHEQUE: "MEDIO_CHEQUE",
};
const claveDeMedio = (medio: string | undefined): string => CLAVE_POR_MEDIO[medio ?? ""] ?? "CAJA";

/**
 * Reparte un monto entero segun pesos, garantizando que la suma de las partes sea
 * exactamente el monto (el remanente del redondeo se distribuye de a 1). Copia local
 * de la de services/sales para no acoplar contabilidad a ventas.
 */
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

// Momento contable de una categoria: que cuenta del CategoryAccountConfig usar.
// Se pasa una lista ordenada por preferencia (ej. una devolucion intenta primero la
// cuenta de devolucion y, si no esta definida, cae a la de venta/compra).
export type CategoryMoment = "compra" | "venta" | "devolucion";

// Una linea del asiento. El accountId se resuelve al postear de una de tres formas:
//  - `clave`: cuenta operativa global via AccountingConfig (CAJA, IVA_DEBITO_10...).
//  - `categoryId` + `categoryMoments`: cuenta configurada para esa categoria; si la
//    categoria no tiene cuenta para ninguno de esos momentos, cae a `fallbackClave`.
interface LineDraft {
  clave?: string;
  categoryId?: number | null;
  categoryMoments?: CategoryMoment[];
  fallbackClave?: string;
  debe: number;
  haber: number;
}

const r = (n: number) => Math.round(Number(n) || 0);

// --- Desglose por categoria (para imputar ventas/compras a la cuenta de la categoria) ---
// Nota: `type` (no `interface`) para que sea asignable a InputJsonValue de Prisma
// al guardarlo en el payload del evento (los interfaces no tienen index signature).
export type CategoriaBreak = {
  categoryId: number | null;
  subtotal10: number;
  subtotal5: number;
  subtotalExenta: number;
};

// Agrupa el neto (gravado por tasa) y el bruto (exento) por categoria a partir de los
// items del documento. Deriva el neto con desglosarIvaIncluido (enteros), de modo que
// la suma por categoria coincide exactamente con los subtotales del documento.
export function agruparPorCategoria(
  items: Array<{ categoryId: number | null; ivaTipo: IvaTipo; total: number }>
): CategoriaBreak[] {
  const map = new Map<number | null, CategoriaBreak>();
  for (const it of items) {
    const key = it.categoryId ?? null;
    const c = map.get(key) ?? { categoryId: key, subtotal10: 0, subtotal5: 0, subtotalExenta: 0 };
    const { neto } = desglosarIvaIncluido(it.total, it.ivaTipo);
    if (it.ivaTipo === "IVA10") c.subtotal10 += neto;
    else if (it.ivaTipo === "IVA5") c.subtotal5 += neto;
    else c.subtotalExenta += r(it.total);
    map.set(key, c);
  }
  return [...map.values()];
}

// Lineas de reconocimiento de ventas (ventas gravadas/exentas + IVA debito).
// Si el payload trae `categorias`, el reconocimiento se imputa por categoria (a su
// cuenta configurada o, si no tiene, a la clave global por tasa); si no, por tasa global.
// El IVA debito siempre va a la clave global por tasa.
// side="haber": reconocimiento normal; side="debe": reversa (NC / anulacion).
function ventasLines(p: Record<string, unknown>, side: "debe" | "haber", moments: CategoryMoment[]): LineDraft[] {
  const num = (k: string) => r(p[k] as number);
  const put = (clave: string, monto: number): LineDraft =>
    side === "haber" ? { clave, debe: 0, haber: monto } : { clave, debe: monto, haber: 0 };
  const putCat = (categoryId: number | null, fallbackClave: string, monto: number): LineDraft =>
    side === "haber"
      ? { categoryId, categoryMoments: moments, fallbackClave, debe: 0, haber: monto }
      : { categoryId, categoryMoments: moments, fallbackClave, debe: monto, haber: 0 };

  const cats = p.categorias as CategoriaBreak[] | undefined;
  const lines: LineDraft[] = [];
  if (Array.isArray(cats) && cats.length) {
    for (const c of cats) {
      lines.push(putCat(c.categoryId, "VENTAS_10", r(c.subtotal10)));
      lines.push(putCat(c.categoryId, "VENTAS_5", r(c.subtotal5)));
      lines.push(putCat(c.categoryId, "VENTAS_EXENTA", r(c.subtotalExenta)));
    }
  } else {
    lines.push(put("VENTAS_10", num("subtotal10")));
    lines.push(put("VENTAS_5", num("subtotal5")));
    lines.push(put("VENTAS_EXENTA", num("subtotalExenta")));
  }
  lines.push(put("IVA_DEBITO_10", num("iva10")));
  lines.push(put("IVA_DEBITO_5", num("iva5")));
  return lines;
}

// Lineas de costo de compras (mercaderia gravada/exenta + IVA credito). Analogo a
// ventasLines: imputa la mercaderia por categoria si el payload trae `categorias`.
// side="debe": compra normal; side="haber": reversa (NC / anulacion).
function comprasLines(p: Record<string, unknown>, side: "debe" | "haber", moments: CategoryMoment[]): LineDraft[] {
  const num = (k: string) => r(p[k] as number);
  const put = (clave: string, monto: number): LineDraft =>
    side === "debe" ? { clave, debe: monto, haber: 0 } : { clave, debe: 0, haber: monto };
  const putCat = (categoryId: number | null, fallbackClave: string, monto: number): LineDraft =>
    side === "debe"
      ? { categoryId, categoryMoments: moments, fallbackClave, debe: monto, haber: 0 }
      : { categoryId, categoryMoments: moments, fallbackClave, debe: 0, haber: monto };

  const cats = p.categorias as CategoriaBreak[] | undefined;
  const lines: LineDraft[] = [];
  if (Array.isArray(cats) && cats.length) {
    for (const c of cats) {
      lines.push(putCat(c.categoryId, "COMPRAS_GRAV", r(c.subtotal10) + r(c.subtotal5)));
      lines.push(putCat(c.categoryId, "COMPRAS_EXENTA", r(c.subtotalExenta)));
    }
  } else {
    lines.push(put("COMPRAS_GRAV", num("subtotal10") + num("subtotal5")));
    lines.push(put("COMPRAS_EXENTA", num("subtotalExenta")));
  }
  lines.push(put("IVA_CREDITO_10", num("iva10")));
  lines.push(put("IVA_CREDITO_5", num("iva5")));
  return lines;
}

// Lineas de caja/banco de una cobranza (entrega de venta, cobro de cuotas, pago).
// Reparte `amount` entre los medios del payload (`pagos`: [{medio, monto}]) segun sus
// proporciones, garantizando que la suma sea exactamente `amount` (evita descuadres por
// el reparto proporcional entre comprobantes). Cada parte va a la cuenta del medio (o
// CAJA si el medio no tiene cuenta propia asignada). Sin desglose -> todo a CAJA.
function pagosLines(p: Record<string, unknown>, side: "debe" | "haber", amount: number): LineDraft[] {
  const mk = (clave: string, monto: number): LineDraft =>
    side === "debe" ? { clave, debe: monto, haber: 0 } : { clave, debe: 0, haber: monto };
  if (amount <= 0) return [];
  const pagos = (p.pagos as Array<{ medio?: string; monto?: number }> | undefined) ?? [];
  const validos = pagos.filter((x) => r(x.monto ?? 0) > 0);
  if (validos.length === 0) return [mk("CAJA", r(amount))];
  const parts = allocate(r(amount), validos.map((x) => r(x.monto ?? 0)));
  return validos
    .map((x, i) => mk(claveDeMedio(x.medio), parts[i]))
    .filter((l) => l.debe > 0 || l.haber > 0);
}

/**
 * Traduce un evento contable a las lineas del asiento (debe/haber por cuenta).
 * Modelo paraguayo (IVA incluido ya desglosado en el evento). Las lineas en cero se
 * descartan luego. Ventas y compras se imputan a la cuenta de la categoria cuando el
 * payload trae el desglose `categorias` (ver createSale/createPurchase/NC/anulaciones).
 */
function buildLines(tipo: string, p: Record<string, unknown>): LineDraft[] {
  const num = (k: string) => r(p[k] as number);
  const total = num("total");

  switch (tipo) {
    case "VENTA_CONTADO":
      // El cobro total se imputa por medio de pago (efectivo/tarjeta/transferencia).
      return [...pagosLines(p, "debe", total), ...ventasLines(p, "haber", ["venta"])];
    case "VENTA_CREDITO": {
      const entrega = num("entrega");
      const financiado = total - entrega;
      return [
        // La entrega inicial se imputa por medio de pago; el saldo va a Clientes.
        ...pagosLines(p, "debe", entrega),
        { clave: "CLIENTES", debe: financiado, haber: 0 },
        ...ventasLines(p, "haber", ["venta"]),
      ];
    }
    case "COMPRA": {
      const contado = (p.condicion as string) === "CONTADO";
      return [
        ...comprasLines(p, "debe", ["compra"]),
        { clave: contado ? "CAJA" : "PROVEEDORES", debe: 0, haber: total },
      ];
    }
    case "COBRO": {
      // Cobro de cuotas: entra por la cuenta del medio de pago (o CAJA).
      const monto = num("montoTotal");
      return [
        { clave: claveDeMedio(p.metodo as string | undefined), debe: monto, haber: 0 },
        { clave: "CLIENTES", debe: 0, haber: monto },
      ];
    }
    case "PAGO": {
      // Pago a proveedor: sale por la cuenta del medio de pago (o CAJA).
      const monto = num("montoTotal");
      return [
        { clave: "PROVEEDORES", debe: monto, haber: 0 },
        { clave: claveDeMedio(p.metodo as string | undefined), debe: 0, haber: monto },
      ];
    }
    case "PAGO_ANULADO": {
      // Reversa de pago (cheque rechazado/anulado): repone la deuda. Siempre proviene
      // de un pago con cheque, por eso usa la cuenta de cheque (o CAJA por fallback).
      const monto = num("montoTotal");
      return [
        { clave: "MEDIO_CHEQUE", debe: monto, haber: 0 },
        { clave: "PROVEEDORES", debe: 0, haber: monto },
      ];
    }
    case "NOTA_CREDITO_VENTA": // devolucion de venta: usa la cuenta de devolucion (o venta)
      return [...ventasLines(p, "debe", ["devolucion", "venta"]), { clave: "CLIENTES", debe: 0, haber: total }];
    case "NOTA_CREDITO_COMPRA": // devolucion de compra: usa la cuenta de devolucion (o compra)
      return [{ clave: "PROVEEDORES", debe: total, haber: 0 }, ...comprasLines(p, "haber", ["devolucion", "compra"])];
    case "VENTA_ANULADA": {
      // Reversa exacta del asiento de la venta (contra la misma cuenta de venta y los
      // mismos medios de pago que registro la venta, provistos en el payload).
      const contado = (p.condicion as string) === "CONTADO";
      if (contado) {
        return [...ventasLines(p, "debe", ["venta"]), ...pagosLines(p, "haber", total)];
      }
      const entrega = num("entrega");
      const financiado = total - entrega;
      return [
        ...ventasLines(p, "debe", ["venta"]),
        ...pagosLines(p, "haber", entrega),
        { clave: "CLIENTES", debe: 0, haber: financiado },
      ];
    }
    case "COMPRA_ANULADA": {
      const contado = (p.condicion as string) === "CONTADO";
      return [
        { clave: contado ? "CAJA" : "PROVEEDORES", debe: total, haber: 0 },
        ...comprasLines(p, "haber", ["compra"]),
      ];
    }
    default:
      throw new Error(`Tipo de evento sin mapeo contable: ${tipo}`);
  }
}

/**
 * Resuelve los borradores de un evento a lineas de asiento (accountId + debe/haber) y
 * las fusiona por cuenta. Funcion pura (los resolvers se inyectan): resolveClave mapea
 * una clave global a su cuenta (lanza si falta); resolveCategoria devuelve la cuenta de
 * la categoria para el 1er momento con cuenta definida, o null para caer al fallback.
 */
export function computeEntryLines(
  tipo: string,
  payload: Record<string, unknown>,
  resolveClave: (clave: string) => number,
  resolveCategoria: (categoryId: number | null | undefined, moments: CategoryMoment[]) => number | null
): Array<{ accountId: number; debe: number; haber: number }> {
  const resolveLine = (l: LineDraft): number => {
    if (l.categoryMoments) return resolveCategoria(l.categoryId, l.categoryMoments) ?? resolveClave(l.fallbackClave!);
    return resolveClave(l.clave!);
  };
  const porCuenta = new Map<number, { debe: number; haber: number }>();
  for (const l of buildLines(tipo, payload)) {
    const debe = r(l.debe);
    const haber = r(l.haber);
    if (debe === 0 && haber === 0) continue;
    const accountId = resolveLine(l);
    const acc = porCuenta.get(accountId) ?? { debe: 0, haber: 0 };
    acc.debe += debe;
    acc.haber += haber;
    porCuenta.set(accountId, acc);
  }
  return [...porCuenta.entries()]
    .map(([accountId, v]) => ({
      accountId,
      debe: v.debe > v.haber ? v.debe - v.haber : 0,
      haber: v.haber > v.debe ? v.haber - v.debe : 0,
    }))
    .filter((l) => l.debe > 0 || l.haber > 0);
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
  const resolve = (clave: string): number => {
    const id = accId.get(clave);
    if (id) return id;
    // Claves opcionales (medios de pago) sin cuenta propia -> caen a CAJA.
    if (CLAVES_OPCIONALES.has(clave)) {
      const caja = accId.get("CAJA");
      if (caja) return caja;
    }
    throw new Error(`Falta configurar la cuenta para "${clave}" (Contabilidad > Configuracion de cuentas)`);
  };

  // Cuentas por categoria (compra/venta/devolucion) de la empresa, para imputar
  // ventas y compras a la cuenta de cada categoria en vez de la clave global.
  const catConfigs = await prisma.categoryAccountConfig.findMany({
    where: { companyId },
    select: { categoryId: true, cuentaCompraId: true, cuentaVentaId: true, cuentaDevolucionId: true },
  });
  const catCfg = new Map(catConfigs.map((c) => [c.categoryId, c]));
  const catAccount = (categoryId: number | null | undefined, moments: CategoryMoment[]): number | null => {
    if (categoryId == null) return null;
    const cfg = catCfg.get(categoryId);
    if (!cfg) return null;
    for (const m of moments) {
      const id = m === "compra" ? cfg.cuentaCompraId : m === "venta" ? cfg.cuentaVentaId : cfg.cuentaDevolucionId;
      if (id != null) return id;
    }
    return null;
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

      // Resuelve cada borrador a su cuenta y fusiona por cuenta (varias categorias sin
      // cuenta propia caen a la misma clave global: se netean en una sola linea).
      const lines = computeEntryLines(ev.tipo, payload, resolve, catAccount);
      const totalDebe = lines.reduce((s, l) => s + l.debe, 0);
      const totalHaber = lines.reduce((s, l) => s + l.haber, 0);
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
              create: lines.map((l) => ({ accountId: l.accountId, debe: l.debe, haber: l.haber })),
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
