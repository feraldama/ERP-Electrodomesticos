"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import type { Article, Customer, PriceList, SalesQuote } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { desglosarIvaIncluido } from "@/lib/iva";
import { Trash2, Ban, Printer } from "lucide-react";

interface Line {
  article: Article;
  cantidad: string;
  precioUnitario: string;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}
const ESTADO_BADGE: Record<string, string> = {
  VIGENTE: "bg-sky-100 text-sky-700",
  CONVERTIDO: "bg-accent/10 text-accent",
  ANULADO: "bg-slate-100 text-slate-500",
};

export default function PresupuestoPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [validez, setValidez] = useState("15");
  const [fecha, setFecha] = useState(today());
  const [observacion, setObservacion] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const [lista, setLista] = useState<SalesQuote[]>([]);
  const [detalle, setDetalle] = useState<SalesQuote | null>(null);

  useEffect(() => {
    api<Customer[]>("/customers").then(setCustomers).catch(() => setCustomers([]));
    api<PriceList[]>("/price-lists")
      .then((ls) => {
        const activas = ls.filter((l) => l.activo);
        setPriceLists(activas);
        const def = activas.find((l) => l.esDefault) ?? activas[0];
        if (def) setPriceListId((p) => p || String(def.id));
      })
      .catch(() => setPriceLists([]));
  }, [companyId]);

  const loadLista = useCallback(() => {
    api<SalesQuote[]>("/presupuestos").then(setLista).catch(() => setLista([]));
  }, []);
  useEffect(() => {
    loadLista();
  }, [loadLista, companyId]);

  async function resolvePrecio(a: Article, listId: string): Promise<string> {
    const base = String(Math.round(Number(a.precioVenta)) || 0);
    if (!listId) return base;
    try {
      const { precio } = await api<{ precio: string | null }>(`/article-prices/resolve?priceListId=${listId}&articleId=${a.id}`);
      if (precio != null) return String(Math.round(Number(precio)));
    } catch { /* base */ }
    return base;
  }

  useEffect(() => {
    if (!priceListId || lines.length === 0) return;
    let cancel = false;
    (async () => {
      const upd = await Promise.all(lines.map(async (l) => ({ ...l, precioUnitario: await resolvePrecio(l.article, priceListId) })));
      if (!cancel) setLines(upd);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListId]);

  async function addArticle(a: Article) {
    if (lines.some((l) => l.article.id === a.id)) return notify("error", "El articulo ya esta en el presupuesto");
    const precio = await resolvePrecio(a, priceListId);
    setLines((ls) => [...ls, { article: a, cantidad: "1", precioUnitario: precio }]);
  }
  function updateLine(id: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.article.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: number) {
    setLines((ls) => ls.filter((l) => l.article.id !== id));
  }
  function lineTotal(l: Line) {
    return Math.round((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0));
  }
  const total = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);

  async function guardar() {
    if (!customerId) return notify("error", "Selecciona un cliente");
    if (lines.length === 0) return notify("error", "Agrega al menos un articulo");
    if (lines.some((l) => !(Number(l.cantidad) > 0))) return notify("error", "Las cantidades deben ser mayores a cero");
    setSaving(true);
    try {
      await api("/presupuestos", {
        method: "POST",
        body: JSON.stringify({
          customerId: Number(customerId),
          priceListId: priceListId ? Number(priceListId) : null,
          fecha,
          validezDias: Number(validez) || 15,
          observacion: observacion.trim() || null,
          items: lines.map((l) => ({ articleId: l.article.id, cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario) })),
        }),
      });
      notify("success", "Presupuesto guardado");
      setLines([]);
      setObservacion("");
      loadLista();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function verDetalle(id: number) {
    try {
      setDetalle(await api<SalesQuote>(`/presupuestos/${id}`));
    } catch { /* noop */ }
  }

  async function anular(p: SalesQuote) {
    const ok = await confirm({
      title: "Anular presupuesto",
      description: `Se anulara el presupuesto N${p.numero}. Esta accion no se puede deshacer.`,
      confirmText: "Anular",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/presupuestos/${p.id}/anular`, { method: "POST" });
      notify("success", "Presupuesto anulado");
      loadLista();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al anular");
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Presupuesto de venta</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">VENI003</span>
        </div>
        <p className="text-sm text-slate-500">Cotizacion para el cliente. No afecta stock ni cuenta corriente.</p>
      </div>

      {/* Form de creacion */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cliente" htmlFor="cli" required className="lg:col-span-2">
            <Select id="cli" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">-- Selecciona --</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.person.razonSocial}</option>)}
            </Select>
          </Field>
          <Field label="Lista de precios" htmlFor="lista">
            <Select id="lista" value={priceListId} onChange={(e) => setPriceListId(e.target.value)}>
              {priceLists.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Validez (dias)" htmlFor="val">
            <Input id="val" type="number" min={1} value={validez} onChange={(e) => setValidez(e.target.value)} />
          </Field>
          <Field label="Fecha" htmlFor="fecha" required>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Observacion" htmlFor="obs" className="lg:col-span-3">
            <Input id="obs" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-secondary">Agregar articulo</label>
          <ArticleAutocomplete onSelect={addArticle} />
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Articulo</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Precio unit.</th>
                <th className="px-3 py-2 text-center font-medium">IVA</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Agrega articulos a cotizar.</td></tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.article.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="text-foreground">{l.article.descripcion}</div>
                      <div className="font-mono text-xs text-slate-400">{l.article.codigo}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} value={l.cantidad} onChange={(e) => updateLine(l.article.id, { cantidad: e.target.value })}
                        className="w-20 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} value={l.precioUnitario} onChange={(e) => updateLine(l.article.id, { precioUnitario: e.target.value })}
                        className="w-28 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{IVA_LABEL[l.article.ivaTipo]}</td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-foreground">{formatGs(lineTotal(l))}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeLine(l.article.id)} aria-label="Quitar" className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm text-secondary">Total: <span className="font-mono text-base font-semibold text-foreground">{formatGs(total)} Gs</span></div>
          <Button onClick={guardar} loading={saving} disabled={lines.length === 0}>Guardar presupuesto</Button>
        </div>
      </div>

      {/* Listado */}
      <h2 className="mb-2 mt-8 text-sm font-semibold text-secondary">Presupuestos</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">N</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Lista</th>
              <th className="px-4 py-3 text-center font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No hay presupuestos.</td></tr>
            ) : (
              lista.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-mono text-xs text-secondary">{p.numero}</td>
                  <td className="px-4 py-2 text-slate-600">{fmtFecha(p.fecha)}</td>
                  <td className="px-4 py-2 text-foreground">{p.customer?.person.razonSocial ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-600">{p.priceList?.nombre ?? "-"}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE[p.estado] ?? "bg-slate-100 text-slate-500"}`}>{p.estado}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{formatGs(p.total)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => verDetalle(p.id)} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-muted">Ver</button>
                      <button onClick={() => window.open(`/print/presupuesto/${p.id}`, "_blank")} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-secondary hover:bg-muted">Imprimir</button>
                      {p.estado === "VIGENTE" && (
                        <>
                          <button onClick={() => router.push(`/ventas/nueva?presupuesto=${p.id}`)} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10">Convertir</button>
                          <button onClick={() => anular(p)} aria-label="Anular" className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-destructive">
                            <Ban className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detalle */}
      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={`Presupuesto N${detalle?.numero ?? ""}`}
        size="lg"
        footer={detalle && (
          <Button variant="secondary" onClick={() => window.open(`/print/presupuesto/${detalle.id}`, "_blank")}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        )}
      >
        {detalle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Cliente" value={detalle.customer?.person.razonSocial ?? "-"} />
              <Info label="Fecha" value={fmtFecha(detalle.fecha)} />
              <Info label="Lista de precios" value={detalle.priceList?.nombre ?? "-"} />
              <Info label="Validez" value={`${detalle.validezDias} dias`} />
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
                  {detalle.items?.map((it) => (
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
            <div className="flex justify-end text-base font-semibold text-foreground">
              <span className="mr-3 text-secondary">Total</span>
              <span className="font-mono">{formatGs(detalle.total)} Gs</span>
            </div>
            {detalle.observacion && <p className="text-sm text-slate-500">Obs: {detalle.observacion}</p>}
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
