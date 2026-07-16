"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SearchSelectOption {
  value: string;
  label: string;
}

interface Props {
  id?: string;
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Filtro por palabras: cada palabra escrita debe aparecer (contains, case-insensitive)
// en el label, sin importar el orden. Misma semantica que buildWordSearch del backend,
// pero client-side sobre las opciones ya cargadas (ej. plan de cuentas de la empresa).
function matchesWords(label: string, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = label.toLowerCase();
  return words.every((w) => hay.includes(w));
}

const DROPDOWN_MAX_H = 288; // = max-h-72

interface Coords {
  left: number;
  width: number;
  top?: number; // abre hacia abajo
  bottom?: number; // abre hacia arriba (poco espacio debajo)
}

// Select con buscador: input estilo combobox + dropdown filtrable y navegable por teclado.
// El dropdown se renderiza en un portal con posicion fixed para que no lo recorte el
// overflow del contenedor (ej. el cuerpo scrolleable de un Modal).
export function SearchSelect({ id, value, options, onChange, onBlur, placeholder = "Buscar...", disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => (open ? options.filter((o) => matchesWords(o.label, query)) : options),
    [open, options, query]
  );

  const updateCoords = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < DROPDOWN_MAX_H && r.top > spaceBelow;
    setCoords({
      left: r.left,
      width: r.width,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  }, []);

  // Al filtrar, resetea el resaltado al primer resultado.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Reposiciona el dropdown al abrir y mientras esta abierto (scroll de cualquier
  // ancestro con capture:true, y resize de la ventana). Se monta en document.body para
  // que no lo recorte el overflow del cuerpo del Modal; el posicionamiento fixed queda
  // relativo al viewport (montarlo dentro del dialog lo rompe porque el dialog tiene
  // transform, que redefine el bloque contenedor de los hijos fixed).
  useLayoutEffect(() => {
    if (!open) return;
    setPortalEl(document.body);
    updateCoords();
    const onScroll = () => updateCoords();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, updateCoords]);

  // El dropdown vive en document.body, fuera del Radix Dialog. Sin esto, el pointerdown
  // sobre una opcion llega a Radix como "click afuera" y cierra el Modal. Cortamos la
  // propagacion nativa del pointerdown para que Radix nunca lo vea.
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!open || !ul) return;
    const stop = (e: Event) => e.stopPropagation();
    ul.addEventListener("pointerdown", stop);
    return () => ul.removeEventListener("pointerdown", stop);
  }, [open, coords, portalEl]);

  // Mantiene visible el item activo al navegar con el teclado.
  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      // El dropdown vive en un portal (fuera de boxRef), asi que hay que excluir ambos.
      if (boxRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
      setQuery("");
      onBlur?.();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onBlur]);

  function choose(o: SearchSelectOption) {
    onChange(o.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    } else if (e.key === "Tab") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          id={id}
          value={open ? query : selected?.label ?? ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className="flex h-10 w-full cursor-pointer rounded-lg border border-border bg-white px-3 py-2 pr-9 text-sm text-foreground transition-colors duration-200 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-slate-500"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {open &&
        coords &&
        portalEl &&
        createPortal(
          <ul
            ref={listRef}
            style={{
              position: "fixed",
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
            }}
            className="pointer-events-auto z-[60] max-h-72 overflow-auto rounded-lg border border-border bg-white py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">Sin resultados. Proba con otra palabra.</li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o.value || "__empty__"}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                    i === active ? "bg-accent/10" : "",
                    o.value === value ? "font-medium text-primary" : "text-foreground"
                  )}
                >
                  {o.label}
                </li>
              ))
            )}
          </ul>,
          portalEl
        )}
    </div>
  );
}
