"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import type { PurchaseInvoice } from "@/lib/types";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

export default function ListadoComprasPage() {
  const { companyId } = useAuth();
  const [items, setItems] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<PurchaseInvoice | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      setItems(await api<PurchaseInvoice[]>(`/purchases${search ? `?q=${encodeURIComponent(search)}` : ""}`));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load, companyId]);

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
        <Input placeholder="Buscar por nro de comprobante..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Comprobante</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 text-center font-medium">Condicion</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{q ? "Sin resultados." : "No hay compras registradas."}</td></tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} onClick={() => openDetail(p.id)}
                  className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 text-slate-600">{fmtFecha(p.fecha)}</td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-secondary">{p.nroComprobante}</td>
                  <td className="px-4 py-3 text-foreground">{p.supplier?.person.razonSocial ?? "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.condicion === "CREDITO" ? "bg-amber-50 text-amber-700" : "bg-accent/10 text-accent"}`}>
                      {p.condicion === "CREDITO" ? "Credito" : "Contado"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{formatGs(p.total)}</td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && items.length > 0 && <p className="mt-3 text-xs text-slate-400">{items.length} compra(s)</p>}

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
