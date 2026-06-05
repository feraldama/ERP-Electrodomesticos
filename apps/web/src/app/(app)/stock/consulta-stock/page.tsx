"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import { Input, Select } from "@/components/ui/Field";
import type { StockRow, Warehouse } from "@/lib/types";

export default function ConsultaStockPage() {
  const { companyId } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouseId, setWarehouseId] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (q) params.set("q", q);
    try {
      setRows(await api<StockRow[]>(`/stock${params.toString() ? `?${params}` : ""}`));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, q]);

  useEffect(() => {
    api<Warehouse[]>("/warehouses").then(setWarehouses).catch(() => setWarehouses([]));
  }, [companyId]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load, companyId]);

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Stock por deposito</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKC009</span>
        </div>
        <p className="text-sm text-slate-500">Existencias actuales por articulo y deposito</p>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="mb-1 block text-sm font-medium text-secondary">Deposito</label>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Todos los depositos</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.codigo} - {w.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-72">
          <label className="mb-1 block text-sm font-medium text-secondary">Buscar articulo</label>
          <Input placeholder="Codigo o descripcion..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Deposito</th>
              <th className="px-4 py-3 font-medium">Codigo</th>
              <th className="px-4 py-3 font-medium">Articulo</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-right font-medium">Stock min.</th>
              <th className="px-4 py-3 text-center font-medium">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">Cargando...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Sin existencias registradas. El stock se genera al cargar compras o ajustes de inventario.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const cantidad = Number(r.cantidad);
                const minimo = Number(r.article.stockMinimo);
                const bajo = minimo > 0 && cantidad <= minimo;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 text-slate-600">{r.warehouse.nombre}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-secondary">{r.article.codigo}</td>
                    <td className="px-4 py-3 text-foreground">{r.article.descripcion}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${bajo ? "text-destructive" : "text-foreground"}`}>
                      {formatGs(cantidad)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{formatGs(minimo)}</td>
                    <td className="px-4 py-3 text-center">
                      {bajo && (
                        <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-destructive">
                          Bajo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && rows.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">{rows.length} registro(s)</p>
      )}
    </div>
  );
}
