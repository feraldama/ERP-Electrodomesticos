"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { LastCostRow, Supplier } from "@/lib/types";
import { Field, Select } from "@/components/ui/Field";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

export default function UltimosCostosProveedorPage() {
  const { companyId } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [rows, setRows] = useState<LastCostRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Supplier[]>("/suppliers").then(setSuppliers).catch(() => setSuppliers([]));
  }, [companyId]);

  useEffect(() => {
    if (!supplierId) {
      setRows([]);
      return;
    }
    setLoading(true);
    api<LastCostRow[]>(`/purchases/last-costs?supplierId=${supplierId}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [supplierId]);

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Ultimo costo por proveedor</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">COML006</span>
        </div>
        <p className="text-sm text-slate-500">Ultimo costo de cada articulo comprado a un proveedor.</p>
      </div>

      <div className="mb-5 max-w-md">
        <Field label="Proveedor" htmlFor="prov">
          <Select id="prov" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">-- Selecciona --</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.person.razonSocial}</option>
            ))}
          </Select>
        </Field>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !supplierId ? (
        <p className="text-slate-400">Selecciona un proveedor.</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400">Este proveedor no tiene compras registradas.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Articulo</th>
                <th className="px-4 py-3 font-medium">Ultima compra</th>
                <th className="px-4 py-3 font-medium">Comprobante</th>
                <th className="px-4 py-3 text-right font-medium">Ultimo costo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.articleId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <div className="text-foreground">{r.descripcion}</div>
                    <div className="font-mono text-xs text-slate-400">{r.codigo}</div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{fmtFecha(r.fecha)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-secondary">{r.nroComprobante}</td>
                  <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{formatGs(r.costoUnitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
