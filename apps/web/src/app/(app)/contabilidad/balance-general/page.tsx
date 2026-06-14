"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { BalanceSheet, StatementRow } from "@/lib/types";

export default function BalanceGeneralPage() {
  const { companyId } = useAuth();
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<BalanceSheet>("/contabilidad/balance-general")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [companyId]);

  const cuadra = data ? Math.round(data.totalActivo) === Math.round(data.totalPasivoPatrimonio) : false;
  const resultadoPositivo = (data?.resultado ?? 0) >= 0;

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Balance general</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">CONC007</span>
        </div>
        <p className="text-sm text-slate-500">Activo = Pasivo + Patrimonio + Resultado del ejercicio.</p>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !data ? (
        <p className="text-slate-400">No hay movimientos contables todavia.</p>
      ) : (
        <>
          <div className="mb-3">
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${cuadra ? "bg-accent/10 text-accent" : "bg-red-50 text-destructive"}`}>
              {cuadra ? "Balance cuadra" : "Balance NO cuadra"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Activo */}
            <Bloque titulo="Activo" filas={data.activo} total={data.totalActivo} totalLabel="Total activo" />

            {/* Pasivo + Patrimonio + Resultado */}
            <div className="space-y-5">
              <Bloque titulo="Pasivo" filas={data.pasivo} total={data.totalPasivo} totalLabel="Total pasivo" />
              <Bloque
                titulo="Patrimonio"
                filas={[
                  ...data.patrimonio,
                  { codigo: "", nombre: `Resultado del ejercicio (${resultadoPositivo ? "utilidad" : "perdida"})`, monto: data.resultado },
                ]}
                total={data.totalPatrimonio + data.resultado}
                totalLabel="Total patrimonio"
              />
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-semibold text-primary shadow-sm">
                <span>Total pasivo + patrimonio</span>
                <span className="font-mono">{formatGs(data.totalPasivoPatrimonio)} Gs</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Bloque({ titulo, filas, total, totalLabel }: { titulo: string; filas: StatementRow[]; total: number; totalLabel: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-secondary">{titulo}</div>
      <table className="w-full text-sm">
        <tbody>
          {filas.length === 0 ? (
            <tr><td className="px-4 py-3 text-slate-400">Sin saldos</td></tr>
          ) : (
            filas.map((f, i) => (
              <tr key={f.codigo || `r${i}`} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  {f.codigo && <span className="font-mono text-xs text-slate-400">{f.codigo} </span>}
                  <span className="text-foreground">{f.nombre}</span>
                </td>
                <td className="w-40 px-4 py-2 text-right font-mono text-slate-600">{formatGs(f.monto)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30 text-sm font-semibold text-foreground">
            <td className="px-4 py-2 text-right text-slate-400">{totalLabel}</td>
            <td className="px-4 py-2 text-right font-mono">{formatGs(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
