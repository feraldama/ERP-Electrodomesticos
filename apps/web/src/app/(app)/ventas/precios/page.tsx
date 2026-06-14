"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Article, ArticlePriceRow, ArticlePricesByArticle, PriceList } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { useToast } from "@/components/ui/Toast";
import { IVA_LABEL } from "@/lib/format";
import { Save, Search } from "lucide-react";

type Mode = "list" | "article";

export default function PreciosPorArticuloPage() {
  const { notify } = useToast();
  const [mode, setMode] = useState<Mode>("list");

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Precios por articulo</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">VENM011</span>
        </div>
        <p className="text-sm text-slate-500">
          Carga los montos (con IVA incluido) por lista de precios o consulta un articulo en todas las listas.
        </p>
      </div>

      {/* Toggle de modo */}
      <div className="mb-5 inline-flex rounded-lg border border-border bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMode("list")}
          className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "list" ? "bg-primary text-white" : "text-slate-500 hover:text-foreground"
          }`}
        >
          Por lista
        </button>
        <button
          type="button"
          onClick={() => setMode("article")}
          className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "article" ? "bg-primary text-white" : "text-slate-500 hover:text-foreground"
          }`}
        >
          Por articulo
        </button>
      </div>

      {mode === "list" ? <PorLista notify={notify} /> : <PorArticulo notify={notify} />}
    </div>
  );
}

type Notify = ReturnType<typeof useToast>["notify"];

