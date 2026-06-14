"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatGs } from "@/lib/format";
import type { Article, CostHistory } from "@/lib/types";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

const ORIGEN_LABEL: Record<string, string> = { COMPRA: "Compra" };

export default function HistorialCostosPage() {
  const [data, setData] = useState<CostHistory | null>(null);
  const [loading, setLoading] = useState(false);

  async function elegir(a: Article) {
    setLoading(true);
    try {
      setData(await api<CostHistory>(`/stock/cost-history?articleId=${a.id}`));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Historial de costos</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKC011</span>
        </div>
        <p className="text-sm text-slate-500">Evolucion del costo del articulo en el tiempo.</p>
      </div>

      <div className="mb-5 max-w-lg">
        <label className="mb-1 block text-sm font-medium text-secondary">Articulo</label>
        <ArticleAutocomplete onSelect={elegir} />
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !data ? (
        <p className="text-slate-400">Busca un articulo para ver su historial de costos.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-foreground">{data.article.descripcion}</div>
            <div className="font-mono text-xs text-slate-400">{data.article.codigo} · costo actual {formatGs(data.article.costoActual)} Gs</div>
          </div>

          {data.historial.length === 0 ? (
            <p className="text-slate-400">Sin historial de costos.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Origen</th>
                    <th className="px-4 py-3 font-medium">Proveedor</th>
                    <th className="px-4 py-3 font-medium">Comprobante</th>
                    <th className="px-4 py-3 text-right font-medium">Cant.</th>
                    <th className="px-4 py-3 text-right font-medium">Costo</th>
                    <th className="px-4 py-3 text-center font-medium">Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.historial.map((h, i) => {
                    // Variacion vs el costo anterior en el tiempo (la fila siguiente, orden desc)
                    const prev = data.historial[i + 1];
                    const costo = Number(h.costo);
                    const prevCosto = prev ? Number(prev.costo) : null;
                    const varPct = prevCosto && prevCosto > 0 ? ((costo - prevCosto) / prevCosto) * 100 : null;
                    const subio = varPct != null && varPct > 0;
                    return (
                      <tr key={h.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-slate-600">{fmtFecha(h.fecha)}</td>
                        <td className="px-4 py-2 text-slate-500">{h.origenTipo ? ORIGEN_LABEL[h.origenTipo] ?? h.origenTipo : "-"}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-foreground">{h.proveedor ?? "-"}</td>
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-secondary">{h.nroComprobante ?? "-"}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{h.cantidad ? formatGs(h.cantidad) : "-"}</td>
                        <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{formatGs(h.costo)} <span className="text-xs font-normal text-slate-400">{h.moneda}</span></td>
                        <td className="px-4 py-2 text-center">
                          {varPct == null ? (
                            <span className="text-slate-300">-</span>
                          ) : (
                            <span className={`text-xs font-medium ${subio ? "text-destructive" : varPct < 0 ? "text-accent" : "text-slate-400"}`}>
                              {subio ? "+" : ""}{varPct.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
