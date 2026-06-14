"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { Article, StockRow, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { ArrowRight, Trash2 } from "lucide-react";

interface Line {
  article: Article;
  cantidad: string;
}

export default function TransferenciaStockPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [disponible, setDisponible] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Warehouse[]>("/warehouses")
      .then((ws) => {
        setWarehouses(ws);
        if (ws.length) setFromId((p) => p || String(ws[0].id));
        if (ws.length > 1) setToId((p) => p || String(ws[1].id));
      })
      .catch(() => setWarehouses([]));
  }, [companyId]);

  // Stock disponible en el deposito de origen (para mostrar y validar)
  const loadDisponible = useCallback(async (whId: string) => {
    if (!whId) return setDisponible({});
    try {
      const rows = await api<StockRow[]>(`/stock?warehouseId=${whId}`);
      const map: Record<number, number> = {};
      for (const r of rows) map[r.article.id] = Number(r.cantidad);
      setDisponible(map);
    } catch {
      setDisponible({});
    }
  }, []);

  useEffect(() => {
    loadDisponible(fromId);
  }, [fromId, loadDisponible]);

  function addArticle(a: Article) {
    if (lines.some((l) => l.article.id === a.id)) {
      notify("error", "El articulo ya esta en la lista");
      return;
    }
    setLines((ls) => [...ls, { article: a, cantidad: "1" }]);
  }
  function updateLine(id: number, cantidad: string) {
    setLines((ls) => ls.map((l) => (l.article.id === id ? { ...l, cantidad } : l)));
  }
  function removeLine(id: number) {
    setLines((ls) => ls.filter((l) => l.article.id !== id));
  }

  async function confirmar() {
    if (!fromId || !toId) return notify("error", "Selecciona origen y destino");
    if (fromId === toId) return notify("error", "El origen y el destino deben ser distintos");
    if (lines.length === 0) return notify("error", "Agrega al menos un articulo");
    if (lines.some((l) => !(Number(l.cantidad) > 0))) return notify("error", "Las cantidades deben ser mayores a cero");
    for (const l of lines) {
      const disp = disponible[l.article.id] ?? 0;
      if (Number(l.cantidad) > disp) return notify("error", `Stock insuficiente de ${l.article.codigo} (disponible ${disp})`);
    }

    setSaving(true);
    try {
      await api("/stock/transfers", {
        method: "POST",
        body: JSON.stringify({
          fromWarehouseId: Number(fromId),
          toWarehouseId: Number(toId),
          observacion: observacion.trim() || null,
          items: lines.map((l) => ({ articleId: l.article.id, cantidad: Number(l.cantidad) })),
        }),
      });
      notify("success", `Transferencia registrada: ${lines.length} articulo(s)`);
      setLines([]);
      setObservacion("");
      loadDisponible(fromId);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al transferir");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Movimiento entre depositos</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKI005</span>
        </div>
        <p className="text-sm text-slate-500">Transfiere stock de un deposito a otro.</p>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="Deposito origen" htmlFor="from" required>
            <Select id="from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.codigo} - {w.nombre}</option>
              ))}
            </Select>
          </Field>
          <div className="hidden justify-center pb-2 sm:flex">
            <ArrowRight className="h-5 w-5 text-slate-400" />
          </div>
          <Field label="Deposito destino" htmlFor="to" required>
            <Select id="to" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">-- Selecciona --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.codigo} - {w.nombre}</option>
              ))}
            </Select>
          </Field>
        </div>

        {fromId && toId && fromId === toId && (
          <p className="mt-2 text-xs text-destructive">El origen y el destino deben ser distintos.</p>
        )}

        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-secondary">Agregar articulo</label>
          <ArticleAutocomplete onSelect={addArticle} />
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Articulo</th>
                <th className="px-3 py-2 text-right font-medium">Disp. origen</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad a transferir</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Busca y agrega articulos a transferir.</td></tr>
              ) : (
                lines.map((l) => {
                  const disp = disponible[l.article.id] ?? 0;
                  const excede = Number(l.cantidad) > disp;
                  return (
                    <tr key={l.article.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <div className="text-foreground">{l.article.descripcion}</div>
                        <div className="font-mono text-xs text-slate-400">{l.article.codigo}</div>
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${disp <= 0 ? "text-destructive" : "text-slate-600"}`}>{formatGs(disp)}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={0} value={l.cantidad}
                          onChange={(e) => updateLine(l.article.id, e.target.value)}
                          className={`w-24 rounded-lg border px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${excede ? "border-destructive" : "border-border focus:border-primary"}`} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeLine(l.article.id)} aria-label="Quitar"
                          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 max-w-md">
          <Field label="Observacion" htmlFor="obs">
            <Input id="obs" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={confirmar} loading={saving} disabled={lines.length === 0}>
            Registrar transferencia
          </Button>
        </div>
      </div>
    </div>
  );
}
