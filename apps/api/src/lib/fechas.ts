import { HttpError } from "../http.js";

// Convencion de fechas de documento y contables: un "dia" se representa como la
// medianoche UTC de ese dia, que es lo que produce `new Date("YYYY-MM-DD")` cuando
// el front manda la fecha del comprobante. Rangos, ejercicios y asientos usan la
// misma convencion para que un documento del 01/01 caiga en el ejercicio que
// empieza el 01/01 sin importar la zona horaria del servidor.

/** "YYYY-MM-DD" -> inicio (00:00:00.000Z) o fin (23:59:59.999Z) de ese dia. */
export function ymdToUtc(s: string, end: boolean): Date {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? "23:59:59.999" : "00:00:00.000"}Z`) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Fecha invalida (use YYYY-MM-DD)");
  return d;
}

/**
 * Normaliza un instante al dia contable. Una fecha de documento (medianoche UTC)
 * se respeta tal cual; un instante real (ej. createdAt de una anulacion) se lleva
 * al dia local en que ocurrio.
 */
export function diaContable(d: Date): Date {
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return d;
  }
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Ejercicio que contiene la fecha (por dia contable), o null. */
export function periodoDe<T extends { fechaInicio: Date; fechaFin: Date }>(periods: T[], fecha: Date): T | null {
  const dia = diaContable(fecha);
  return periods.find((p) => dia >= p.fechaInicio && dia <= p.fechaFin) ?? null;
}

/** Rango opcional ?desde=&hasta= (YYYY-MM-DD, hasta inclusive) para un where de Prisma. */
export function parseRange(req: { query: Record<string, unknown> }) {
  const desde = req.query.desde ? ymdToUtc(String(req.query.desde), false) : undefined;
  const hasta = req.query.hasta ? ymdToUtc(String(req.query.hasta), true) : undefined;
  const fecha: { gte?: Date; lte?: Date } = {};
  if (desde) fecha.gte = desde;
  if (hasta) fecha.lte = hasta;
  return Object.keys(fecha).length ? fecha : undefined;
}

/**
 * Fecha de un comprobante recibida del front -> dia contable. Acepta "YYYY-MM-DD"
 * (lo normal, de un input date) o un ISO con hora (se lleva al dia local en que
 * ocurrio). Rechaza fechas invalidas en vez de grabar "Invalid Date".
 */
export function parseFechaDoc(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return ymdToUtc(s, false);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Fecha invalida (use YYYY-MM-DD)");
  return diaContable(d);
}
