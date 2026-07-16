import type { StockMovTipo } from "@/lib/types";

export const TIPO_LABEL: Record<StockMovTipo, string> = {
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste",
};

export const TIPO_BADGE: Record<StockMovTipo, string> = {
  INGRESO: "bg-emerald-50 text-emerald-700",
  EGRESO: "bg-red-50 text-destructive",
  TRANSFERENCIA: "bg-blue-50 text-blue-700",
  AJUSTE: "bg-amber-50 text-amber-700",
};

export function TipoBadge({ tipo }: { tipo: StockMovTipo }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_BADGE[tipo]}`}>
      {TIPO_LABEL[tipo]}
    </span>
  );
}
