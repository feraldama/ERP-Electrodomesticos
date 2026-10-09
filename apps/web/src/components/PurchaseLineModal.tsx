"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatGs } from "@/lib/format";
import { calcLinea, reescalarImportes, sumaImportes, TASAS, type CompraLinea } from "@/lib/compraLinea";
import type { Article, IvaTipo, PurchaseHistory, PurchaseHistoryRow } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { cn } from "@/lib/cn";

interface PurchaseLineModalProps {
  open: boolean;
  onClose: () => void;
  /** Linea a editar; null para cargar una nueva. */
  initial: CompraLinea | null;
  /** Articulos ya cargados en la compra (no se pueden repetir). */
  excludeIds: number[];
  onSave: (l: CompraLinea) => void;
}

const soloDigitos = (v: string) => v.replace(/\D/g, "");

const LABEL_TASA: Record<IvaTipo, string> = { IVA10: "Grav. 10%", IVA5: "Grav. 5%", EXENTA: "Exentas" };

// Asistente de detalle de compra: carga un articulo con cantidad, bonificacion,
// descuento e importe por tipo de impuesto.
export function PurchaseLineModal({ open, onClose, initial, excludeIds, onSave }: PurchaseLineModalProps) {
  const { notify } = useToast();
  const [l, setL] = useState<CompraLinea | null>(null);
  const [historial, setHistorial] = useState<PurchaseHistoryRow[] | null>(null);

  useEffect(() => {
    if (open) {
      setL(initial);
      setHistorial(null);
    }
  }, [open, initial]);

  // Ultimas compras del articulo elegido
  const articleId = l?.article.id;
  useEffect(() => {
    if (!open || !articleId) return;
    let vivo = true;
    api<PurchaseHistory>(`/stock/purchase-history?articleId=${articleId}`)
      .then((h) => vivo && setHistorial(h.compras.slice(0, 5)))
      .catch(() => vivo && setHistorial([]));
    return () => {
      vivo = false;
    };
  }, [open, articleId]);

  async function elegirArticulo(a: Article) {
    if (excludeIds.includes(a.id)) return notify("error", "El articulo ya esta en la compra");
    // Costo sugerido: el de la ultima compra (con IVA); si no hay, el costo actual.
    let costo = Number(a.costoActual ?? 0);
    try {
      const h = await api<PurchaseHistory>(`/stock/purchase-history?articleId=${a.id}`);
      if (h.compras.length) costo = Number(h.compras[0].costoUnitario);
    } catch {
      /* noop: queda el costo actual */
    }
    setL({
      article: a,
      comprada: a.controlaSerie ? 0 : 1,
      bonificada: 0,
      costoUnitario: Math.round(costo),
      descTipo: "PORC",
      descValor: 0,
      ivaTipo: a.ivaTipo,
      importes: null,
      series: [],
    });
  }

  const patch = (p: Partial<CompraLinea>) => setL((x) => (x ? { ...x, ...p } : x));
  // Cambios de cantidad/descuento: el costo unitario se mantiene y, si el importe esta
  // repartido entre tasas, el reparto se reescala en la misma proporcion.
  const cambiar = (p: Partial<CompraLinea>) =>
    setL((x) => {
      if (!x) return x;
      const n = { ...x, ...p };
      if (!x.importes) return n;
      const costo = calcLinea(x).costoUnitario;
      return { ...n, costoUnitario: costo, importes: reescalarImportes(n, costo) };
    });
  const c = l ? calcLinea(l) : null;

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!l || !c) return notify("error", "Selecciona un articulo");
    if (c.adquirida <= 0) return notify("error", "La cantidad adquirida debe ser mayor a cero");
    if (l.descTipo === "PORC" && (l.descValor < 0 || l.descValor > 100)) {
      return notify("error", "El descuento debe estar entre 0 y 100 %");
    }
    if (c.descuento > c.bruto) return notify("error", "El descuento no puede superar el sub total bruto");
    const series = l.series.map((s) => s.trim()).filter(Boolean);
    if (l.article.controlaSerie && series.length !== c.adquirida) {
      return notify("error", `Carga ${c.adquirida} serie(s)/IMEI, una por unidad adquirida`);
    }
    onSave({ ...l, series });
    onClose();
  }

  const editando = initial != null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Asistente de detalle de documento"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="purchase-line-form" type="submit" disabled={!l}>
            {editando ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      <form id="purchase-line-form" onSubmit={guardar} className="space-y-4">
        {/* Articulo + costo unitario */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
          <div>
            <span className="mb-1 block text-sm font-medium text-secondary">
              Articulo / Mercaderia <span className="text-destructive">*</span>
            </span>
            {l ? (
              <div className="flex h-10 items-center justify-between rounded-lg border border-border bg-muted/60 px-3 text-sm">
                <span className="truncate">
                  <span className="font-mono text-xs text-slate-500">{l.article.codigo}</span>{" "}
                  <span className="text-foreground">{l.article.descripcion}</span>
                </span>
                {!editando && (
                  <button type="button" onClick={() => setL(null)} className="cursor-pointer text-xs font-medium text-primary hover:underline">
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              <ArticleAutocomplete onSelect={elegirArticulo} />
            )}
          </div>
          <Field label="Costo unitario (con IVA)" htmlFor="pl-costo" required>
            <MoneyInput id="pl-costo" disabled={!l} className="text-right font-mono"
              value={c ? String(Math.round(c.costoUnitario)) : ""}
              onChange={(v) => {
                const costo = Number(v) || 0;
                patch({ costoUnitario: costo, importes: l ? reescalarImportes(l, costo) : null });
              }} />
          </Field>
        </div>

        {l && c && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {/* Cantidad */}
              <Panel title="Cantidad">
                {l.article.controlaSerie ? (
                  <Field label={`Series / IMEI (${l.series.length})`} htmlFor="pl-series">
                    <textarea
                      id="pl-series"
                      rows={3}
                      value={l.series.join("\n")}
                      onChange={(e) => {
                        const series = e.target.value.split("\n");
                        const validas = series.map((s) => s.trim()).filter(Boolean);
                        // Las series definen lo adquirido; lo comprado es lo que no es bonificado.
                        cambiar({ series: e.target.value ? series : [], comprada: Math.max(validas.length - l.bonificada, 0) });
                      }}
                      onBlur={() => patch({ series: l.series.map((s) => s.trim()).filter(Boolean) })}
                      placeholder="Una serie / IMEI por renglon"
                      className="w-full rounded-lg border border-border px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </Field>
                ) : (
                  <Field label="Cantidad comprada" htmlFor="pl-cant">
                    <Input id="pl-cant" inputMode="numeric" className="text-right font-mono" value={String(l.comprada)}
                      onChange={(e) => cambiar({ comprada: Number(soloDigitos(e.target.value)) || 0 })} />
                  </Field>
                )}
                <Field label="Cantidad bonificada" htmlFor="pl-bonif">
                  <Input id="pl-bonif" inputMode="numeric" className="text-right font-mono" value={String(l.bonificada)}
                    onChange={(e) => {
                      const b = Number(soloDigitos(e.target.value)) || 0;
                      if (l.article.controlaSerie) {
                        const n = l.series.map((s) => s.trim()).filter(Boolean).length;
                        cambiar({ bonificada: Math.min(b, n), comprada: Math.max(n - b, 0) });
                      } else cambiar({ bonificada: b });
                    }} />
                </Field>
                <ReadOnly label="Cantidad adquirida" value={String(c.adquirida)} />
              </Panel>

              {/* Descuento */}
              <Panel title="Descuento">
                <div>
                  <span className="mb-1 block text-sm font-medium text-secondary">Tipo de descuento</span>
                  <Toggle
                    value={l.descTipo}
                    options={[{ value: "FIJO", label: "Importe fijo" }, { value: "PORC", label: "Porcentual" }]}
                    onChange={(v) => cambiar({ descTipo: v as CompraLinea["descTipo"], descValor: 0 })}
                  />
                </div>
                {l.descTipo === "PORC" ? (
                  <Field label="% Descuento" htmlFor="pl-desc">
                    <Input id="pl-desc" inputMode="decimal" className="text-right font-mono" value={String(l.descValor)}
                      onChange={(e) => {
                        const v = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                        cambiar({ descValor: Math.min(Number(v) || 0, 100) });
                      }} />
                    <p className="mt-0.5 text-[11px] text-slate-500">0 ~ 100 %</p>
                  </Field>
                ) : (
                  <Field label="Importe de descuento" htmlFor="pl-desc">
                    <MoneyInput id="pl-desc" value={String(l.descValor)} onChange={(v) => cambiar({ descValor: Number(v) || 0 })} />
                  </Field>
                )}
                {l.descTipo === "PORC" && <ReadOnly label="Importe de descuento" value={formatGs(c.descuento)} suffix="Gs" />}
              </Panel>

              {/* Importes por tipo de impuesto */}
              <Panel title="Importes">
                {TASAS.map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <label htmlFor={`pl-${t}`} className={cn("w-20 shrink-0 text-right text-sm", c.partes[t] ? "font-semibold text-foreground" : "text-slate-500")}>
                      {LABEL_TASA[t]} :
                    </label>
                    <MoneyInput
                      id={`pl-${t}`}
                      value={String(c.partes[t])}
                      className={cn("text-right font-mono", !c.partes[t] && "text-slate-400")}
                      onChange={(v) => patch({ importes: { ...c.partes, [t]: Number(v) || 0 } })}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                  <span className="text-secondary">Total importes</span>
                  <span className="font-mono font-medium text-foreground">{formatGs(sumaImportes(c.partes))}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Con IVA incluido. Podes repartir el importe entre varias tasas (ej. parte gravada 10% y parte exenta);
                  el costo unitario se recalcula con la suma.
                </p>
                {l.importes && (
                  <button type="button" onClick={() => patch({ costoUnitario: Math.round(c.costoUnitario), importes: null })}
                    className="cursor-pointer text-xs font-medium text-primary hover:underline">
                    Volver todo a {LABEL_TASA[l.article.ivaTipo]}
                  </button>
                )}
              </Panel>

              {/* Total */}
              <Panel title="Total">
                <TotalRow label="Sub total bruto" value={c.bruto} />
                <TotalRow label="Descuento" value={-c.descuento} />
                {c.iva10 > 0 && <TotalRow label="IVA 10% incluido" value={c.iva10} muted />}
                {c.iva5 > 0 && <TotalRow label="IVA 5% incluido" value={c.iva5} muted />}
                {c.partes.EXENTA > 0 && <TotalRow label="Exento" value={c.partes.EXENTA} muted />}
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                  <span>Total</span>
                  <span className="font-mono">{formatGs(c.neto)} Gs</span>
                </div>
                <TotalRow label="Costo por unidad adquirida" value={Math.round(c.costoEfectivo)} muted />
              </Panel>
            </div>

            {/* Ultimas compras */}
            <Panel title="Ultimas compras">
              {historial === null ? (
                <p className="py-4 text-center text-sm text-slate-400">Cargando...</p>
              ) : historial.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Sin compras anteriores de este articulo.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 font-medium">Fecha</th>
                      <th className="py-1.5 font-medium">Comprobante</th>
                      <th className="py-1.5 font-medium">Proveedor</th>
                      <th className="py-1.5 text-right font-medium">Cant.</th>
                      <th className="py-1.5 text-right font-medium">Costo unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((h, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="py-1.5">{h.fecha.slice(0, 10).split("-").reverse().join("/")}</td>
                        <td className="py-1.5 font-mono text-xs">{h.nroComprobante}</td>
                        <td className="py-1.5">{h.proveedor}</td>
                        <td className="py-1.5 text-right font-mono">{Number(h.cantidad)}</td>
                        <td className="py-1.5 text-right font-mono">{formatGs(h.costoUnitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </>
        )}
      </form>
    </Modal>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white">
      <h3 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function ReadOnly({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-secondary">{label}</span>
      <div className="flex h-10 items-center justify-end gap-1 rounded-lg border border-border bg-muted/60 px-3 font-mono text-sm text-foreground">
        {value}
        {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between text-sm", muted ? "text-slate-500" : "text-secondary")}>
      <span>{label}</span>
      <span className="font-mono">{formatGs(value)}</span>
    </div>
  );
}

function Toggle({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer px-2 py-1.5 text-sm transition-colors",
            value === o.value ? "bg-primary font-medium text-white" : "bg-white text-secondary hover:bg-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
