"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PendingSummary } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { RefreshCw } from "lucide-react";

const TIPO_LABEL: Record<string, string> = {
  VENTA_CONTADO: "Ventas contado",
  VENTA_CREDITO: "Ventas credito",
  COMPRA: "Compras",
  COBRO: "Cobros",
  PAGO: "Pagos",
  NOTA_CREDITO_VENTA: "Notas de credito venta",
  NOTA_CREDITO_COMPRA: "Notas de credito compra",
};

export default function ProcesarContablePage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [pend, setPend] = useState<PendingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<PendingSummary>("/contabilidad/pendientes")
      .then(setPend)
      .catch(() => setPend(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, companyId]);

  async function procesar() {
    setProcesando(true);
    try {
      const res = await api<{ procesados: number; errores: number }>("/contabilidad/procesar", { method: "POST" });
      notify(
        res.errores > 0 ? "error" : "success",
        `Procesados: ${res.procesados}${res.errores > 0 ? ` · con error: ${res.errores}` : ""}`
      );
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al procesar");
    } finally {
      setProcesando(false);
    }
  }

  const total = pend?.total ?? 0;

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Procesar eventos contables</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">CONP003</span>
        </div>
        <p className="text-sm text-slate-500">
          Convierte las operaciones (ventas, compras, cobros, pagos, notas de credito) en asientos del libro diario.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Eventos pendientes</div>
            <div className="mt-1 text-3xl font-semibold text-foreground">{loading ? "..." : total}</div>
            {pend && pend.conError > 0 && (
              <div className="mt-1 text-xs text-destructive">{pend.conError} con error en intentos previos</div>
            )}
          </div>
          <Button onClick={procesar} loading={procesando} disabled={loading || total === 0}>
            <RefreshCw className="h-4 w-4" />
            Procesar {total > 0 ? `(${total})` : ""}
          </Button>
        </div>

        {pend && pend.porTipo.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 text-sm font-medium text-secondary">Detalle por tipo</div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {pend.porTipo.map((t) => (
                <div key={t.tipo} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                  <span className="text-secondary">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
                  <span className="font-mono font-medium text-foreground">{t.cantidad}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && total === 0 && (
          <p className="mt-4 text-sm text-slate-400">No hay eventos pendientes. Todo esta contabilizado.</p>
        )}
      </div>
    </div>
  );
}