// =====================================================================
// MODO: por lista (elegis una lista y cargas el precio de cada articulo)
// =====================================================================
function PorLista({ notify }: { notify: Notify }) {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [listId, setListId] = useState<string>("");
  const [rows, setRows] = useState<ArticlePriceRow[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<PriceList[]>("/price-lists")
      .then((ls) => {
        setLists(ls);
        const def = ls.find((l) => l.esDefault) ?? ls[0];
        if (def) setListId(String(def.id));
      })
      .catch(() => setLists([]));
  }, []);

  const load = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    try {
      const data = await api<ArticlePriceRow[]>(
        `/article-prices?priceListId=${listId}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`
      );
      setRows(data);
      setEdits({});
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [listId, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const selectedList = useMemo(() => lists.find((l) => String(l.id) === listId), [lists, listId]);

  function setPrecio(articleId: number, value: string) {
    setEdits((e) => ({ ...e, [articleId]: value }));
  }

  function valueFor(row: ArticlePriceRow): string {
    if (row.id in edits) return edits[row.id];
    return row.precio != null ? String(Math.round(Number(row.precio))) : "";
  }

  const cambios = Object.keys(edits).length;

  async function guardar() {
    const items = Object.entries(edits)
      .map(([articleId, v]) => ({ articleId: Number(articleId), precio: Number(v) }))
      .filter((it) => Number.isFinite(it.precio) && it.precio >= 0);
    if (items.length === 0) return notify("error", "No hay precios validos para guardar");

    setSaving(true);
    try {
      await api("/article-prices", {
        method: "PUT",
        body: JSON.stringify({ priceListId: Number(listId), items }),
      });
      notify("success", `${items.length} precio(s) guardados en ${selectedList?.nombre ?? "la lista"}`);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-64">
            <Select value={listId} onChange={(e) => setListId(e.target.value)}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre} {l.condicion === "CREDITO" ? `(${l.cuotas} cuotas)` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Buscar por codigo o descripcion..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={guardar} loading={saving} disabled={cambios === 0}>
          <Save className="h-4 w-4" />
          Guardar cambios{cambios > 0 ? ` (${cambios})` : ""}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Articulo</th>
              <th className="px-4 py-3 font-medium">Rubro</th>
              <th className="px-4 py-3 text-center font-medium">IVA</th>
              <th className="px-4 py-3 text-right font-medium">Precio en esta lista</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  {q ? "Sin resultados." : "No hay articulos activos."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <div className="text-foreground">{row.descripcion}</div>
                    <div className="font-mono text-xs text-slate-400">{row.codigo}</div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{row.rubro?.nombre ?? "-"}</td>
                  <td className="px-4 py-2 text-center text-slate-500">{IVA_LABEL[row.ivaTipo]}</td>
                  <td className="px-4 py-2 text-right">
                    <MoneyInput
                      value={valueFor(row)}
                      onChange={(v) => setPrecio(row.id, v)}
                      placeholder="0"
                      className={`h-8 w-32 px-2 py-1 ${row.id in edits ? "border-accent bg-accent/5" : ""}`}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && rows.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          {rows.length} articulo(s){cambios > 0 ? ` · ${cambios} con cambios sin guardar` : ""}
        </p>
      )}
    </div>
  );
}

// =====================================================================
// MODO: por articulo (elegis un articulo y ves/editas todas sus listas)
// =====================================================================
function PorArticulo({ notify }: { notify: Notify }) {
  const [data, setData] = useState<ArticlePricesByArticle | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (articleId: number) => {
    setLoading(true);
    try {
      const res = await api<ArticlePricesByArticle>(`/article-prices/by-article?articleId=${articleId}`);
      setData(res);
      setEdits({});
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function onSelectArticle(a: Article) {
    load(a.id);
  }

  function setPrecio(priceListId: number, value: string) {
    setEdits((e) => ({ ...e, [priceListId]: value }));
  }

  function valueFor(l: ArticlePricesByArticle["lists"][number]): string {
    if (l.priceListId in edits) return edits[l.priceListId];
    return l.precio != null ? String(Math.round(Number(l.precio))) : "";
  }

  const cambios = Object.keys(edits).length;

  async function guardar() {
    if (!data) return;
    const items = Object.entries(edits)
      .map(([priceListId, v]) => ({ priceListId: Number(priceListId), precio: Number(v) }))
      .filter((it) => Number.isFinite(it.precio) && it.precio >= 0);
    if (items.length === 0) return notify("error", "No hay precios validos para guardar");

    setSaving(true);
    try {
      await api("/article-prices/by-article", {
        method: "PUT",
        body: JSON.stringify({ articleId: data.article.id, items }),
      });
      notify("success", `${items.length} precio(s) guardados para ${data.article.descripcion}`);
      load(data.article.id);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-96">
          <ArticleAutocomplete onSelect={onSelectArticle} placeholder="Buscar el articulo a consultar..." />
        </div>
        {data && (
          <Button onClick={guardar} loading={saving} disabled={cambios === 0}>
            <Save className="h-4 w-4" />
            Guardar cambios{cambios > 0 ? ` (${cambios})` : ""}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-10 text-center text-slate-400 shadow-sm">
          Cargando...
        </div>
      ) : !data ? (
        <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center text-slate-400 shadow-sm">
          Busca un articulo para ver sus precios en todas las listas.
        </div>
      ) : (
        <>
          {/* Ficha del articulo seleccionado */}
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
            <div>
              <div className="font-medium text-foreground">{data.article.descripcion}</div>
              <div className="font-mono text-xs text-slate-400">{data.article.codigo}</div>
            </div>
            <div className="text-sm text-slate-500">
              Rubro: <span className="text-slate-700">{data.article.rubro?.nombre ?? "-"}</span>
            </div>
            <div className="text-sm text-slate-500">
              IVA: <span className="text-slate-700">{IVA_LABEL[data.article.ivaTipo]}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Lista de precios</th>
                  <th className="px-4 py-3 text-center font-medium">Condicion</th>
                  <th className="px-4 py-3 text-right font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {data.lists.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                      No hay listas de precios activas.
                    </td>
                  </tr>
                ) : (
                  data.lists.map((l) => (
                    <tr key={l.priceListId} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <span className="text-foreground">{l.nombre}</span>
                        {l.esDefault && (
                          <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                            Por defecto
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-600">
                        {l.condicion === "CREDITO" ? `Credito (${l.cuotas} cuotas)` : "Contado"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <MoneyInput
                          value={valueFor(l)}
                          onChange={(v) => setPrecio(l.priceListId, v)}
                          placeholder="0"
                          className={`h-8 w-32 px-2 py-1 ${l.priceListId in edits ? "border-accent bg-accent/5" : ""}`}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {cambios > 0 && (
            <p className="mt-3 text-xs text-slate-400">{cambios} lista(s) con cambios sin guardar</p>
          )}
        </>
      )}
    </div>
  );
}
