"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import type { PurchaseInvoice } from "@/lib/types";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useListQuery } from "@/lib/useListQuery";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

const columns: DataColumn<PurchaseInvoice>[] = [
  { key: "fecha", header: "Fecha", render: (p) => <span className="text-slate-600">{fmtFecha(p.fecha)}</span> },
  {
    key: "comprobante",
    header: "Comprobante",
    render: (p) => <span className="font-mono text-xs font-semibold text-secondary">{p.nroComprobante}</span>,
  },
  { key: "proveedor", header: "Proveedor", render: (p) => <span className="text-foreground">{p.supplier?.person.razonSocial ?? "-"}</span> },
  {
    key: "condicion",
    header: "Condicion",
    align: "center",
    render: (p) => (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          p.condicion === "CREDITO" ? "bg-amber-50 text-amber-700" : "bg-accent/10 text-accent"
        }`}
      >
        {p.condicion === "CREDITO" ? "Credito" : "Contado"}
      </span>
    ),
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (p) => <span className="font-mono font-medium text-foreground">{formatGs(p.total)}</span>,
  },
  {
    header: "",
    align: "right",
    render: () => (
      <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function ListadoComprasPage() {
  const { companyId } = useAuth();
  const list = useListQuery<PurchaseInvoice>("/purchases", { defaultSort: "fecha", defaultDir: "desc", reloadKey: companyId });
  const [detail, setDetail] = useState<PurchaseInvoice | null>(null);

  async function openDetail(id: number) {
    try {
      setDetail(await api<PurchaseInvoice>(`/purchases/${id}`));
    } catch {
      /* noop */
    }
  }

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Listado de compras</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">COML005</span>
        </div>
        <p className="text-sm text-slate-500">Compras registradas de la empresa activa</p>
      </div>

      <div className="mb-4 w-72">
        <Input
          placeholder="Buscar por comprobante o proveedor..."
          value={list.q}
          onChange={(e) => list.setQ(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        rowKey={(p) => p.id}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        onRowClick={(p) => openDetail(p.id)}
        emptyTitle={list.q ? "Sin resultados" : "No hay compras registradas"}
        emptyDescription={list.q ? "Proba con otro comprobante o proveedor." : undefined}
      />

      {/* Detalle */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Compra ${detail?.nroComprobante ?? ""}`} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Proveedor" value={detail.supplier?.person.razonSocial ?? "-"} />
              <Info label="Fecha" value={fmtFecha(detail.fecha)} />
              <Info label="Condicion" value={detail.condicion === "CREDITO" ? "Credito" : "Contado"} />
              <Info label="Timbrado" value={(detail as { timbrado?: string }).timbrado || "-"} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Articulo</th>
                    <th className="px-3 py-2 text-right font-medium">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium">Costo</th>
                    <th className="px-3 py-2 text-center font-medium">IVA</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items?.map((it) => (
                    <tr key={it.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <div className="text-foreground">{it.article?.descripcion}</div>
                        <div className="font-mono text-xs text-slate-400">{it.article?.codigo}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatGs(it.cantidad)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatGs(it.costoUnitario)}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{IVA_LABEL[it.ivaTipo]}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium">{formatGs(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="w-full max-w-xs space-y-1">
                <TotalRow label="Gravadas 10%" value={detail.subtotal10} />
                <TotalRow label="IVA 10%" value={detail.iva10} muted />
                <TotalRow label="Gravadas 5%" value={detail.subtotal5} />
                <TotalRow label="IVA 5%" value={detail.iva5} muted />
                <TotalRow label="Exentas" value={detail.subtotalExenta} />
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                  <span>Total</span>
                  <span className="font-mono">{formatGs(detail.total)} Gs</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-slate-500" : "text-secondary"}`}>
      <span>{label}</span>
      <span className="font-mono">{formatGs(value)}</span>
    </div>
  );
}
