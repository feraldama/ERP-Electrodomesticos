import type { CuentaTipo } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../http.js";
import { diaContable } from "../lib/fechas.js";
import { assertPeriodoAbierto, enColaContable, rolesDeEvento, siguienteNumeroAsiento } from "./accounting.js";

// =====================================================================
// RECLASIFICACION DE CUENTAS (CONP012)
// Traspasa el saldo de una cuenta a otra con un asiento (origenTipo
// RECLASIFICACION). Caso tipico: se cambio el plan de cuentas con movimientos ya
// registrados y las cuentas viejas (inactivas) conservan saldo.
// =====================================================================

const r = (n: number) => Math.round(Number(n) || 0);

/** Saldo (debe - haber) por cuenta con asientos hasta `hasta` inclusive. */
async function saldosHasta(companyId: number, hasta: Date) {
  const grupos = await prisma.accountingEntryLine.groupBy({
    by: ["accountId"],
    where: { entry: { companyId, fecha: { lte: hasta } } },
    _sum: { debe: true, haber: true },
  });
  return new Map(grupos.map((g) => [g.accountId, r(Number(g._sum.debe ?? 0) - Number(g._sum.haber ?? 0))]));
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !["del", "las", "los", "por", "para"].includes(w));

/**
 * Que funcion (clave operativa) cumplia una cuenta, inferido de sus asientos: se
 * recalcula cada evento que la uso y se busca la clave que genero exactamente ese
 * importe de ese lado. Devuelve la clave mas votada, o null si no hay evidencia.
 */
async function inferirClave(companyId: number, accountId: number): Promise<string | null> {
  const lineas = await prisma.accountingEntryLine.findMany({
    where: { accountId, entry: { companyId } },
    select: { entryId: true, debe: true, haber: true },
    take: 200,
  });
  if (lineas.length === 0) return null;
  const eventos = await prisma.accountingEvent.findMany({
    where: { companyId, entryId: { in: [...new Set(lineas.map((l) => l.entryId))] } },
    select: { entryId: true, tipo: true, payload: true },
  });
  const evDe = new Map(eventos.map((e) => [e.entryId!, e]));
  const votos = new Map<string, number>();
  for (const l of lineas) {
    const ev = evDe.get(l.entryId);
    if (!ev) continue;
    let roles: ReturnType<typeof rolesDeEvento>;
    try {
      roles = rolesDeEvento(ev.tipo, (ev.payload ?? {}) as Record<string, unknown>);
    } catch {
      continue;
    }
    const debe = r(Number(l.debe));
    const haber = r(Number(l.haber));
    const match = roles.filter((x) => x.debe === debe && x.haber === haber);
    if (match.length === 1) votos.set(match[0].clave, (votos.get(match[0].clave) ?? 0) + 1);
  }
  return [...votos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export interface CuentaReclasificable {
  accountId: number;
  codigo: string;
  nombre: string;
  tipo: CuentaTipo;
  activo: boolean;
  imputable: boolean;
  saldo: number; // debe - haber (>0 deudor, <0 acreedor)
  sugerida: boolean; // cuenta inactiva o no imputable con saldo: deberia reclasificarse
  destinoSugeridoId: number | null;
  motivoSugerencia: string | null;
}

/** Cuentas con saldo a la fecha y, para las que conviene reclasificar, un destino sugerido. */
export async function cuentasReclasificables(companyId: number, hasta: Date): Promise<CuentaReclasificable[]> {
  const saldos = await saldosHasta(companyId, hasta);
  const ids = [...saldos.entries()].filter(([, s]) => s !== 0).map(([id]) => id);
  const [cuentas, destinos, config] = await Promise.all([
    prisma.chartOfAccount.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, codigo: true, nombre: true, tipo: true, activo: true, imputable: true },
    }),
    prisma.chartOfAccount.findMany({
      where: { companyId, activo: true, imputable: true },
      select: { id: true, codigo: true, nombre: true, tipo: true },
      orderBy: { codigo: "asc" },
    }),
    prisma.accountingConfig.findMany({ where: { companyId }, select: { clave: true, accountId: true } }),
  ]);
  const cuentaDeClave = new Map(config.map((c) => [c.clave, c.accountId]));
  const enConfig = new Set(config.map((c) => c.accountId));

  const out: CuentaReclasificable[] = [];
  for (const c of cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    const sugerida = !c.activo || !c.imputable;
    let destinoSugeridoId: number | null = null;
    let motivoSugerencia: string | null = null;
    if (sugerida) {
      // 1) Por funcion: la cuenta configurada hoy para la clave que cumplia.
      const clave = await inferirClave(companyId, c.id);
      const porClave = clave ? cuentaDeClave.get(clave) : undefined;
      if (porClave && porClave !== c.id) {
        destinoSugeridoId = porClave;
        motivoSugerencia = `Cumplia la funcion ${clave}`;
      } else {
        // 2) Por nombre: mismo tipo, mas palabras en comun (desempata la configurada).
        const palabras = new Set(normalizar(c.nombre));
        let mejor = { id: 0, score: 0 };
        for (const d of destinos) {
          if (d.tipo !== c.tipo || d.id === c.id) continue;
          const comunes = normalizar(d.nombre).filter((w) => palabras.has(w)).length;
          const score = comunes + (comunes > 0 && enConfig.has(d.id) ? 0.5 : 0);
          if (score > mejor.score) mejor = { id: d.id, score };
        }
        if (mejor.id) {
          destinoSugeridoId = mejor.id;
          motivoSugerencia = "Nombre similar";
        }
      }
    }
    out.push({ accountId: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, activo: c.activo, imputable: c.imputable, saldo: saldos.get(c.id) ?? 0, sugerida, destinoSugeridoId, motivoSugerencia });
  }
  return out;
}

