"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Article, ArticleBarcode } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Star, Trash2, Wand2, Plus, Barcode } from "lucide-react";

// Digito verificador EAN-13 (modulo 10, pesos 1/3 alternados sobre los 12 primeros).
function ean13CheckDigit(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

// Genera un EAN-13 interno (prefijo 20, reservado para uso interno) a partir del articulo.
function generarEan13Interno(articleId: number): string {
  const rnd = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const base = ("20" + String(articleId).padStart(6, "0") + rnd).slice(0, 12);
  return base + ean13CheckDigit(base);
}

export default function CodigosBarraPage() {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [article, setArticle] = useState<Article | null>(null);
  const [barcodes, setBarcodes] = useState<ArticleBarcode[]>([]);
  const [loading, setLoading] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (articleId: number) => {
    setLoading(true);
    try {
      setBarcodes(await api<ArticleBarcode[]>(`/barcodes?articleId=${articleId}`));
    } catch {
      setBarcodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (article) load(article.id);
    else setBarcodes([]);
  }, [article, load]);

  async function agregar(codigo: string) {
    if (!article) return;
    const code = codigo.trim();
    if (!code) return notify("error", "Ingresa o genera un codigo");
    setSaving(true);
    try {
      await api("/barcodes", {
        method: "POST",
        body: JSON.stringify({ articleId: article.id, codigo: code }),
      });
      notify("success", "Codigo de barra agregado");
      setNuevo("");
      load(article.id);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al agregar");
    } finally {
      setSaving(false);
    }
  }

  async function marcarPrincipal(b: ArticleBarcode) {
    if (b.esPrincipal || !article) return;
    try {
      await api(`/barcodes/${b.id}/principal`, { method: "PUT" });
      load(article.id);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al marcar principal");
    }
  }

  async function eliminar(b: ArticleBarcode) {
    if (!article) return;
    const ok = await confirm({
      title: "Eliminar codigo de barra",
      description: `Vas a quitar el codigo ${b.codigo} de este articulo.`,
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/barcodes/${b.id}`, { method: "DELETE" });
      notify("success", "Codigo de barra eliminado");
      load(article.id);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  const columns: DataColumn<ArticleBarcode>[] = [
    {
      header: "Codigo de barra",
      render: (b) => <span className="font-mono text-sm text-foreground">{b.codigo}</span>,
    },
    {
      header: "Principal",
      align: "center",
      render: (b) =>
        b.esPrincipal ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            <Star className="h-3 w-3 fill-current" /> Principal
          </span>
        ) : (
          <button
            type="button"
            onClick={() => marcarPrincipal(b)}
            className="cursor-pointer rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Marcar principal
          </button>
        ),
    },
  ];

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Codigos de barra</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKI007</span>
        </div>
        <p className="text-sm text-slate-500">
          Asigna uno o varios codigos de barra a cada articulo. Si no tiene uno de fabrica, genera un codigo interno (EAN-13).
        </p>
      </div>

      {/* Selector de articulo */}
      <div className="mb-5 max-w-lg">
        <label className="mb-1 block text-sm font-medium text-secondary">Articulo</label>
        <ArticleAutocomplete onSelect={setArticle} placeholder="Buscar articulo por codigo o descripcion..." />
      </div>

      {!article ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-white px-6 py-14 text-center shadow-sm">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-slate-400">
            <Barcode className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">Selecciona un articulo</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">Busca el articulo para ver y administrar sus codigos de barra.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          {/* Articulo elegido */}
          <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="font-medium text-foreground">{article.descripcion}</div>
              <div className="font-mono text-xs text-slate-500">{article.codigo}</div>
            </div>
          </div>

          {/* Alta de codigo */}
          <div className="mb-5 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[12rem]">
              <label htmlFor="nuevo" className="mb-1 block text-sm font-medium text-secondary">
                Nuevo codigo
              </label>
              <Input
                id="nuevo"
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    agregar(nuevo);
                  }
                }}
                placeholder="Escanea o escribe el codigo"
              />
            </div>
            <Button type="button" onClick={() => agregar(nuevo)} loading={saving} disabled={!nuevo.trim()}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setNuevo(generarEan13Interno(article.id))}
              title="Genera un codigo interno EAN-13"
            >
              <Wand2 className="h-4 w-4" /> Generar interno
            </Button>
          </div>

          <DataTable
            columns={columns}
            rows={barcodes}
            loading={loading}
            rowKey={(b) => b.id}
            actions={(b) => (
              <button
                onClick={() => eliminar(b)}
                aria-label="Eliminar"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            emptyTitle="Sin codigos de barra"
            emptyDescription="Agrega un codigo de fabrica (escaneandolo) o genera uno interno."
          />
        </div>
      )}
    </div>
  );
}
