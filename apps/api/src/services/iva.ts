import type { IvaTipo } from "@prisma/client";

/**
 * Desglosa el IVA de un monto que YA lo incluye (modelo paraguayo: precios con IVA).
 *  - IVA 10%: iva = monto / 11
 *  - IVA 5% : iva = monto / 21
 *  - Exenta : iva = 0
 * Devuelve montos en enteros (Guaranies sin decimales).
 */
export function desglosarIvaIncluido(montoConIva: number, tipo: IvaTipo): { neto: number; iva: number } {
  const bruto = Math.round(montoConIva);
  let iva = 0;
  if (tipo === "IVA10") iva = Math.round(bruto / 11);
  else if (tipo === "IVA5") iva = Math.round(bruto / 21);
  return { neto: bruto - iva, iva };
}
