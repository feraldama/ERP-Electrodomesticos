"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manejo de foco compartido para las pantallas que agregan articulos a una lista
 * con un input de cantidad por fila (ventas, compras, ajustes, movimientos, etc.).
 *
 * Comportamiento:
 * - Al agregar un articulo, el foco salta al input de cantidad de esa fila y
 *   selecciona su contenido (para sobrescribir el "1" tipeando).
 * - Al presionar Tab desde la cantidad, el foco vuelve al buscador de articulos,
 *   listo para agregar el siguiente. (Shift+Tab mantiene el comportamiento normal.)
 *
 * Uso:
 *   const { searchRef, registerQty, focusQty, qtyTabToSearch } = useArticleRowFocus();
 *   <ArticleAutocomplete onSelect={addArticle} inputRef={searchRef} />
 *   // en addArticle, tras agregar la fila:  focusQty(a.id)
 *   <input ref={registerQty(l.article.id)} onKeyDown={qtyTabToSearch} ... />
 */
export function useArticleRowFocus() {
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [focusId, setFocusId] = useState<number | null>(null);

  // Corre despues del render que agrego la fila, cuando el ref ya esta poblado.
  useEffect(() => {
    if (focusId == null) return;
    const el = qtyRefs.current[focusId];
    if (el) {
      el.focus();
      el.select();
    }
    setFocusId(null);
  }, [focusId]);

  const registerQty = useCallback(
    (id: number) => (el: HTMLInputElement | null) => {
      qtyRefs.current[id] = el;
    },
    [],
  );

  // Llamar tras agregar un articulo para llevar el foco a su cantidad.
  const focusQty = useCallback((id: number) => setFocusId(id), []);

  // onKeyDown del input de cantidad: Tab devuelve el foco al buscador.
  const qtyTabToSearch = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }, []);

  return { searchRef, registerQty, focusQty, qtyTabToSearch };
}
