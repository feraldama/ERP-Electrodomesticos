"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Article, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { Trash2 } from "lucide-react";

interface Line {
  article: Article;
  tipo: "INGRESO" | "EGRESO";
  cantidad: string;
}

export default function AjustesPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Warehouse[]>("/warehouses")
      .then((ws) => {
        setWarehouses(ws);
        if (ws.length && !warehouseId) setWarehouseId(String(ws[0].id));
      })
      .catch(() => setWarehouses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function addArticle(a: Article) {
    if (lines.some((l) => l.article.id === a.id)) {
      notify("error", "El articulo ya esta en la lista");
      return;
    }
    setLines((ls) => [...ls, { article: a, tipo: "INGRESO", cantidad: "1" }]);
  }

  function updateLine(id: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.article.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: number) {
    setLines((ls) => ls.filter((l) => l.article.id !== id));
  }

  async function submit() {
    if (!warehouseId) return notify("error", "Selecciona un deposito");
    if (lines.length === 0) return notify("error", "Agrega al menos un articulo");
    if (lines.some((l) => !(Number(l.cantidad) > 0))) {
      return notify("error", "Las cantidades deben ser mayores a cero");
    }
    setSaving(true);
    try {
      const res = await api<{ movimientos: number }>("/stock/adjustments", {
        method: "POST",
        body: JSON.stringify({
          warehouseId: Number(warehouseId),
          observacion: observacion.trim() || null,
          items: lines.map((l) => ({
            articleId: l.article.id,
            tipo: l.tipo,
            cantidad: Number(l.cantidad),
          })),
        }),
      });
      notify("success", `Ajuste registrado (${res.movimientos} movimiento/s)`);
      setLines([]);
      setObservacion("");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al registrar el ajuste");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Ajuste manual de inventario</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKI006</span>
        </div>
        <p className="text-sm text-slate-500">Carga ingresos o egresos de stock (conteo, mermas, stock inicial)</p>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        {/* Cabecera */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Deposito" htmlFor="dep" required>
            <Select id="dep" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.length === 0 && <option value="">Sin depositos</option>}
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.codigo} - {w.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Observacion" htmlFor="obs">
            <input
              id="obs"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Motivo del ajuste (opcional)"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </Field>
        </div>

        {/* Buscador para agregar articulos */}
        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-secondary">Agregar articulo</label>
          <ArticleAutocomplete onSelect={addArticle} />
        </div>

        {/* Lineas */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Articulo</th>
                <th className="px-3 py-2 font-medium">Codigo</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    Busca y agrega articulos para ajustar.
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.article.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-foreground">{l.article.descripcion}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-secondary">{l.article.codigo}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={l.tipo}
                        onChange={(e) => updateLine(l.article.id, { tipo: e.target.value as Line["tipo"] })}
                        className="w-32"
                      >
                        <option value="INGRESO">Ingreso (+)</option>
                        <option value="EGRESO">Egreso (-)</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={l.cantidad}
                        onChange={(e) => updateLine(l.article.id, { cantidad: e.target.value })}
                        className="w-24 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removeLine(l.article.id)}
                        className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive"
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-slate-500">{lines.length} articulo(s)</span>
          <Button onClick={submit} loading={saving} disabled={lines.length === 0}>
            Registrar ajuste
          </Button>
        </div>
      </div>
    </div>
  );
}
