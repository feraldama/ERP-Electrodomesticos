import type { IvaTipo } from "./types";

/**
 * Desglosa el IVA de un monto que ya lo incluye (modelo paraguayo).
 * IVA 10% -> monto/11 ; IVA 5% -> monto/21 ; Exenta -> 0. Enteros (Gs).
 */
export function desglosarIvaIncluido(montoConIva: number, tipo: IvaTipo): { neto: number; iva: number } {
  const bruto = Math.round(montoConIva || 0);
  let iva = 0;
  if (tipo === "IVA10") iva = Math.round(bruto / 11);
  else if (tipo === "IVA5") iva = Math.round(bruto / 21);
  return { neto: bruto - iva, iva };
}
