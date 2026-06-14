"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatGs } from "@/lib/format";
import type { Article, PurchaseHistory } from "@/lib/types";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { TrendingDown, TrendingUp } from "lucide-react";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

export default function HistorialComprasArticuloPage() {
  const [data, setData] = useState<PurchaseHistory | null>(null);
  const [loading, setLoading] = useState(false);

  async function elegir(a: Article) {
    setLoading(true);
    try {
      setData(await api<PurchaseHistory>(`/stock/purchase-history?articleId=${a.id}`));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const r = data?.resumen;

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Historial de compras por articulo</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKL010</span>
        </div>
        <p className="text-sm text-slate-500">A que proveedor, cuando y a que costo se compro. Para saber si un precio nuevo conviene.</p>
      </div>

      <div className="mb-5 max-w-lg">
        <label className="mb-1 block text-sm font-medium text-secondary">Articulo</label>
        <ArticleAutocomplete onSelect={elegir} />
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !data ? (
        <p className="text-slate-400">Busca un articulo para ver su historial de compras.</p>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="text-foreground">{data.article.descripcion}</div>
            <div className="font-mono text-xs text-slate-400">{data.article.codigo} · costo actual {formatGs(data.article.costoActual)} Gs</div>
          </div>

          {r && r.compras > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Card label="Compras" value={r.compras} plain />
                <Card label="Ultimo costo" value={r.ultimoCosto} />
                <Card label="Costo promedio" value={r.costoPromedio} />
                <Card label="Costo minimo" value={r.costoMin} accent="green" />
                <Card label="Costo maximo" value={r.costoMax} accent="red" />
              </div>

              {/* Ranking por proveedor */}
              <div>
                <h2 className="mb-2 text-sm font-semibold text-secondary">Ultimo costo por proveedor (mas barato primero)</h2>
                <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 font-medium">Proveedor</th>
                        <th className="px-4 py-3 font-medium">Ultima compra</th>
                        <th className="px-4 py-3 text-center font-medium">Compras</th>
                        <th className="px-4 py-3 text-right font-medium">Ultimo costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.porProveedor.map((p, i) => (
                        <tr key={p.proveedor + i} className={`border-b border-border last:border-0 ${i === 0 ? "bg-accent/5" : ""}`}>
                          <td className="px-4 py-2 text-foreground">
                            {p.proveedor}
                            {i === 0 && data.porProveedor.length > 1 && (
                              <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                <TrendingDown className="h-3 w-3" /> mejor precio
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{fmtFecha(p.fecha)}</td>
                          <td className="px-4 py-2 text-center text-slate-600">{p.compras}</td>
                          <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{formatGs(p.ultimoCosto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detalle de compras */}
              <div>
                <h2 className="mb-2 text-sm font-semibold text-secondary">Compras</h2>
                <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 font-medium">Fecha</th>
                        <th className="px-4 py-3 font-medium">Proveedor</th>
                        <th className="px-4 py-3 font-medium">Comprobante</th>
                        <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                        <th className="px-4 py-3 text-right font-medium">Costo unit.</th>
                        <th className="px-4 py-3 text-center font-medium">vs prom.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.compras.map((c, i) => {
                        const costo = Number(c.costoUnitario);
                        const caro = costo > r.costoPromedio;
                        return (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-4 py-2 text-slate-600">{fmtFecha(c.fecha)}</td>
                            <td className="px-4 py-2 text-foreground">{c.proveedor}</td>
                            <td className="px-4 py-2 font-mono text-xs text-secondary">{c.nroComprobante}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-600">{formatGs(c.cantidad)}</td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{formatGs(c.costoUnitario)}</td>
                            <td className="px-4 py-2 text-center">
                              {costo !== r.costoPromedio && (
                                <span className={`inline-flex items-center gap-0.5 text-xs ${caro ? "text-destructive" : "text-accent"}`}>
                                  {caro ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="text-slate-400">Este articulo no tiene compras registradas.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, plain, accent }: { label: string; value: number; plain?: boolean; accent?: "green" | "red" }) {
  const color = accent === "green" ? "text-accent" : accent === "red" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${color}`}>
        {plain ? value : `${formatGs(value)}`}
        {!plain && <span className="text-xs font-normal text-slate-400"> Gs</span>}
      </div>
    </div>
  );
}
