"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Module } from "@/lib/types";

export interface MenuItem {
  key: string;
  programa: string;
  programaCodigo: string;
  modulo: string;
  moduloCodigo: string;
  categoria: string;
  ruta: string;
}

// Cache a nivel de modulo: el catalogo de menus cambia muy poco,
// asi que lo traemos una sola vez por sesion de pagina.
let cache: MenuItem[] | null = null;
let cachePromise: Promise<MenuItem[]> | null = null;

export async function loadMenuItems(): Promise<MenuItem[]> {
  if (cache) return cache;
  if (!cachePromise) {
    cachePromise = api<Module[]>("/catalog/modules")
      .then((modules) => {
        const items: MenuItem[] = [];
        for (const m of modules) {
          for (const p of m.programs) {
            // Solo programas con ruta navegable
            if (!p.ruta) continue;
            items.push({
              key: `${m.codigo}-${p.codigo}`,
              programa: p.nombre,
              programaCodigo: p.codigo,
              modulo: m.nombre,
              moduloCodigo: m.codigo,
              categoria: p.categoria,
              ruta: p.ruta,
            });
          }
        }
        cache = items;
        return items;
      })
      .catch(() => {
        cachePromise = null;
        return [];
      });
  }
  return cachePromise;
}

const MAX_RESULTS = 8;

export function MenuSearch() {
  const router = useRouter();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [items, setItems] = useState<MenuItem[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    loadMenuItems().then(setItems);
    if (typeof navigator !== "undefined") {
      setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  // Atajo global Ctrl+K / Cmd+K -> foco al input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cerrar al hacer click afuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Solo programas permitidos para el usuario (el superadmin ve todo)
  const allowed = useMemo(() => {
    if (!user || user.isSuperadmin) return items;
    return items.filter((it) => user.permisos.includes(it.programaCodigo));
  }, [items, user]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return allowed
      .filter(
        (it) =>
          it.programa.toLowerCase().includes(term) ||
          it.programaCodigo.toLowerCase().includes(term) ||
          it.modulo.toLowerCase().includes(term)
      )
      .slice(0, MAX_RESULTS);
  }, [allowed, q]);

  // Reset del item activo cuando cambia la busqueda
  useEffect(() => {
    setActive(0);
  }, [q]);

  const go = useCallback(
    (item: MenuItem) => {
      setOpen(false);
      setQ("");
      inputRef.current?.blur();
      router.push(item.ruta);
    },
    [router]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) go(item);
    }
  }

  // Mantener visible el item activo
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const showDropdown = open && q.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="menu-search-list"
          aria-autocomplete="list"
          placeholder="Buscar menu o programa..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-lg border border-border bg-muted/60 pl-9 pr-16 text-sm text-foreground transition-colors duration-200 placeholder:text-slate-400 hover:bg-muted focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400">
          {isMac ? "Cmd K" : "Ctrl K"}
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-white shadow-lg animate-fade-in">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">Sin resultados</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Proba con otro nombre o codigo de programa.
              </p>
            </div>
          ) : (
            <ul ref={listRef} id="menu-search-list" role="listbox" className="max-h-80 overflow-y-auto py-1.5">
              {results.map((it, i) => (
                <li key={it.key} data-idx={i} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(it)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      i === active ? "bg-muted" : "hover:bg-muted/60"
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">{it.programa}</span>
                      <span className="truncate text-xs text-slate-400">
                        {it.modulo} &middot; <span className="font-mono">{it.programaCodigo}</span>
                      </span>
                    </span>
                    {i === active && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
