"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { Article, IvaTipo, Supplier, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { SelectWithAdd } from "@/components/ui/SelectWithAdd";
import { QuickCreateModal } from "@/components/QuickCreateModal";
import { PersonFormModal } from "@/components/PersonFormModal";
import { SupplierPicker } from "@/components/SupplierPicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useToast } from "@/components/ui/Toast";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { desglosarIvaIncluido } from "@/lib/iva";
import { Trash2 } from "lucide-react";

interface Line {
  article: Article;
  cantidad: string;
  costoUnitario: string;
  ivaTipo: IvaTipo;
  series: string; // textarea (una serie/IMEI por renglon); solo si el articulo controla serie
}

// Series no vacias de una linea.
function parseSeries(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function CargarCompraPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [nroComprobante, setNroComprobante] = useState("");
  const [timbrado, setTimbrado] = useState("");
  const [fecha, setFecha] = useState(today());
  const [condicion, setCondicion] = useState<"CONTADO" | "CREDITO">("CONTADO");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [addWh, setAddWh] = useState(false);
  const [addSup, setAddSup] = useState(false);

  useEffect(() => {
    api<Warehouse[]>("/warehouses")
      .then((ws) => {
        setWarehouses(ws);
        if (ws.length) setWarehouseId(String(ws[0].id));
      })
      .catch(() => setWarehouses([]));
  }, [companyId]);

  function addArticle(a: Article) {
    if (lines.some((l) => l.article.id === a.id)) {
      notify("error", "El articulo ya esta en la lista");
      return;
    }
    setLines((ls) => [
      ...ls,
      { article: a, cantidad: a.controlaSerie ? "0" : "1", costoUnitario: a.costoActual ?? "0", ivaTipo: a.ivaTipo, series: "" },
    ]);
  }

  function updateLine(id: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.article.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: number) {
    setLines((ls) => ls.filter((l) => l.article.id !== id));
  }

  // Totales: el costo ya incluye IVA -> se desglosa (mismo calculo que el backend)
  const totals = useMemo(() => {
    let exenta = 0, grav5 = 0, grav10 = 0, iva5 = 0, iva10 = 0;
    for (const l of lines) {
      const bruto = Math.round((Number(l.cantidad) || 0) * (Number(l.costoUnitario) || 0));
      const { neto, iva } = desglosarIvaIncluido(bruto, l.ivaTipo);
      if (l.ivaTipo === "IVA10") { grav10 += neto; iva10 += iva; }
      else if (l.ivaTipo === "IVA5") { grav5 += neto; iva5 += iva; }
      else exenta += bruto;
    }
    return { exenta, grav5, grav10, iva5, iva10, total: exenta + grav5 + grav10 + iva5 + iva10 };
  }, [lines]);

  function lineTotal(l: Line) {
    return Math.round((Number(l.cantidad) || 0) * (Number(l.costoUnitario) || 0));
  }

  async function confirm() {
    if (!selectedSupplier) {
      document.getElementById("prov")?.focus();
      return notify("error", "Selecciona un proveedor");
    }
    if (!warehouseId) return notify("error", "Selecciona un deposito");
    if (!nroComprobante.trim()) return notify("error", "Ingresa el nro de comprobante");
    if (lines.length === 0) return notify("error", "Agrega al menos un articulo");
    if (lines.some((l) => !(Number(l.cantidad) > 0))) return notify("error", "Cantidades deben ser mayores a cero");

    setSaving(true);
    try {
      await api("/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId: selectedSupplier.id,
          warehouseId: Number(warehouseId),
          nroComprobante: nroComprobante.trim(),
          timbrado: timbrado.trim() || null,
          fecha,
          condicion,
          items: lines.map((l) => ({
            articleId: l.article.id,
            cantidad: Number(l.cantidad),
            costoUnitario: Number(l.costoUnitario),
            ivaTipo: l.ivaTipo,
            ...(l.article.controlaSerie ? { series: parseSeries(l.series) } : {}),
          })),
        }),
      });
      notify("success", "Compra registrada: stock y costos actualizados");
      // limpiar
      setNroComprobante("");
      setTimbrado("");
      setLines([]);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al registrar la compra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Cargar compra</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">COMI001</span>
        </div>
        <p className="text-sm text-slate-500">Registra una compra: ingresa stock, actualiza costos y la cuenta del proveedor</p>
      </div>

      {/* Cabecera */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Proveedor" htmlFor="prov" required>
            <SupplierPicker id="prov" selected={selectedSupplier} onSelect={setSelectedSupplier} onAdd={() => setAddSup(true)} />
          </Field>
          <Field label="Deposito de ingreso" htmlFor="dep" required>
            <SelectWithAdd id="dep" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} onAdd={() => setAddWh(true)} addTitle="Crear deposito">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.codigo} - {w.nombre}</option>
              ))}
            </SelectWithAdd>
          </Field>
          <Field label="Condicion" htmlFor="cond">
            <Select id="cond" value={condicion} onChange={(e) => setCondicion(e.target.value as "CONTADO" | "CREDITO")}>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Credito</option>
            </Select>
          </Field>
          <Field label="Nro. comprobante" htmlFor="nro" required>
            <Input id="nro" value={nroComprobante} onChange={(e) => setNroComprobante(e.target.value)} placeholder="001-001-0000123" />
          </Field>
          <Field label="Timbrado" htmlFor="timb">
            <Input id="timb" value={timbrado} onChange={(e) => setTimbrado(e.target.value)} />
          </Field>
          <Field label="Fecha" htmlFor="fecha" required>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        {/* Agregar articulos */}
        <div className="mt-5">
          <label className="mb-1 block text-sm font-medium text-secondary">Agregar articulo</label>
          <ArticleAutocomplete onSelect={addArticle} />
        </div>

        {/* Detalle */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Articulo</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Costo unit. (con IVA)</th>
                <th className="px-3 py-2 text-center font-medium">IVA</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Busca y agrega articulos a la compra.</td></tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.article.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2">
                      <div className="text-foreground">{l.article.descripcion}</div>
                      <div className="font-mono text-xs text-slate-500">{l.article.codigo}</div>
                      {l.article.controlaSerie && (
                        <div className="mt-2">
                          <textarea
                            value={l.series}
                            onChange={(e) =>
                              updateLine(l.article.id, {
                                series: e.target.value,
                                cantidad: String(parseSeries(e.target.value).length),
                              })
                            }
                            rows={3}
                            placeholder="Una serie / IMEI por renglon"
                            className="w-full rounded-lg border border-border px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <p className="mt-0.5 text-[11px] text-slate-500">{parseSeries(l.series).length} unidad(es) por serie</p>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.article.controlaSerie ? (
                        <span className="inline-block w-20 rounded-lg bg-muted px-2 py-1 text-right text-sm text-slate-600">
                          {l.cantidad}
                        </span>
                      ) : (
                        <input type="number" min={0} value={l.cantidad}
                          onChange={(e) => updateLine(l.article.id, { cantidad: e.target.value })}
                          className="w-20 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyInput value={l.costoUnitario}
                        onChange={(v) => updateLine(l.article.id, { costoUnitario: v })}
                        className="h-8 w-28 px-2 py-1" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Select value={l.ivaTipo} onChange={(e) => updateLine(l.article.id, { ivaTipo: e.target.value as IvaTipo })} className="w-24">
                        <option value="IVA10">10%</option>
                        <option value="IVA5">5%</option>
                        <option value="EXENTA">Exenta</option>
                      </Select>
                    </td>
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
        <div className="mt-5 flex flex-col items-end gap-1 text-sm">
          <div className="w-full max-w-xs space-y-1">
            {totals.exenta > 0 && <Row label="Exentas" value={totals.exenta} />}
            {totals.grav5 > 0 && <><Row label="Gravadas 5%" value={totals.grav5} /><Row label="IVA 5%" value={totals.iva5} muted /></>}
            {totals.grav10 > 0 && <><Row label="Gravadas 10%" value={totals.grav10} /><Row label="IVA 10%" value={totals.iva10} muted /></>}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
              <span>Total</span>
              <span className="font-mono">{formatGs(totals.total)} Gs</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={confirm} loading={saving} disabled={lines.length === 0}>
            Confirmar compra
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
        open={addSup}
        onClose={() => setAddSup(false)}
        role="supplier"
        onSaved={async (person) => {
          try {
            const ss = await api<Supplier[]>(`/suppliers?q=${encodeURIComponent(person.nroDoc)}`);
            const creado = ss.find((s) => s.person.id === person.id) ?? ss[0];
            if (creado) setSelectedSupplier(creado);
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
