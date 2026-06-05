// Formato de montos. Por defecto Guaranies (sin decimales).
const gs = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

export function formatGs(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  if (Number.isNaN(n)) return "0";
  return gs.format(n);
}

export const IVA_LABEL: Record<string, string> = {
  IVA10: "10%",
  IVA5: "5%",
  EXENTA: "Exenta",
};
