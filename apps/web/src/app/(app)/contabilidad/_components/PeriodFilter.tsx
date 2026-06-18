"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export interface Range {
  desde: string;
  hasta: string;
}

// Barra de filtro por rango de fechas para los reportes contables. Vacio = todo
// el historico. Llama onApply con el rango al presionar "Aplicar" o "Todo".
export function PeriodFilter({ onApply }: { onApply: (r: Range) => void }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ desde, hasta });
      }}
    >
      <Field label="Desde" htmlFor="pf-desde">
        <Input id="pf-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </Field>
      <Field label="Hasta" htmlFor="pf-hasta">
        <Input id="pf-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </Field>
      <Button type="submit">Aplicar</Button>
      {(desde || hasta) && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDesde("");
            setHasta("");
            onApply({ desde: "", hasta: "" });
          }}
        >
          Todo
        </Button>
      )}
    </form>
  );
}

// Arma el query string ?desde=&hasta= a partir de un rango (omite vacios).
export function rangeQuery(r: Range): string {
  const p = new URLSearchParams();
  if (r.desde) p.set("desde", r.desde);
  if (r.hasta) p.set("hasta", r.hasta);
  const s = p.toString();
  return s ? `?${s}` : "";
}
