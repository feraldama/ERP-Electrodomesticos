"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { TrialBalance } from "@/lib/types";

export default function BalanceSumasSaldosPage() {
  const { companyId } = useAuth();
  const [data, setData] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<TrialBalance>("/contabilidad/balance")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [companyId]);

  const t = data?.totales;
  const balanceaSumas = t ? Math.round(t.debe) === Math.round(t.haber) : false;
  const balanceaSaldos = t ? Math.round(t.deudor) === Math.round(t.acreedor) : false;

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Balance de sumas y saldos</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">CONC004</span>
        </div>
        <p className="text-sm text-slate-500">Sumas (debe/haber) y saldos por cuenta. Las columnas deben cuadrar.</p>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !data || data.filas.length === 0 ? (
        <p className="text-slate-400">No hay movimientos contables. Genera asientos desde &quot;Procesar eventos contables&quot;.</p>
      ) : (
        <>
          <div className="mb-3 flex gap-2 text-xs">
            <span className={`rounded-full px-2 py-1 font-medium ${balanceaSumas ? "bg-accent/10 text-accent" : "bg-red-50 text-destructive"}`}>
              Sumas {balanceaSumas ? "cuadran" : "NO cuadran"}
            </span>
            <span className={`rounded-full px-2 py-1 font-medium ${balanceaSaldos ? "bg-accent/10 text-accent" : "bg-red-50 text-destructive"}`}>
              Saldos {balanceaSaldos ? "cuadran" : "NO cuadran"}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Codigo</th>
                  <th className="px-4 py-3 font-medium">Cuenta</th>
                  <th className="px-4 py-3 text-right font-medium">Debe</th>
                  <th className="px-4 py-3 text-right font-medium">Haber</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo deudor</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo acreedor</th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((f) => (
                  <tr key={f.accountId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">{f.codigo}</td>
                    <td className="px-4 py-2 text-foreground">{f.nombre}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">{f.debe ? formatGs(f.debe) : "-"}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">{f.haber ? formatGs(f.haber) : "-"}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">{f.saldoDeudor ? formatGs(f.saldoDeudor) : "-"}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">{f.saldoAcreedor ? formatGs(f.saldoAcreedor) : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 text-sm font-semibold text-foreground">
                  <td className="px-4 py-2" colSpan={2}>Totales</td>
                  <td className="px-4 py-2 text-right font-mono">{formatGs(t!.debe)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatGs(t!.haber)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatGs(t!.deudor)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatGs(t!.acreedor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
