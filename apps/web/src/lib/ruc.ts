/**
 * Digito verificador del RUC paraguayo (modulo 11).
 * El RUC de una persona fisica es: numero de cedula + "-" + DV.
 * Usa el VALOR NUMERICO de cada digito, ponderado 2,3,4,... (reinicia al pasar la base).
 * Ej verificado: 2858238 -> DV 1.
 */
export function calcularDV(numeroBase: string, base = 11): number {
  const limpio = String(numeroBase).replace(/[^0-9]/g, "");
  let total = 0;
  let k = 2;
  for (let i = limpio.length - 1; i >= 0; i--) {
    if (k > base) k = 2;
    total += Number(limpio[i]) * k;
    k++;
  }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}

export function rucDesdeCedula(cedula: string): string {
  const limpio = String(cedula).replace(/\D/g, "");
  if (!limpio) return "";
  return `${limpio}-${calcularDV(limpio)}`;
}
