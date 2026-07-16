"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Article } from "@/lib/types";

interface Props {
  onSelect: (article: Article) => void;
  placeholder?: string;
  // Si se indica, la busqueda solo trae articulos de ese rubro (limita segun el
  // punto de expedicion elegido al vender).
  rubroId?: number | null;
  // Deshabilita la busqueda (ej. mientras no se eligio el punto de expedicion).
  disabled?: boolean;
  // Permite al padre acceder al input de busqueda (ej. para devolverle el focus).
  inputRef?: React.Ref<HTMLInputElement>;
}

// Busqueda con debounce + dropdown + navegacion por teclado (guia UX de la skill).
export function ArticleAutocomplete({ onSelect, placeholder = "Buscar articulo por codigo o descripcion...", rubroId, disabled, inputRef }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Article[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled || !q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const rubroParam = rubroId ? `&rubroId=${rubroId}` : "";
        const data = await api<Article[]>(`/articles?activo=true&q=${encodeURIComponent(q)}${rubroParam}`);
        setResults(data.slice(0, 8));
        setActive(0);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, rubroId, disabled]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function choose(a: Article) {
    onSelect(a);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-slate-400"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-lg">
          {loading && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">Buscando...</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">
              Sin resultados. Proba con otro codigo o descripcion.
            </li>
          ) : (
            results.map((a, i) => (
              <li
                key={a.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(a);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                  i === active ? "bg-accent/10" : ""
                }`}
              >
                <span className="text-foreground">{a.descripcion}</span>
                <span className="font-mono text-xs font-semibold text-slate-500">{a.codigo}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
