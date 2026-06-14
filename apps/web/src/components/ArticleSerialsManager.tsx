"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ArticleSerial, SerialEstado, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { RotateCcw, Ban, Trash2 } from "lucide-react";

const BADGE: Record<SerialEstado, string> = {
  EN_STOCK: "bg-accent/10 text-accent",
  VENDIDO: "bg-sky-100 text-sky-700",
  DEVUELTO: "bg-amber-50 text-amber-700",
  BAJA: "bg-slate-100 text-slate-500",
};
const LABEL: Record<SerialEstado, string> = {
  EN_STOCK: "En stock",
  VENDIDO: "Vendido",
  DEVUELTO: "Devuelto",
  BAJA: "Baja",
};

// Gestion de series/IMEI de un articulo: listar, cargar (stock existente), reactivar, dar de baja, eliminar.
export function ArticleSerialsManager({ articleId }: { articleId: number }) {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [series, setSeries] = useState<ArticleSerial[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [nuevas, setNuevas] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSeries(await api<ArticleSerial[]>(`/serials?articleId=${articleId}`));
    } catch {
      setSeries([]);
    }
  }, [articleId]);

  useEffect(() => {
    load();
    api<Warehouse[]>("/warehouses")
      .then((w) => {
        setWarehouses(w);
        if (w.length) setWarehouseId((p) => p || String(w[0].id));
      })
      .catch(() => {});
  }, [load]);

  async function cargar() {
    const arr = nuevas.split("\n").map((s) => s.trim()).filter(Boolean);
    if (arr.length === 0) return notify("error", "Ingresa al menos una serie/IMEI");
    if (!warehouseId) return notify("error", "Elegi un deposito");
    setSaving(true);
    try {
      await api("/serials", {
        method: "POST",
        body: JSON.stringify({ articleId, warehouseId: Number(warehouseId), series: arr }),
      });
      notify("success", "Series cargadas");
      setNuevas("");
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al cargar series");
    } finally {
      setSaving(false);
    }
  }

  async function setEstado(s: ArticleSerial, estado: "EN_STOCK" | "BAJA") {
    if (estado === "BAJA") {
      const ok = await confirm({
        title: "Dar de baja",
        description: `La serie/IMEI ${s.serie} ya no estara disponible para vender.`,
        confirmText: "Dar de baja",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await api(`/serials/${s.id}/estado`, { method: "PUT", body: JSON.stringify({ estado }) });
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al actualizar");
    }
  }

  async function eliminar(s: ArticleSerial) {
    const ok = await confirm({
      title: "Eliminar serie",
      description: `Vas a eliminar la serie/IMEI ${s.serie}.`,
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/serials/${s.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al eliminar");
    }
  }

  const enStock = series.filter((s) => s.estado === "EN_STOCK").length;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-secondary">Series / IMEI</p>
        <span className="text-xs text-slate-500">
          {enStock} en stock · {series.length} total
        </span>
      </div>

      {/* Carga manual (stock existente / correcciones) */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="sm:w-44">
          <label className="mb-1 block text-xs font-medium text-secondary">Deposito</label>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="h-9">
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.codigo} - {w.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-secondary">Cargar series (una por renglon)</label>
          <textarea
            value={nuevas}
            onChange={(e) => setNuevas(e.target.value)}
            rows={2}
            placeholder="Serie / IMEI por renglon"
            className="w-full rounded-lg border border-border px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Button type="button" onClick={cargar} loading={saving} disabled={!nuevas.trim()}>
          Cargar
        </Button>
      </div>

      {/* Listado */}
      <div className="max-h-56 overflow-auto rounded-lg border border-border bg-white">
        {series.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">Sin series cargadas.</p>
        ) : (
          series.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-0">
              <span className="font-mono text-foreground">{s.serie}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{s.warehouse?.nombre ?? "-"}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[s.estado]}`}>{LABEL[s.estado]}</span>
                {s.estado === "DEVUELTO" && (
                  <button
                    onClick={() => setEstado(s, "EN_STOCK")}
                    aria-label="Reactivar"
                    title="Reactivar (volver a stock)"
                    className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
                {(s.estado === "EN_STOCK" || s.estado === "DEVUELTO") && (
                  <button
                    onClick={() => setEstado(s, "BAJA")}
                    aria-label="Dar de baja"
                    title="Dar de baja"
                    className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-muted hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                )}
                {s.estado === "EN_STOCK" && (
                  <button
                    onClick={() => eliminar(s)}
                    aria-label="Eliminar"
                    title="Eliminar"
                    className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
