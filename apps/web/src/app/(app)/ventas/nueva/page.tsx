"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import type { Article, Customer, PriceList, SalesInvoice, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { SelectWithAdd } from "@/components/ui/SelectWithAdd";
import { QuickCreateModal } from "@/components/QuickCreateModal";
import { PersonFormModal } from "@/components/PersonFormModal";
import { CustomerPicker } from "@/components/CustomerPicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useToast } from "@/components/ui/Toast";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { desglosarIvaIncluido } from "@/lib/iva";
import { Trash2 } from "lucide-react";

interface Line {
  article: Article;
  cantidad: string;
  precioUnitario: string;
}

type MedioPago = "EFECTIVO" | "TARJETA_DEBITO" | "TARJETA_CREDITO" | "TRANSFERENCIA";

const METODOS: Array<{ key: MedioPago; label: string }> = [
  { key: "EFECTIVO", label: "Efectivo" },
  { key: "TARJETA_DEBITO", label: "Tarjeta debito" },
  { key: "TARJETA_CREDITO", label: "Tarjeta credito" },
  { key: "TRANSFERENCIA", label: "Transferencia" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NuevaVentaPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [fecha, setFecha] = useState(today());
  const [observacion, setObservacion] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pagos, setPagos] = useState<Record<string, string>>({});
  const [cuotasInput, setCuotasInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [addWh, setAddWh] = useState(false);
  const [addCust, setAddCust] = useState(false);

  useEffect(() => {
    api<Warehouse[]>("/warehouses")
      .then((ws) => {
        setWarehouses(ws);
        if (ws.length) setWarehouseId((prev) => prev || String(ws[0].id));
      })
      .catch(() => setWarehouses([]));
    api<PriceList[]>("/price-lists")
      .then((ls) => {
        const activas = ls.filter((l) => l.activo);
        setPriceLists(activas);
        const def = activas.find((l) => l.esDefault) ?? activas[0];
        if (def) setPriceListId((prev) => prev || String(def.id));
      })
      .catch(() => setPriceLists([]));
  }, [companyId]);

  const selectedList = useMemo(
    () => priceLists.find((l) => String(l.id) === priceListId),
    [priceLists, priceListId]
  );

  // Resuelve el precio de un articulo en una lista (cae al precio base si no hay)
  async function resolvePrecio(a: Article, listId: string): Promise<string> {
    const base = String(Math.round(Number(a.precioVenta)) || 0);
    if (!listId) return base;
    try {
      const { precio } = await api<{ precio: string | null }>(
        `/article-prices/resolve?priceListId=${listId}&articleId=${a.id}`
      );
      if (precio != null) return String(Math.round(Number(precio)));
    } catch {
      /* cae al precio base */
    }
    return base;
  }

  // Al cambiar de lista, recalcula el precio de las lineas ya cargadas
  useEffect(() => {
    if (!priceListId || lines.length === 0) return;
    let cancel = false;
    (async () => {
      const updated = await Promise.all(
        lines.map(async (l) => ({ ...l, precioUnitario: await resolvePrecio(l.article, priceListId) }))
      );
      if (!cancel) setLines(updated);
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListId]);

  async function addArticle(a: Article) {
    if (lines.some((l) => l.article.id === a.id)) {
      notify("error", "El articulo ya esta en la venta");
      return;
    }
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

  const totals = useMemo(() => {
    let exenta = 0, grav5 = 0, grav10 = 0, iva5 = 0, iva10 = 0;
    for (const l of lines) {
      const bruto = lineTotal(l);
      const { neto, iva } = desglosarIvaIncluido(bruto, l.article.ivaTipo);
      if (l.article.ivaTipo === "IVA10") { grav10 += neto; iva10 += iva; }
      else if (l.article.ivaTipo === "IVA5") { grav5 += neto; iva5 += iva; }
      else exenta += bruto;
    }
    return { exenta, grav5, grav10, iva5, iva10, total: exenta + grav5 + grav10 + iva5 + iva10 };
  }, [lines]);

  const esCredito = selectedList?.condicion === "CREDITO";

  // Al cambiar de lista, propone el nro de cuotas de la lista (editable)
  useEffect(() => {
    if (selectedList?.condicion === "CREDITO") setCuotasInput(String(selectedList.cuotas || ""));
    else setCuotasInput("");
  }, [selectedList]);

  function setPago(key: string, value: string) {
    setPagos((p) => ({ ...p, [key]: value }));
  }
  const pagosSum = METODOS.reduce((s, m) => s + (Number(pagos[m.key]) || 0), 0);
  const nCuotas = Number(cuotasInput) || 0;
  // En credito el pago es la entrega; el saldo se financia. En contado el pago = total.
  const saldoFinanciar = esCredito ? Math.max(0, totals.total - pagosSum) : 0;
  const cuotaAprox = esCredito && nCuotas > 0 ? Math.floor(saldoFinanciar / nCuotas) : 0;
  const faltaContado = totals.total - pagosSum; // >0 falta, <0 sobra (solo contado)

  // Cantidad de rubros distintos = cantidad de comprobantes que se emitiran
  const rubrosDistintos = useMemo(
    () => new Set(lines.map((l) => l.article.rubro?.nombre ?? "(sin rubro)")).size,
    [lines]
  );

  async function confirm() {
    if (!selectedCustomer) {
      document.getElementById("cli")?.focus();
      return notify("error", "Selecciona un cliente");
    }
    if (!warehouseId) {
      document.getElementById("dep")?.focus();
      return notify("error", "Selecciona un deposito");
    }
    if (!priceListId) {
      document.getElementById("lista")?.focus();
      return notify("error", "Selecciona una lista de precios");
    }
    if (lines.length === 0) return notify("error", "Agrega al menos un articulo");
    if (lines.some((l) => !(Number(l.cantidad) > 0))) return notify("error", "Las cantidades deben ser mayores a cero");

    const pagosArr = METODOS
      .map((m) => ({ medio: m.key, monto: Number(pagos[m.key]) || 0 }))
      .filter((p) => p.monto > 0);

    if (!esCredito) {
      if (pagosSum !== totals.total) {
        return notify(
          "error",
          faltaContado > 0
            ? `Falta asignar ${formatGs(faltaContado)} Gs en formas de pago`
            : `El pago supera el total en ${formatGs(-faltaContado)} Gs`
        );
      }
    } else {
      if (nCuotas < 1) return notify("error", "Indica la cantidad de cuotas");
      if (pagosSum > totals.total) return notify("error", "La entrega no puede superar el total");
    }

    setSaving(true);
    try {
      const { invoices } = await api<{ invoices: SalesInvoice[] }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          priceListId: Number(priceListId),
          warehouseId: Number(warehouseId),
          fecha,
          observacion: observacion.trim() || null,
          items: lines.map((l) => ({
            articleId: l.article.id,
            cantidad: Number(l.cantidad),
            precioUnitario: Number(l.precioUnitario),
          })),
          ...(esCredito ? { cuotas: nCuotas } : {}),
          payments: pagosArr,
        }),
      });
      const nros = invoices.map((i) => i.nroComprobante).filter(Boolean).join(", ");
      notify(
        "success",
        invoices.length > 1
          ? `Venta registrada en ${invoices.length} comprobantes: ${nros}`
          : `Venta registrada: ${nros}`
      );
      setLines([]);
      setObservacion("");
      setPagos({});
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al registrar la venta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Nueva venta</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">VENI001</span>
        </div>
        <p className="text-sm text-slate-500">
          Facturacion contado o credito segun la lista de precios. Descarga stock y, en credito, genera cuotas y pagare.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Cliente" htmlFor="cli" required>
            <CustomerPicker id="cli" selected={selectedCustomer} onSelect={setSelectedCustomer} onAdd={() => setAddCust(true)} />
          </Field>
          <Field label="Lista de precios" htmlFor="lista" required>
            <Select id="lista" value={priceListId} onChange={(e) => setPriceListId(e.target.value)}>
              {priceLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}{l.condicion === "CREDITO" ? ` (${l.cuotas} cuotas)` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deposito (descarga stock)" htmlFor="dep" required>
            <SelectWithAdd id="dep" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} onAdd={() => setAddWh(true)} addTitle="Crear deposito">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.codigo} - {w.nombre}</option>
              ))}
            </SelectWithAdd>
          </Field>
          <Field label="Fecha" htmlFor="fecha" required>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Observacion" htmlFor="obs" className="sm:col-span-2">
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
                <th className="px-3 py-2 font-medium">Rubro</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Precio unit. (con IVA)</th>
                <th className="px-3 py-2 text-center font-medium">IVA</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Busca y agrega articulos a la venta.</td></tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.article.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="text-foreground">{l.article.descripcion}</div>
                      <div className="font-mono text-xs text-slate-500">{l.article.codigo}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{l.article.rubro?.nombre ?? <span className="text-destructive">sin rubro</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} value={l.cantidad}
                        onChange={(e) => updateLine(l.article.id, { cantidad: e.target.value })}
                        className="w-20 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyInput value={l.precioUnitario}
                        onChange={(v) => updateLine(l.article.id, { precioUnitario: v })}
                        className="ml-auto h-8 w-28 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{IVA_LABEL[l.article.ivaTipo]}</td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-foreground">{formatGs(lineTotal(l))}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeLine(l.article.id)} aria-label="Quitar"
                        className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-sm">
            {rubrosDistintos > 1 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                Hay {rubrosDistintos} rubros: se emitiran {rubrosDistintos} comprobantes (uno por rubro / punto de expedicion).
              </p>
            )}
          </div>
          <div className="w-full max-w-xs space-y-1 text-sm">
            {totals.exenta > 0 && <Row label="Exentas" value={totals.exenta} />}
            {totals.grav5 > 0 && <><Row label="Gravadas 5%" value={totals.grav5} /><Row label="IVA 5%" value={totals.iva5} muted /></>}
            {totals.grav10 > 0 && <><Row label="Gravadas 10%" value={totals.grav10} /><Row label="IVA 10%" value={totals.iva10} muted /></>}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
              <span>Total</span>
              <span className="font-mono">{formatGs(totals.total)} Gs</span>
            </div>
          </div>
        </div>

        {/* Forma de pago */}
        {lines.length > 0 && (
          <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-secondary">
                {esCredito ? "Entrega inicial (forma de pago)" : "Forma de pago"}
              </h2>
              {esCredito && (
                <div className="flex items-center gap-2">
                  <label htmlFor="cuotas" className="text-sm text-secondary">Cuotas</label>
                  <input
                    id="cuotas"
                    type="number"
                    min={1}
                    value={cuotasInput}
                    onChange={(e) => setCuotasInput(e.target.value)}
                    className="w-20 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {METODOS.map((m) => (
                <Field key={m.key} label={m.label} htmlFor={`pago-${m.key}`}>
                  <MoneyInput id={`pago-${m.key}`} value={pagos[m.key] ?? ""} onChange={(v) => setPago(m.key, v)} placeholder="0" />
                </Field>
              ))}
            </div>

            {/* Resumen del pago */}
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
              {!esCredito ? (
                <>
                  <span className="text-secondary">
                    Asignado: <span className="font-mono font-semibold text-foreground">{formatGs(pagosSum)} Gs</span>
                  </span>
                  {faltaContado !== 0 && (
                    <span className={faltaContado > 0 ? "text-destructive" : "text-amber-600"}>
                      {faltaContado > 0 ? `Falta ${formatGs(faltaContado)} Gs` : `Sobra ${formatGs(-faltaContado)} Gs`}
                    </span>
                  )}
                  {faltaContado > 0 && (
                    <button
                      type="button"
                      onClick={() => setPago("EFECTIVO", String((Number(pagos.EFECTIVO) || 0) + faltaContado))}
                      className="cursor-pointer text-xs font-medium text-primary hover:underline"
                    >
                      Completar con efectivo
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-secondary">
                    Entrega: <span className="font-mono font-semibold text-foreground">{formatGs(pagosSum)} Gs</span>
                  </span>
                  <span className="text-secondary">
                    Saldo a financiar: <span className="font-mono font-semibold text-foreground">{formatGs(saldoFinanciar)} Gs</span>
                  </span>
                  {nCuotas > 0 && saldoFinanciar > 0 && (
                    <span className="text-secondary">
                      {nCuotas} cuotas de aprox.{" "}
                      <span className="font-mono font-semibold text-foreground">{formatGs(cuotaAprox)} Gs</span>
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button onClick={confirm} loading={saving} disabled={lines.length === 0}>
            Confirmar venta
          </Button>
        </div>
      </div>

      <QuickCreateModal
        kind="warehouse"
        open={addWh}
        onClose={() => setAddWh(false)}
        onCreated={(item) => {
          setWarehouses((p) => [...p, item as unknown as Warehouse]);
          setWarehouseId(String(item.id));
        }}
      />

      <PersonFormModal
        open={addCust}
        onClose={() => setAddCust(false)}
        role="customer"
        onSaved={async (person) => {
          try {
            const cs = await api<Customer[]>(`/customers?q=${encodeURIComponent(person.nroDoc)}`);
            const creado = cs.find((c) => c.person.id === person.id) ?? cs[0];
            if (creado) setSelectedCustomer(creado);
          } catch {
            /* noop */
          }
        }}
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-slate-500" : "text-secondary"}`}>
      <span>{label}</span>
      <span className="font-mono">{formatGs(value)}</span>
    </div>
  );
}
