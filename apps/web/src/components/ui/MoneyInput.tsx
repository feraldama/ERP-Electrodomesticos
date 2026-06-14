import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const inputBase =
  "flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-slate-500";

// Separador de miles para Guaranies (sin decimales): es-PY usa punto.
const fmt = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

/** Texto del input (con separadores de miles) -> solo digitos. */
function toRaw(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Normaliza el value del prop a digitos enteros. El prop puede venir como:
 *  - estado del form (solo digitos: "1500000")
 *  - valor del API (Decimal, ej. "1500000.0000" o "1500.5") -> parte entera
 * Si no parsea como numero, se descartan los no-digitos como ultimo recurso.
 */
function rawFromProp(value: string): string {
  if (!value) return "";
  const n = Number(value);
  if (!Number.isNaN(n)) return String(Math.round(Math.abs(n)));
  return value.replace(/\D/g, "");
}

/** "1500000" -> "1.500.000" para mostrar mientras se escribe. */
function toDisplay(raw: string): string {
  if (!raw) return "";
  const n = Number(raw);
  if (Number.isNaN(n)) return "";
  return fmt.format(n);
}

interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Valor crudo en string (solo digitos), igual que el resto de los inputs del form. */
  value: string;
  /** Devuelve el valor crudo en string (solo digitos). */
  onChange: (value: string) => void;
}

// Input de monto con separador de miles visible al tipear.
// Guarda y emite el valor crudo (solo digitos) para mantener compatibilidad con el form state.
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { className, value, onChange, ...rest },
  ref
) {
  const raw = rawFromProp(value ?? "");
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={cn(inputBase, "text-right font-mono tabular-nums", className)}
      value={toDisplay(raw)}
      onChange={(e) => onChange(toRaw(e.target.value))}
      {...rest}
    />
  );
});
