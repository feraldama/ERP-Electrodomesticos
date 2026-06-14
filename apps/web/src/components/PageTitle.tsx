"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { loadMenuItems } from "@/components/MenuSearch";

const APP = "ERP Electrodomesticos";

// Rutas que no son programas del catalogo
const STATIC: Record<string, string> = {
  "/": "Inicio",
};

/**
 * Pone el titulo de la pestaña del navegador con el nombre del programa/modulo
 * actual (solo el nombre del menu, sin sufijo). Si la ruta no matchea ningun
 * programa, cae al nombre de la app.
 *
 * El nombre sale del catalogo de programas (seed: codigo/nombre/ruta), el mismo
 * que alimenta el menu y el buscador. Por eso TODO modulo nuevo registrado en el
 * seed obtiene su titulo automaticamente, sin tocar la pagina.
 */
export function PageTitle() {
  const pathname = usePathname();

  useEffect(() => {
    let cancel = false;
    (async () => {
      let title: string | undefined = STATIC[pathname];

      // Landing de un modulo: /modulo/VEN -> nombre del modulo
      if (!title && pathname.startsWith("/modulo/")) {
        const code = decodeURIComponent(pathname.split("/")[2] ?? "").toUpperCase();
        const items = await loadMenuItems();
        title = items.find((it) => it.moduloCodigo === code)?.modulo;
      }

      // Programa: match exacto o por prefijo (sub-rutas), tomando el mas especifico
      if (!title) {
        const items = await loadMenuItems();
        const match = items
          .filter((it) => pathname === it.ruta || pathname.startsWith(`${it.ruta}/`))
          .sort((a, b) => b.ruta.length - a.ruta.length)[0];
        title = match?.programa;
      }

      if (!cancel) document.title = title ?? APP;
    })();
    return () => {
      cancel = true;
    };
  }, [pathname]);

  return null;
}
