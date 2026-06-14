"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { AccountingEntry } from "@/lib/types";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

export default function LibroDiarioPage() {
  const { companyId } = useAuth();
  const [asientos, setAsientos] = useState<AccountingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<AccountingEntry[]>("/contabilidad/asientos")
      .then(setAsientos)
      .catch(() => setAsientos([]))
      .finally(() => setLoading(false));
  }, [companyId]);

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Libro diario</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">CONC002</span>
        </div>
        <p className="text-sm text-slate-500">Asientos contables generados a partir de las operaciones.</p>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : asientos.length === 0 ? (
        <p className="text-slate-400">No hay asientos. Genera asientos desde &quot;Procesar eventos contables&quot;.</p>
      ) : (
        <div className="space-y-4">
          {asientos.map((a) => {
            const totalDebe = a.lines.reduce((s, l) => s + Number(l.debe), 0);
            const totalHaber = a.lines.reduce((s, l) => s + Number(l.haber), 0);
            return (
              <div key={a.id} className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-secondary">N{a.numero ?? "-"}</span>
                    <span className="text-sm font-medium text-foreground">{a.glosa}</span>
                  </div>
                  <span className="text-xs text-slate-400">{fmtFecha(a.fecha)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {a.lines.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-1.5">
                          <span className="font-mono text-xs text-slate-400">{l.account.codigo}</span>{" "}
                          <span className="text-foreground">{l.account.nombre}</span>
                        </td>
                        <td className="w-36 px-4 py-1.5 text-right font-mono text-slate-600">{Number(l.debe) > 0 ? formatGs(l.debe) : ""}</td>
                        <td className="w-36 px-4 py-1.5 text-right font-mono text-slate-600">{Number(l.haber) > 0 ? formatGs(l.haber) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30 text-xs font-semibold text-foreground">
                      <td className="px-4 py-1.5 text-right text-slate-400">Totales</td>
                      <td className="px-4 py-1.5 text-right font-mono">{formatGs(totalDebe)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{formatGs(totalHaber)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
