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

// --- Monto en letras (para pagares y recibos) ---
// Convierte un entero no negativo a palabras en español. Pensado para Guaranies
// (montos enteros, sin decimales). Soporta hasta billones.

const _UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const _ESPECIALES: Record<number, string> = {
  10: "diez", 11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
  16: "dieciseis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve",
  20: "veinte", 21: "veintiuno", 22: "veintidos", 23: "veintitres", 24: "veinticuatro",
  25: "veinticinco", 26: "veintiseis", 27: "veintisiete", 28: "veintiocho", 29: "veintinueve",
};
const _DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const _CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

// Un grupo de 0..999 a palabras.
function _seccion(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let out = c > 0 ? _CENTENAS[c] : "";
  if (resto > 0) {
    let r: string;
    if (resto < 10) r = _UNIDADES[resto];
    else if (resto <= 29) r = _ESPECIALES[resto];
    else {
      const u = resto % 10;
      r = _DECENAS[Math.floor(resto / 10)] + (u > 0 ? " y " + _UNIDADES[u] : "");
    }
    out = out ? `${out} ${r}` : r;
  }
  return out;
}

// Apocope de "uno" -> "un" cuando precede a un sustantivo (mil, millon...).
function _apocope(s: string): string {
  return s.replace(/veintiuno$/, "veintiun").replace(/\buno$/, "un");
}

export function numeroALetras(value: number | string): string {
  const n = Math.round(Math.abs(typeof value === "string" ? Number(value) : value));
  if (Number.isNaN(n)) return "";
  if (n === 0) return "cero";

  // Grupos de 3 cifras: [0]=unidades, [1]=miles, [2]=millones, [3]=miles de millones, [4]=billones
  const grupos: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);

  const singular = ["", "mil", "millon", "mil millones", "billon"];
  const plural = ["", "mil", "millones", "mil millones", "billones"];

  const partes: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (g === 0) continue;
    if (i === 0) partes.push(_seccion(g));
    else if (i === 1) partes.push(g === 1 ? "mil" : `${_apocope(_seccion(g))} mil`);
    else partes.push(g === 1 ? `un ${singular[i]}` : `${_apocope(_seccion(g))} ${plural[i]}`);
  }
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

// Fecha corta (dd/mm/aaaa). Acepta ISO string o Date.
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Fecha y hora (dd/mm/aaaa hh:mm). Acepta ISO string o Date.
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
}
