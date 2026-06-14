import { prisma } from "../db.js";

// Cuentas imputables del plan estandar (deben existir por empresa, ver seed).
const CTA = {
  CAJA: "1.1.01.001",
  DEUDORES: "1.1.02.001",
  IVA_CREDITO: "1.1.03.001",
  PROVEEDORES: "2.1.01.001",
  IVA_DEBITO: "2.1.02.001",
  VENTAS: "4.1.01.001",
  COMPRAS: "5.1.01.001",
} as const;

interface LineDraft {
  codigo: string;
  debe: number;
  haber: number;
  detalle?: string;
}

const r = (n: number) => Math.round(Number(n) || 0);

/**
 * Traduce un evento contable a las lineas del asiento (debe/haber por cuenta).
 * neto = exenta + gravadas; iva = iva5 + iva10. Modelo paraguayo (IVA incluido
 * ya desglosado en el evento). Las lineas en cero se descartan luego.
 */
function buildLines(tipo: string, p: Record<string, unknown>): LineDraft[] {
  const num = (k: string) => r(p[k] as number);
  const neto = num("subtotalExenta") + num("subtotal5") + num("subtotal10");
  const iva = num("iva5") + num("iva10");
  const total = num("total");

  switch (tipo) {
    case "VENTA_CONTADO":
      return [
        { codigo: CTA.CAJA, debe: total, haber: 0 },
        { codigo: CTA.VENTAS, debe: 0, haber: neto },
        { codigo: CTA.IVA_DEBITO, debe: 0, haber: iva },
      ];
    case "VENTA_CREDITO": {
      const entrega = num("entrega");
      const financiado = total - entrega;
      return [
        { codigo: CTA.CAJA, debe: entrega, haber: 0 },
        { codigo: CTA.DEUDORES, debe: financiado, haber: 0 },
        { codigo: CTA.VENTAS, debe: 0, haber: neto },
        { codigo: CTA.IVA_DEBITO, debe: 0, haber: iva },
      ];
    }
    case "COMPRA": {
      const contado = (p.condicion as string) === "CONTADO";
      return [
        { codigo: CTA.COMPRAS, debe: neto, haber: 0 },
        { codigo: CTA.IVA_CREDITO, debe: iva, haber: 0 },
        { codigo: contado ? CTA.CAJA : CTA.PROVEEDORES, debe: 0, haber: total },
      ];
    }
    case "COBRO":
      return [
        { codigo: CTA.CAJA, debe: num("montoTotal"), haber: 0 },
        { codigo: CTA.DEUDORES, debe: 0, haber: num("montoTotal") },
      ];
    case "PAGO":
      return [
        { codigo: CTA.PROVEEDORES, debe: num("montoTotal"), haber: 0 },
        { codigo: CTA.CAJA, debe: 0, haber: num("montoTotal") },
      ];
    case "PAGO_ANULADO": // reversa de pago (cheque rechazado/anulado): repone la deuda
      return [
        { codigo: CTA.CAJA, debe: num("montoTotal"), haber: 0 },
        { codigo: CTA.PROVEEDORES, debe: 0, haber: num("montoTotal") },
      ];
    case "NOTA_CREDITO_VENTA": // reversa de venta
      return [
        { codigo: CTA.VENTAS, debe: neto, haber: 0 },
        { codigo: CTA.IVA_DEBITO, debe: iva, haber: 0 },
        { codigo: CTA.DEUDORES, debe: 0, haber: total },
      ];
    case "NOTA_CREDITO_COMPRA": // reversa de compra
      return [
        { codigo: CTA.PROVEEDORES, debe: total, haber: 0 },
        { codigo: CTA.COMPRAS, debe: 0, haber: neto },
        { codigo: CTA.IVA_CREDITO, debe: 0, haber: iva },
      ];
    case "VENTA_ANULADA": {
      // Reversa exacta del asiento de la venta (contado o credito).
      const contado = (p.condicion as string) === "CONTADO";
      if (contado) {
        return [
          { codigo: CTA.VENTAS, debe: neto, haber: 0 },
          { codigo: CTA.IVA_DEBITO, debe: iva, haber: 0 },
          { codigo: CTA.CAJA, debe: 0, haber: total },
        ];
      }
      const entrega = num("entrega");
      const financiado = total - entrega;
      return [
        { codigo: CTA.VENTAS, debe: neto, haber: 0 },
        { codigo: CTA.IVA_DEBITO, debe: iva, haber: 0 },
        { codigo: CTA.CAJA, debe: 0, haber: entrega },
        { codigo: CTA.DEUDORES, debe: 0, haber: financiado },
      ];
    }
    case "COMPRA_ANULADA": {
      const contado = (p.condicion as string) === "CONTADO";
      return [
        { codigo: contado ? CTA.CAJA : CTA.PROVEEDORES, debe: total, haber: 0 },
        { codigo: CTA.COMPRAS, debe: 0, haber: neto },
        { codigo: CTA.IVA_CREDITO, debe: 0, haber: iva },
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

/** Saldos acumulados por cuenta (solo cuentas con movimiento), ordenados por codigo. */
export async function getAccountBalances(companyId: number): Promise<AccountBalance[]> {
  const grupos = await prisma.accountingEntryLine.groupBy({
    by: ["accountId"],
    where: { entry: { companyId } },
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
  const accounts = await prisma.chartOfAccount.findMany({
    where: { companyId },
    select: { id: true, codigo: true },
  });
  const accId = new Map(accounts.map((a) => [a.codigo, a.id]));
  const resolve = (codigo: string) => {
    const id = accId.get(codigo);
    if (!id) throw new Error(`Falta la cuenta ${codigo} en el plan de cuentas`);
    return id;
  };

  const events = await prisma.accountingEvent.findMany({
    where: { companyId, procesado: false },
    orderBy: { id: "asc" },
  });

  // Numero de asiento correlativo por empresa
  let numero = await prisma.accountingEntry.count({ where: { companyId } });

  const result: ProcessResult = { procesados: 0, errores: 0, detalleErrores: [] };

  for (const ev of events) {
    try {
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      const lines = buildLines(ev.tipo, payload).filter((l) => r(l.debe) > 0 || r(l.haber) > 0);
      const totalDebe = lines.reduce((s, l) => s + r(l.debe), 0);
      const totalHaber = lines.reduce((s, l) => s + r(l.haber), 0);
      if (lines.length === 0) throw new Error("El evento no genero lineas");
      if (totalDebe !== totalHaber) throw new Error(`Asiento descuadrado (debe ${totalDebe} != haber ${totalHaber})`);

      numero += 1;
      const numeroAsiento = numero;
      await prisma.$transaction(async (tx) => {
        const entry = await tx.accountingEntry.create({
          data: {
            companyId,
            numero: numeroAsiento,
            fecha: ev.createdAt,
            glosa: glosaDe(ev.tipo, payload),
            origenTipo: ev.origenTipo,
            origenId: ev.origenId,
            lines: {
              create: lines.map((l) => ({ accountId: resolve(l.codigo), debe: r(l.debe), haber: r(l.haber), detalle: l.detalle ?? null })),
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
