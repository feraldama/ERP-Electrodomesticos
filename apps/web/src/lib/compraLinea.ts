import type { Article, IvaTipo } from "@/lib/types";
import { desglosarIvaIncluido } from "@/lib/iva";

export const TASAS: IvaTipo[] = ["IVA10", "IVA5", "EXENTA"];

export type ImportesIva = Record<IvaTipo, number>;

// Linea del detalle de una compra (se carga desde el asistente de detalle).
export interface CompraLinea {
  article: Article;
  comprada: number; // unidades que se pagan
  bonificada: number; // unidades sin cargo
  costoUnitario: number; // precio por unidad comprada, con IVA
  descTipo: "PORC" | "FIJO";
  descValor: number; // % (0-100) o importe en Gs segun descTipo
  ivaTipo: IvaTipo; // tasa del articulo: recibe todo el importe mientras no se reparta a mano
  // Importe por tasa cargado a mano (un articulo puede ser parte gravado y parte exento).
  // Si esta, manda sobre costo x cantidad: el costo unitario se deriva de la suma.
  importes: ImportesIva | null;
  series: string[]; // series/IMEI, solo si el articulo controla serie
}

export interface CompraLineaCalc {
  adquirida: number; // compradas + bonificadas (lo que ingresa a stock)
  bruto: number; // compradas x costo
  descuento: number; // en Gs
  neto: number; // importe de la linea con IVA (bruto - descuento)
  partes: ImportesIva; // neto repartido por tasa
  iva10: number;
  iva5: number;
  costoUnitario: number; // costo por unidad comprada (derivado si hay importes)
  costoEfectivo: number; // neto / adquirida
}

export const sinImportes = (): ImportesIva => ({ IVA10: 0, IVA5: 0, EXENTA: 0 });

export function sumaImportes(i: ImportesIva) {
  return i.IVA10 + i.IVA5 + i.EXENTA;
}

/** Bruto y descuento a partir del neto (camino inverso, cuando se cargan los importes). */
function brutoDesdeNeto(neto: number, l: CompraLinea) {
  if (l.descTipo === "PORC") {
    const pct = Math.min(Math.max(l.descValor, 0), 100);
    const bruto = pct < 100 ? Math.round(neto / (1 - pct / 100)) : 0;
    return { bruto, descuento: bruto - neto };
  }
  const descuento = Math.round(l.descValor);
  return { bruto: neto + descuento, descuento };
}

export function calcLinea(l: CompraLinea): CompraLineaCalc {
  const adquirida = l.comprada + l.bonificada;

  let costoUnitario = l.costoUnitario;
  let bruto: number;
  let descuento: number;
  let neto: number;
  let partes: ImportesIva;
  if (l.importes) {
    partes = l.importes;
    neto = sumaImportes(partes);
    ({ bruto, descuento } = brutoDesdeNeto(neto, l));
    costoUnitario = l.comprada > 0 ? bruto / l.comprada : 0;
  } else {
    bruto = Math.round(l.comprada * l.costoUnitario);
    const pct = Math.min(Math.max(l.descValor, 0), 100);
    descuento = l.descTipo === "PORC" ? Math.round((bruto * pct) / 100) : Math.round(l.descValor);
    neto = bruto - descuento;
    partes = { ...sinImportes(), [l.ivaTipo]: neto };
  }

  return {
    adquirida,
    bruto,
    descuento,
    neto,
    partes,
    iva10: desglosarIvaIncluido(partes.IVA10, "IVA10").iva,
    iva5: desglosarIvaIncluido(partes.IVA5, "IVA5").iva,
    costoUnitario,
    costoEfectivo: adquirida > 0 ? neto / adquirida : 0,
  };
}

/**
 * Nuevo costo unitario con importes repartidos a mano: el reparto se mantiene en la
 * misma proporcion para el nuevo neto (el redondeo cae en la tasa de mayor importe).
 */
export function reescalarImportes(l: CompraLinea, nuevoCosto: number): ImportesIva | null {
  if (!l.importes) return null;
  const actual = sumaImportes(l.importes);
  const nuevoNeto = calcLinea({ ...l, costoUnitario: nuevoCosto, importes: null }).neto;
  if (actual <= 0) return { ...sinImportes(), [l.ivaTipo]: nuevoNeto };
  const out = sinImportes();
  for (const t of TASAS) out[t] = Math.round((l.importes[t] * nuevoNeto) / actual);
  const mayor = TASAS.reduce((a, b) => (l.importes![b] > l.importes![a] ? b : a));
  out[mayor] += nuevoNeto - sumaImportes(out);
  return out;
}
