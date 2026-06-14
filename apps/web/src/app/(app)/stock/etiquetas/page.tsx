"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatGs } from "@/lib/format";
import type { Article, ArticleBarcode } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Barcode } from "@/components/ui/Barcode";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { useToast } from "@/components/ui/Toast";
import { Printer, Trash2, Tag } from "lucide-react";

interface LabelItem {
  article: Article;
  barcodeValue: string;
  cantidad: number;
}

export default function EtiquetasPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<LabelItem[]>([]);
  const [mostrarPrecio, setMostrarPrecio] = useState(true);
  const [mostrarNombre, setMostrarNombre] = useState(true);

  async function addArticle(a: Article) {
    if (items.some((i) => i.article.id === a.id)) {
      notify("error", "El articulo ya esta en la lista");
      return;
    }
    // Toma el codigo de barra principal; si no tiene, usa el codigo del articulo.
    let barcodeValue = a.codigo;
    try {
      const bcs = await api<ArticleBarcode[]>(`/barcodes?articleId=${a.id}`);
      const principal = bcs.find((b) => b.esPrincipal) ?? bcs[0];
      if (principal) barcodeValue = principal.codigo;
    } catch {
      /* usa el codigo del articulo */
    }
    setItems((prev) => [...prev, { article: a, barcodeValue, cantidad: 1 }]);
  }

  function setCantidad(id: number, cantidad: number) {
    setItems((prev) => prev.map((i) => (i.article.id === id ? { ...i, cantidad } : i)));
  }
  function remove(id: number) {
    setItems((prev) => prev.filter((i) => i.article.id !== id));
  }

  const totalEtiquetas = items.reduce((s, i) => s + (i.cantidad || 0), 0);

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Impresion de etiquetas</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">STKI008</span>
          </div>
          <p className="text-sm text-slate-500">
            Arma una tanda de etiquetas (nombre, precio y codigo de barra) y mandalas a imprimir.
          </p>
        </div>
        <Button onClick={() => window.print()} disabled={totalEtiquetas === 0}>
          <Printer className="h-4 w-4" /> Imprimir ({totalEtiquetas})
        </Button>
      </div>

      {/* Controles (no se imprimen) */}
      <div className="mb-5 rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="max-w-lg">
          <label className="mb-1 block text-sm font-medium text-secondary">Agregar articulo</label>
          <ArticleAutocomplete onSelect={addArticle} />
        </div>

        <div className="mt-4 flex flex-wrap gap-5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={mostrarNombre} onChange={(e) => setMostrarNombre(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
            Mostrar nombre
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={mostrarPrecio} onChange={(e) => setMostrarPrecio(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
            Mostrar precio
          </label>
        </div>

        {items.length > 0 && (
          <div className="mt-4 space-y-2">
            {items.map((i) => (
              <div key={i.article.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{i.article.descripcion}</div>
                  <div className="font-mono text-xs text-slate-500">{i.barcodeValue}</div>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={`cant-${i.article.id}`} className="text-xs text-slate-500">Etiquetas</label>
                  <input
                    id={`cant-${i.article.id}`}
                    type="number"
                    min={1}
                    value={i.cantidad}
                    onChange={(e) => setCantidad(i.article.id, Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button
                  onClick={() => remove(i.article.id)}
                  aria-label="Quitar"
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vista previa / area de impresion */}
      {totalEtiquetas === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-white px-6 py-14 text-center shadow-sm">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-slate-400">
            <Tag className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Sin etiquetas todavia</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">Agrega articulos y elegi cuantas etiquetas imprimir de cada uno.</p>
        </div>
      ) : (
        <div id="etiquetas-print" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.flatMap((i) =>
            Array.from({ length: i.cantidad }).map((_, n) => (
              <div
                key={`${i.article.id}-${n}`}
                className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-white p-3 text-center"
                style={{ breakInside: "avoid" }}
              >
                {mostrarNombre && (
                  <span className="line-clamp-2 text-xs font-medium text-foreground">{i.article.descripcion}</span>
                )}
                {mostrarPrecio && (
                  <span className="font-mono text-sm font-semibold text-foreground">{formatGs(i.article.precioVenta)} Gs</span>
                )}
                <Barcode value={i.barcodeValue} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
