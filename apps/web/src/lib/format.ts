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

export const TIPO_DOC_LABEL: Record<string, string> = {
  FACTURA: "Factura",
  NOTA_CREDITO: "Nota de credito",
  NOTA_DEBITO: "Nota de debito",
  REMISION: "Remision",
};

// Fecha corta (dd/mm/aaaa). Acepta ISO string o Date.
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
}
