"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { formatGs, formatDateTime } from "@/lib/format";
import type { StockMovementBatchRow, StockMovementRow } from "@/lib/types";
import { ArrowRight } from "lucide-react";
import { TIPO_LABEL } from "./shared";

interface Props {
  batch: StockMovementBatchRow | null;
  onClose: () => void;
}

// Detalle de un lote: las lineas (articulos) que se movieron en ese movimiento.
// Se piden a /movements filtrando por el loteId, que identifica la operacion.
export function MovementBatchModal({ batch, onClose }: Props) {
  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!batch) return;
    setLoading(true);
    setRows([]);
    const params = new URLSearchParams({ loteId: batch.loteId });
    api<StockMovementRow[]>(`/stock/movements?${params.toString()}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [batch]);

  if (!batch) return null;

  return (
    <Modal open={!!batch} onClose={onClose} title="Detalle del movimiento" size="lg">
      {/* Cabecera del lote */}
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-muted/50 px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Fecha</div>
          <div className="text-foreground">{formatDateTime(batch.fecha)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Tipo</div>
          <div className="text-foreground">{TIPO_LABEL[batch.tipo]}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Deposito</div>
          <div className="flex items-center gap-1.5 text-foreground">
            {batch.tipo === "TRANSFERENCIA" && batch.destino ? (
              <>
                <span>{batch.origen?.nombre ?? "-"}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>{batch.destino.nombre}</span>
              </>
            ) : (
              <span>{batch.origen?.nombre ?? "-"}</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Usuario</div>
          <div className="text-foreground">{batch.usuario ?? "-"}</div>
        </div>
        {batch.observacion && (
          <div className="col-span-2 sm:col-span-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Observacion</div>
            <div className="text-foreground">{batch.observacion}</div>
          </div>
        )}
      </div>

      {/* Lineas del movimiento */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-medium">Articulo</th>
              <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                  Cargando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                  Sin lineas para este movimiento.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const n = Number(r.cantidad);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="text-foreground">{r.article.descripcion}</div>
                      <div className="font-mono text-xs text-slate-400">{r.article.codigo}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono font-medium ${n < 0 ? "text-destructive" : "text-foreground"}`}>
                        {formatGs(n)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-muted/40 font-medium">
                <td className="px-4 py-2.5 text-foreground">
                  {rows.length} {rows.length === 1 ? "articulo" : "articulos"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-foreground">
                  {formatGs(rows.reduce((acc, r) => acc + Number(r.cantidad), 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Modal>
  );
}
