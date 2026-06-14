"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import type { SalesInvoice } from "@/lib/types";
import { MEDIO_PAGO_LABEL } from "@/lib/types";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useListQuery } from "@/lib/useListQuery";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Printer } from "lucide-react";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

function nroComp(i: SalesInvoice) {
  return i.nroComprobante ?? `${i.establecimiento}-${i.puntoExpedicion}-${i.numero}`;
}

const columns: DataColumn<SalesInvoice>[] = [
  { key: "id", header: "ID", render: (v) => <span className="font-mono text-xs text-slate-500">{v.id}</span> },
  { key: "fecha", header: "Fecha", render: (v) => <span className="text-slate-600">{fmtFecha(v.fecha)}</span> },
  {
    key: "comprobante",
    header: "Comprobante",
    render: (v) => <span className="font-mono text-xs font-semibold text-secondary">{nroComp(v)}</span>,
  },
  { key: "cliente", header: "Cliente", render: (v) => <span className="text-foreground">{v.customer?.person.razonSocial ?? "-"}</span> },
  { key: "lista", header: "Lista", render: (v) => <span className="text-slate-600">{v.priceList?.nombre ?? "-"}</span> },
  {
    key: "condicion",
    header: "Condicion",
    align: "center",
    render: (v) => (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          v.condicion === "CREDITO" ? "bg-amber-50 text-amber-700" : "bg-accent/10 text-accent"
        }`}
      >
        {v.condicion === "CREDITO" ? "Credito" : "Contado"}
      </span>
    ),
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    render: (v) => <span className="font-mono font-medium text-foreground">{formatGs(v.total)}</span>,
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

const CUOTA_BADGE: Record<string, string> = {
  PENDIENTE: "bg-slate-100 text-slate-500",
  PARCIAL: "bg-amber-50 text-amber-700",
  PAGADA: "bg-accent/10 text-accent",
  VENCIDA: "bg-red-50 text-destructive",
};

export default function ListadoVentasPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const list = useListQuery<SalesInvoice>("/sales", { defaultSort: "id", defaultDir: "desc", reloadKey: companyId });
  const [detail, setDetail] = useState<SalesInvoice | null>(null);
  const [anulando, setAnulando] = useState(false);

  async function openDetail(id: number) {
    try {
      setDetail(await api<SalesInvoice>(`/sales/${id}`));
    } catch {
      /* noop */
    }
  }

  async function anular() {
    if (!detail) return;
    const ok = await confirm({
      title: "Anular venta",
      description: `Vas a anular ${nroComp(detail)}. Se revierte el stock y la cuenta corriente del cliente. No se puede deshacer.`,
      confirmText: "Anular venta",
      danger: true,
    });
    if (!ok) return;
    setAnulando(true);
    try {
      await api(`/sales/${detail.id}/anular`, { method: "POST" });
      notify("success", "Venta anulada");
      setDetail(null);
      list.reload();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo anular la venta");
    } finally {
      setAnulando(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Listado de ventas</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">VENL007</span>
        </div>
        <p className="text-sm text-slate-500">Ventas registradas de la empresa activa</p>
      </div>

      <div className="mb-4 w-72">
        <Input
          placeholder="Buscar por comprobante o cliente..."
          value={list.q}
          onChange={(e) => list.setQ(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        rowKey={(v) => v.id}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        onRowClick={(v) => openDetail(v.id)}
        emptyTitle={list.q ? "Sin resultados" : "No hay ventas registradas"}
        emptyDescription={list.q ? "Proba con otro comprobante o cliente." : undefined}
      />

      {/* Detalle */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Venta ${detail ? nroComp(detail) : ""}`} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Cliente" value={detail.customer?.person.razonSocial ?? "-"} />
              <Info label="Fecha" value={fmtFecha(detail.fecha)} />
              <Info label="Condicion" value={detail.condicion === "CREDITO" ? "Credito" : "Contado"} />
              <Info label="Lista de precios" value={detail.priceList?.nombre ?? "-"} />
              <Info label="Timbrado" value={detail.timbrado || "-"} />
              <Info label="Estado" value={detail.estado} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Articulo</th>
                    <th className="px-3 py-2 text-right font-medium">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium">Precio</th>
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
                      <td className="px-3 py-2 text-right font-mono">{formatGs(it.precioUnitario)}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{IVA_LABEL[it.ivaTipo]}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium">{formatGs(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="w-full max-w-xs space-y-1">
                {Number(detail.subtotal10) > 0 && <><TotalRow label="Gravadas 10%" value={detail.subtotal10} /><TotalRow label="IVA 10%" value={detail.iva10} muted /></>}
                {Number(detail.subtotal5) > 0 && <><TotalRow label="Gravadas 5%" value={detail.subtotal5} /><TotalRow label="IVA 5%" value={detail.iva5} muted /></>}
                {Number(detail.subtotalExenta) > 0 && <TotalRow label="Exentas" value={detail.subtotalExenta} />}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                  <span>Total</span>
                  <span className="font-mono">{formatGs(detail.total)} Gs</span>
                </div>
              </div>
            </div>

            {/* Formas de pago cobradas */}
            {detail.payments && detail.payments.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-secondary">
                  {detail.condicion === "CREDITO" ? "Entrega inicial" : "Formas de pago"}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {detail.payments.map((p) => (
                    <span key={p.id} className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm">
                      <span className="text-slate-500">{MEDIO_PAGO_LABEL[p.medio]}:</span>{" "}
                      <span className="font-mono font-medium text-foreground">{formatGs(p.monto)} Gs</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Plan de cuotas (solo credito) */}
            {detail.installments && detail.installments.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-secondary">Plan de cuotas</h3>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-medium">Cuota</th>
                        <th className="px-3 py-2 font-medium">Vencimiento</th>
                        <th className="px-3 py-2 text-right font-medium">Monto</th>
                        <th className="px-3 py-2 text-right font-medium">Pagado</th>
                        <th className="px-3 py-2 text-center font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.installments.map((c) => (
                        <tr key={c.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-mono">{c.nroCuota}</td>
                          <td className="px-3 py-2 text-slate-600">{fmtFecha(c.fechaVencimiento)}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatGs(c.montoCuota)}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-500">{formatGs(c.montoPagado)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CUOTA_BADGE[c.estado] ?? "bg-slate-100 text-slate-500"}`}>
                              {c.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-4">
              <a
                href={`/print/venta/${detail.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Printer className="h-4 w-4" /> Imprimir
              </a>
              {detail.estado === "CONFIRMADO" ? (
                <Button variant="danger" onClick={anular} loading={anulando}>
                  Anular venta
                </Button>
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                  Comprobante {detail.estado.toLowerCase()}
                </span>
              )}
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
