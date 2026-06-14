"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ArticleSerial } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
  articleId: number;
  selected: string[];
  onConfirm: (series: string[]) => void;
  // Venta: EN_STOCK del deposito. Devolucion (NC): VENDIDO de una venta puntual.
  warehouseId?: number | null;
  saleInvoiceId?: number;
}

// Modal para elegir series/IMEI: en venta lista las EN_STOCK del deposito;
// en devolucion (NC) lista las VENDIDO de esa venta.
export function SerialPicker({ open, onClose, articleId, selected, onConfirm, warehouseId, saleInvoiceId }: Props) {
  const [disponibles, setDisponibles] = useState<ArticleSerial[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set(selected));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel(new Set(selected));
    if (!warehouseId && !saleInvoiceId) {
      setDisponibles([]);
      return;
    }
    const params = new URLSearchParams({ articleId: String(articleId), estado: saleInvoiceId ? "VENDIDO" : "EN_STOCK" });
    if (warehouseId) params.set("warehouseId", String(warehouseId));
    if (saleInvoiceId) params.set("saleInvoiceId", String(saleInvoiceId));
    setLoading(true);
    api<ArticleSerial[]>(`/serials?${params.toString()}`)
      .then(setDisponibles)
      .catch(() => setDisponibles([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, articleId, warehouseId, saleInvoiceId]);

  function toggle(serie: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(serie)) n.delete(serie);
      else n.add(serie);
      return n;
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Elegir series / IMEI"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm([...sel]);
              onClose();
            }}
          >
            Confirmar ({sel.size})
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Cargando...</p>
      ) : disponibles.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No hay series/IMEI disponibles en este deposito. Cargalas en el articulo o en la compra.
        </p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border border-border">
          {disponibles.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-muted/40"
            >
              <input
                type="checkbox"
                checked={sel.has(s.serie)}
                onChange={() => toggle(s.serie)}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              <span className="font-mono">{s.serie}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
