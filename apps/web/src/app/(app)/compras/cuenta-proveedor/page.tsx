"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { Supplier, SupplierAccount } from "@/lib/types";
import { Field, Select } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";

type Movimiento = SupplierAccount["movimientos"][number];
type Compra = SupplierAccount["compras"][number];

const movimientosColumns: DataColumn<Movimiento>[] = [
  { header: "Fecha", render: (m) => <span className="text-slate-600">{fmtFecha(m.fecha)}</span> },
  { header: "Concepto", render: (m) => <span className="text-foreground">{m.concepto}</span> },
  {
    header: "Tipo",
    align: "center",
    render: (m) =>
      m.origenTipo ? (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            m.origenTipo === "PAGO" ? "bg-accent/10 text-accent" : "bg-sky-100 text-sky-700"
          }`}
        >
          {ORIGEN_LABEL[m.origenTipo] ?? m.origenTipo}
        </span>
      ) : null,
  },
  { header: "Compra", align: "right", render: (m) => <span className="font-mono text-slate-600">{Number(m.haber) > 0 ? formatGs(m.haber) : "-"}</span> },
  { header: "Pago", align: "right", render: (m) => <span className="font-mono text-accent">{Number(m.debe) > 0 ? formatGs(m.debe) : "-"}</span> },
  { header: "Saldo", align: "right", render: (m) => <span className="font-mono font-medium text-foreground">{formatGs(m.saldo)}</span> },
];

const comprasColumns: DataColumn<Compra>[] = [
  { header: "Comprobante", render: (c) => <span className="font-mono text-xs text-secondary">{c.nroComprobante}</span> },
  { header: "Fecha", render: (c) => <span className="text-slate-600">{fmtFecha(c.fecha)}</span> },
  { header: "Total", align: "right", render: (c) => <span className="font-mono font-medium text-foreground">{formatGs(c.total)}</span> },
];

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

const ORIGEN_LABEL: Record<string, string> = {
  COMPRA: "Compra",
  PAGO: "Pago",
};

export default function CuentaProveedorPage() {
  const { companyId } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [data, setData] = useState<SupplierAccount | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Supplier[]>("/suppliers").then(setSuppliers).catch(() => setSuppliers([]));
  }, [companyId]);

  useEffect(() => {
    if (!supplierId) {
      setData(null);
      return;
    }
    setLoading(true);
    api<SupplierAccount>(`/cuenta-proveedor?supplierId=${supplierId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [supplierId]);

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Cuenta corriente proveedor</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">COMC004</span>
        </div>
        <p className="text-sm text-slate-500">Movimientos de cuenta corriente y saldo a pagar.</p>
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
      ) : !data ? (
        <p className="text-slate-400">Selecciona un proveedor para ver su estado de cuenta.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card label="Saldo a pagar" value={data.resumen.saldo} highlight />
            <Card label="Total facturado" value={data.resumen.totalHaber} />
            <Card label="Total pagado" value={data.resumen.totalDebe} />
          </div>
          <p className="text-xs text-slate-400">Doc: {data.supplier.documento ?? "-"}</p>

          {/* Movimientos */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-secondary">Movimientos</h2>
            <DataTable
              columns={movimientosColumns}
              rows={data.movimientos}
              loading={false}
              rowKey={(m) => m.id}
              emptyTitle="Sin movimientos"
            />
          </div>

          {/* Compras a credito */}
          {data.compras.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-secondary">Compras a credito</h2>
              <DataTable
                columns={comprasColumns}
                rows={data.compras}
                loading={false}
                rowKey={(c) => c.id}
                emptyTitle="Sin compras a credito"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-white"}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>{formatGs(value)} <span className="text-xs font-normal text-slate-400">Gs</span></div>
    </div>
  );
}
