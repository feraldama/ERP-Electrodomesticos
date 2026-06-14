"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { IncomeStatement, StatementRow } from "@/lib/types";

export default function EstadoResultadosPage() {
  const { companyId } = useAuth();
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<IncomeStatement>("/contabilidad/estado-resultados")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [companyId]);

  const ganancia = (data?.resultado ?? 0) >= 0;

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Estado de resultados</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">CONC006</span>
        </div>
        <p className="text-sm text-slate-500">Ingresos menos egresos del ejercicio.</p>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !data || (data.ingresos.length === 0 && data.egresos.length === 0) ? (
        <p className="text-slate-400">No hay movimientos contables todavia.</p>
      ) : (
        <div className="space-y-5">
          <Seccion titulo="Ingresos" filas={data.ingresos} total={data.totalIngresos} />
          <Seccion titulo="Egresos" filas={data.egresos} total={data.totalEgresos} />

          <div className={`flex items-center justify-between rounded-xl border p-4 shadow-sm ${ganancia ? "border-accent/30 bg-accent/5" : "border-destructive/30 bg-red-50"}`}>
            <span className="text-sm font-semibold text-secondary">
              Resultado del ejercicio ({ganancia ? "Utilidad" : "Perdida"})
            </span>
            <span className={`font-mono text-xl font-semibold ${ganancia ? "text-accent" : "text-destructive"}`}>
              {formatGs(data.resultado)} Gs
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Seccion({ titulo, filas, total }: { titulo: string; filas: StatementRow[]; total: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-secondary">{titulo}</div>
      <table className="w-full text-sm">
        <tbody>
          {filas.length === 0 ? (
            <tr><td className="px-4 py-3 text-slate-400">Sin movimientos</td></tr>
          ) : (
            filas.map((f) => (
              <tr key={f.codigo} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-slate-400">{f.codigo}</span> <span className="text-foreground">{f.nombre}</span>
                </td>
                <td className="w-44 px-4 py-2 text-right font-mono text-slate-600">{formatGs(f.monto)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30 text-sm font-semibold text-foreground">
            <td className="px-4 py-2 text-right text-slate-400">Total {titulo.toLowerCase()}</td>
            <td className="px-4 py-2 text-right font-mono">{formatGs(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
