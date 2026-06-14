"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Field";
import { Search, ChevronDown, Plus } from "lucide-react";

interface Props {
  selected: Customer | null;
  onSelect: (c: Customer) => void;
  /** Si se pasa, muestra el boton "+" para crear un cliente nuevo. */
  onAdd?: () => void;
  id?: string;
}

// Selector de cliente con modal de busqueda (nombre/razon social, documento, RUC).
// Pensado para muchos clientes, donde un <select> nativo se vuelve inmanejable.
export function CustomerPicker({ selected, onSelect, onAdd, id }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  // Busqueda server-side con debounce mientras el modal esta abierto.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await api<Customer[]>(`/customers${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  function choose(c: Customer) {
    onSelect(c);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          id={id}
          onClick={() => setOpen(true)}
          className="flex h-10 flex-1 cursor-pointer items-center justify-between rounded-lg border border-border bg-white px-3 text-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        >
          <span className={selected ? "text-foreground" : "text-slate-400"}>
            {selected ? selected.person.razonSocial : "-- Selecciona --"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label="Crear cliente"
            title="Crear cliente"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-secondary transition-colors hover:border-primary hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Buscar cliente">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Nombre, documento o RUC..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border border-border">
            {loading && results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">
                {q.trim() ? "Sin resultados." : "Escribi para buscar un cliente."}
              </p>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => choose(c)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-muted/60 ${
                    selected?.id === c.id ? "bg-accent/10" : ""
                  }`}
                >
                  <span className="text-foreground">{c.person.razonSocial}</span>
                  <span className="font-mono text-xs text-slate-500">{c.person.ruc || c.person.nroDoc}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