export interface ReclasificarInput {
  companyId: number;
  fecha: Date;
  glosa?: string | null;
  items: Array<{ origenId: number; destinoId: number }>;
}

/**
 * Genera UN asiento que lleva a cero el saldo de cada cuenta origen (a la fecha)
 * contra su cuenta destino. Los saldos se recalculan aca: no se confia en los del
 * cliente. Cuadra por construccion (cada traspaso es debe = haber).
 */
export async function reclasificar(input: ReclasificarInput): Promise<{ numero: number; lineas: number; total: number }> {
  const { companyId } = input;
  const fecha = diaContable(input.fecha);
  if (input.items.length === 0) throw new HttpError(400, "Selecciona al menos una cuenta a reclasificar");
  const origenes = input.items.map((i) => i.origenId);
  if (new Set(origenes).size !== origenes.length) throw new HttpError(400, "Una cuenta origen esta repetida");
  if (input.items.some((i) => i.origenId === i.destinoId)) throw new HttpError(400, "La cuenta destino debe ser distinta de la origen");

  await assertPeriodoAbierto(prisma, companyId, fecha);

  const ids = [...new Set([...origenes, ...input.items.map((i) => i.destinoId)])];
  const cuentas = await prisma.chartOfAccount.findMany({
    where: { companyId, id: { in: ids } },
    select: { id: true, codigo: true, nombre: true, activo: true, imputable: true },
  });
  const cuenta = new Map(cuentas.map((c) => [c.id, c]));
  for (const i of input.items) {
    const o = cuenta.get(i.origenId);
    const d = cuenta.get(i.destinoId);
    if (!o || !d) throw new HttpError(400, "Cuenta invalida");
    if (!d.activo || !d.imputable) throw new HttpError(400, `La cuenta destino ${d.codigo} debe estar activa e imputable`);
  }

  return enColaContable(companyId, async () => {
    const saldos = await saldosHasta(companyId, fecha);
    const lines: Array<{ accountId: number; debe: number; haber: number; detalle: string }> = [];
    let total = 0;
    for (const i of input.items) {
      const saldo = saldos.get(i.origenId) ?? 0;
      if (saldo === 0) continue;
      const o = cuenta.get(i.origenId)!;
      const d = cuenta.get(i.destinoId)!;
      const monto = Math.abs(saldo);
      // Saldo deudor: se acredita el origen y se debita el destino (y al reves).
      lines.push({ accountId: o.id, debe: saldo < 0 ? monto : 0, haber: saldo > 0 ? monto : 0, detalle: `Reclasificacion hacia ${d.codigo} ${d.nombre}` });
      lines.push({ accountId: d.id, debe: saldo > 0 ? monto : 0, haber: saldo < 0 ? monto : 0, detalle: `Reclasificacion desde ${o.codigo} ${o.nombre}` });
      total += monto;
    }
    if (lines.length === 0) throw new HttpError(400, "Las cuentas seleccionadas no tienen saldo a esa fecha");

    const periodo = await prisma.fiscalPeriod.findFirst({
      where: { companyId, fechaInicio: { lte: fecha }, fechaFin: { gte: fecha } },
      select: { id: true },
    });
    const numero = await prisma.$transaction(async (tx) => {
      const n = await siguienteNumeroAsiento(tx, companyId);
      await tx.accountingEntry.create({
        data: {
          companyId,
          periodId: periodo?.id ?? null,
          numero: n,
          fecha,
          glosa: input.glosa?.trim() || "Reclasificacion de cuentas",
          origenTipo: "RECLASIFICACION",
          lines: { create: lines },
        },
      });
      return n;
    });
    return { numero, lineas: lines.length, total };
  });
}
