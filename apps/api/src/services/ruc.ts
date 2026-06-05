/**
 * Calculo del digito verificador del RUC paraguayo (modulo 11).
 * Para una persona fisica el RUC es: numero de cedula + "-" + DV.
 * Se usa el VALOR NUMERICO de cada digito, ponderado 2,3,4,... (reinicia al pasar la base).
 * Ej: 2858238 -> DV 1 ; 80055123 -> DV ... .
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

// RUC a partir del numero de cedula (solo numeros)
export function rucDesdeCedula(cedula: string): string {
  const limpio = String(cedula).replace(/\D/g, "");
  if (!limpio) return "";
  return `${limpio}-${calcularDV(limpio)}`;
}
