"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { CustomerAccount, Customer } from "@/lib/types";
import { Field, Select } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";

type Movimiento = CustomerAccount["movimientos"][number];
type Cuota = CustomerAccount["cuotas"][number];

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}
function nroComp(i: { establecimiento: string; puntoExpedicion: string; numero: string }) {
  return `${i.establecimiento}-${i.puntoExpedicion}-${i.numero}`;
}

const ORIGEN_LABEL: Record<string, string> = {
  VENTA: "Venta",
  COBRO: "Cobro",
};

export default function CuentaClientePage() {
  const { companyId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [data, setData] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Customer[]>("/customers").then(setCustomers).catch(() => setCustomers([]));
  }, [companyId]);

  useEffect(() => {
    if (!customerId) {
      setData(null);
      return;
    }
    setLoading(true);
    api<CustomerAccount>(`/cuenta-cliente?customerId=${customerId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [customerId]);

  const hoy = new Date().toISOString().slice(0, 10);

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
              m.origenTipo === "COBRO" ? "bg-accent/10 text-accent" : "bg-sky-100 text-sky-700"
            }`}
          >
            {ORIGEN_LABEL[m.origenTipo] ?? m.origenTipo}
          </span>
        ) : null,
    },
    { header: "Debe", align: "right", render: (m) => <span className="font-mono text-slate-600">{Number(m.debe) > 0 ? formatGs(m.debe) : "-"}</span> },
    { header: "Haber", align: "right", render: (m) => <span className="font-mono text-accent">{Number(m.haber) > 0 ? formatGs(m.haber) : "-"}</span> },
    { header: "Saldo", align: "right", render: (m) => <span className="font-mono font-medium text-foreground">{formatGs(m.saldo)}</span> },
  ];

  const cuotasColumns: DataColumn<Cuota>[] = [
    { header: "Comprobante", render: (c) => <span className="font-mono text-xs text-secondary">{nroComp(c.invoice)}</span> },
    { header: "Cuota", align: "center", render: (c) => <span>{c.nroCuota}</span> },
    {
      header: "Vencimiento",
      render: (c) => {
        const vencida = c.fechaVencimiento.slice(0, 10) < hoy;
        return (
          <span>
            <span className={vencida ? "font-medium text-destructive" : "text-slate-600"}>{fmtFecha(c.fechaVencimiento)}</span>
            {vencida && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-destructive">vencida</span>}
          </span>
        );
      },
    },
    { header: "Monto", align: "right", render: (c) => <span className="font-mono text-slate-600">{formatGs(c.montoCuota)}</span> },
    { header: "Pagado", align: "right", render: (c) => <span className="font-mono text-slate-500">{formatGs(c.montoPagado)}</span> },
    {
      header: "Saldo",
      align: "right",
      render: (c) => (
        <span className="font-mono font-medium text-foreground">
          {formatGs(Math.round(Number(c.montoCuota) - Number(c.montoPagado)))}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Estado de cuenta del cliente</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">VENC006</span>
        </div>
        <p className="text-sm text-slate-500">Movimientos de cuenta corriente, saldo y cuotas pendientes.</p>
      </div>

      <div className="mb-5 max-w-md">
        <Field label="Cliente" htmlFor="cli">
          <Select id="cli" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">-- Selecciona --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.person.razonSocial}</option>
            ))}
          </Select>
        </Field>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !data ? (
        <p className="text-slate-400">Selecciona un cliente para ver su estado de cuenta.</p>
      ) : (
        <div className="space-y-6">
          {/* Resumen */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card label="Saldo actual" value={data.resumen.saldo} highlight />
            <Card label="Total facturado (debe)" value={data.resumen.totalDebe} />
            <Card label="Total cobrado (haber)" value={data.resumen.totalHaber} />
            <Card
              label="Cuotas pendientes"
              value={data.resumen.montoPendiente}
              sub={`${data.resumen.cuotasPendientes} cuota(s)`}
            />
          </div>
          <p className="text-xs text-slate-400">
            Limite de credito: <span className="font-mono">{formatGs(data.customer.limiteCredito)} Gs</span> ·{" "}
            {data.customer.diasCredito} dias · Doc: {data.customer.documento ?? "-"}
          </p>

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

          {/* Cuotas pendientes */}
          {data.cuotas.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-secondary">Cuotas pendientes</h2>
              <DataTable
                columns={cuotasColumns}
                rows={data.cuotas}
                loading={false}
                rowKey={(c) => c.id}
                emptyTitle="Sin cuotas pendientes"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-white"}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>{formatGs(value)} <span className="text-xs font-normal text-slate-400">Gs</span></div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
