"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, hoyYmd } from "@/lib/format";
import type { Branch, Supplier, SupplierTimbrado, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { SelectWithAdd } from "@/components/ui/SelectWithAdd";
import { QuickCreateModal } from "@/components/QuickCreateModal";
import { PersonFormModal } from "@/components/PersonFormModal";
import { SupplierPicker } from "@/components/SupplierPicker";
import { SupplierTimbradoModal } from "@/components/SupplierTimbradoModal";
import { useToast } from "@/components/ui/Toast";
import { PurchaseLineModal } from "@/components/PurchaseLineModal";
import { PurchasePaymentModal, MEDIO_COMPRA_LABEL, type MedioPagoCompra, type PagoCompra } from "@/components/PurchasePaymentModal";
import { PurchaseCreditModal, type CuotaCompra } from "@/components/PurchaseCreditModal";
import { calcLinea, type CompraLinea } from "@/lib/compraLinea";
import { desglosarIvaIncluido } from "@/lib/iva";
import { cn } from "@/lib/cn";
import { ArrowLeftRight, Banknote, CalendarClock, Check, FileText, Pencil, Plus, Trash2, X } from "lucide-react";

const MEDIOS_CONTADO: Array<{ key: MedioPagoCompra; icon: typeof Banknote }> = [
  { key: "EFECTIVO", icon: Banknote },
  { key: "TRANSFERENCIA", icon: ArrowLeftRight },
  { key: "CHEQUE", icon: FileText },
];
// Referencia estable: el modal de credito se reinicia cuando cambia `initial`.
const SIN_CUOTAS: CuotaCompra[] = [];

function today() {
  return hoyYmd();
}

export default function CargarCompraPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  // Nro de comprobante en partes: establecimiento (3) - punto de emision (3) - numero (7)
  const [establecimiento, setEstablecimiento] = useState("");
  const [puntoEmision, setPuntoEmision] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  // Timbrados vigentes del proveedor seleccionado
  const [timbrados, setTimbrados] = useState<SupplierTimbrado[]>([]);
  const [timbradoId, setTimbradoId] = useState("");
  const [addTimb, setAddTimb] = useState(false);
  const [fecha, setFecha] = useState(today());
  const [condicion, setCondicion] = useState<"CONTADO" | "CREDITO">("CONTADO");
  const [lines, setLines] = useState<CompraLinea[]>([]);
  // Asistente de detalle: abierto con una linea a editar (o null = nueva)
  const [lineModal, setLineModal] = useState<{ open: boolean; edit: CompraLinea | null }>({ open: false, edit: null });
  // Contado: pagos por medio (deben sumar el total). Credito: cronograma de cuotas.
  const [pagos, setPagos] = useState<PagoCompra[]>([]);
  const [medioModal, setMedioModal] = useState<MedioPagoCompra | null>(null);
  const [cuotas, setCuotas] = useState<CuotaCompra[]>([]);
  const [creditModal, setCreditModal] = useState(false);
  // Claves contables de medios de pago con cuenta asignada (sin cuenta, el pago sale de Caja).
  const [mediosConCuenta, setMediosConCuenta] = useState<Set<string> | null>(null);
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
    api<Branch[]>("/branches")
      .then((bs) => {
        setBranches(bs);
        if (bs.length) setBranchId(String(bs[0].id));
      })
      .catch(() => setBranches([]));
    api<Array<{ clave: string; accountId: number | null }>>("/contabilidad/config")
      .then((cfg) => setMediosConCuenta(new Set(cfg.filter((c) => c.accountId).map((c) => c.clave))))
      .catch(() => setMediosConCuenta(null));
  }, [companyId]);

  // Al cambiar de proveedor se cargan sus timbrados vigentes; si tiene uno solo se elige.
  useEffect(() => {
    setTimbrados([]);
    setTimbradoId("");
    if (!selectedSupplier) return;
    api<SupplierTimbrado[]>(`/suppliers/${selectedSupplier.id}/timbrados`)
      .then((ts) => {
        setTimbrados(ts);
        if (ts.length === 1) selectTimbrado(ts[0]);
      })
      .catch(() => setTimbrados([]));
  }, [selectedSupplier]);

  // Elegir un timbrado completa establecimiento y punto de emision del comprobante.
  function selectTimbrado(t: SupplierTimbrado | undefined) {
    setTimbradoId(t ? String(t.id) : "");
    if (t) {
      setEstablecimiento(t.establecimiento);
      setPuntoEmision(t.puntoExpedicion);
    }
  }

  const timbradoSel = timbrados.find((t) => String(t.id) === timbradoId);

  // Alta o modificacion de una linea desde el asistente
  function saveLine(nueva: CompraLinea) {
    setLines((ls) =>
      ls.some((l) => l.article.id === nueva.article.id)
        ? ls.map((l) => (l.article.id === nueva.article.id ? nueva : l))
        : [...ls, nueva]
    );
  }
  function removeLine(id: number) {
    setLines((ls) => ls.filter((l) => l.article.id !== id));
  }

  // Totales: el costo ya incluye IVA -> se desglosa (mismo calculo que el backend)
  const totals = useMemo(() => {
    let exenta = 0, grav5 = 0, grav10 = 0, iva5 = 0, iva10 = 0;
    // Cada linea puede tener importe en varias tasas: se desglosa parte por parte.
    for (const l of lines) {
      const { partes } = calcLinea(l);
      const d10 = desglosarIvaIncluido(partes.IVA10, "IVA10");
      const d5 = desglosarIvaIncluido(partes.IVA5, "IVA5");
      grav10 += d10.neto; iva10 += d10.iva;
      grav5 += d5.neto; iva5 += d5.iva;
      exenta += partes.EXENTA;
    }
    return { exenta, grav5, grav10, iva5, iva10, total: exenta + grav5 + grav10 + iva5 + iva10 };
  }, [lines]);

  const totalCompra = Math.round(totals.total);
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  const faltaPagar = totalCompra - pagado;
  const totalCuotas = cuotas.reduce((s, c) => s + c.monto, 0);
  // Si cambia el detalle despues de cargar la condicion, las cuotas ya no cuadran.
  const cuotasDesactualizadas = cuotas.length > 0 && totalCuotas !== totalCompra;
  // Si se cambia la fecha de la compra despues, un vencimiento o cobro puede quedar antes.
  const fechasAnteriores =
    condicion === "CONTADO"
      ? pagos.some((p) => p.fechaCobro && p.fechaCobro < fecha)
      : cuotas.some((c) => c.fechaVencimiento < fecha);

  // Transferencia / cheque usados sin cuenta propia: el asiento los registra como salida de Caja.
  const mediosSinCuenta = mediosConCuenta
    ? [...new Set(pagos.map((p) => p.medio))].filter((m) => m !== "EFECTIVO" && !mediosConCuenta.has(`MEDIO_${m}`))
    : [];

  function cambiarCondicion(c: "CONTADO" | "CREDITO") {
    setCondicion(c);
    setPagos([]);
    setCuotas([]);
  }

  const nroCompleto = numeroFactura
    ? `${pad(establecimiento, 3)}-${pad(puntoEmision, 3)}-${pad(numeroFactura, 7)}`
    : "";

  async function confirm() {
    if (!selectedSupplier) {
      document.getElementById("prov")?.focus();
      return notify("error", "Selecciona un proveedor");
    }
    if (!timbradoSel) {
      document.getElementById("timb")?.focus();
      return notify("error", "Selecciona el timbrado (o dalo de alta)");
    }
    if (timbradoSel.establecimiento !== pad(establecimiento, 3) || timbradoSel.puntoExpedicion !== pad(puntoEmision, 3)) {
      return notify("error", `El timbrado ${timbradoSel.numero} corresponde a ${timbradoSel.establecimiento}-${timbradoSel.puntoExpedicion}`);
    }
    if (branches.length && !branchId) return notify("error", "Selecciona una sucursal");
    if (!warehouseId) return notify("error", "Selecciona un deposito");
    if (!Number(establecimiento) || !Number(puntoEmision)) {
      document.getElementById("est")?.focus();
      return notify("error", "Ingresa el comprobante y punto de emision");
    }
    if (!Number(numeroFactura)) {
      document.getElementById("nro")?.focus();
      return notify("error", "Ingresa el numero de factura");
    }
    if (lines.length === 0) return notify("error", "Agrega al menos un articulo");
    if (lines.some((l) => !(calcLinea(l).adquirida > 0))) return notify("error", "Cantidades deben ser mayores a cero");
    if (condicion === "CONTADO" && faltaPagar !== 0) {
      return notify("error", faltaPagar > 0
        ? `Falta asignar ${formatGs(faltaPagar)} Gs en la forma de pago`
        : `Los pagos superan el total en ${formatGs(-faltaPagar)} Gs`);
    }
    if (condicion === "CREDITO" && cuotas.length === 0) return notify("error", "Carga la condicion de pago del credito");
    if (condicion === "CREDITO" && cuotasDesactualizadas) {
      return notify("error", "El total cambio: revisa la condicion de pago");
    }
    if (fechasAnteriores) {
      return notify("error", condicion === "CONTADO"
        ? "Hay un cheque con fecha de cobro anterior a la fecha de la compra"
        : "Hay cuotas que vencen antes de la fecha de la compra");
    }

    setSaving(true);
    try {
      await api("/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId: selectedSupplier.id,
          branchId: branchId ? Number(branchId) : null,
          warehouseId: Number(warehouseId),
          nroComprobante: nroCompleto,
          timbrado: timbradoSel?.numero ?? null,
          fecha,
          condicion,
          items: lines.map((l) => {
            const c = calcLinea(l);
            return {
              articleId: l.article.id,
              cantidad: c.adquirida,
              cantidadBonificada: l.bonificada,
              // Precio por unidad comprada; si se cargo el importe se deriva de el (puede tener decimales)
              costoUnitario: Math.round(c.costoUnitario * 1e6) / 1e6,
              descuento: c.descuento,
              ivaTipo: l.ivaTipo,
              importes: c.partes, // importe por tasa (con IVA): manda sobre costo x cantidad
              ...(l.article.controlaSerie ? { series: l.series } : {}),
            };
          }),
          ...(condicion === "CONTADO" ? { pagos } : { cuotas }),
        }),
      });
      notify("success", "Compra registrada: stock y costos actualizados");
      // limpiar
      // Se conservan establecimiento/punto/timbrado: suele cargarse varias facturas del mismo proveedor
      setNumeroFactura("");
      setLines([]);
      setPagos([]);
      setCuotas([]);
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

      {/* Tipo, Numeracion y Fecha */}
      <Section title="Tipo, Numeración y Fecha">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo de movimiento" htmlFor="cond" required>
            <Select id="cond" value={condicion} onChange={(e) => cambiarCondicion(e.target.value as "CONTADO" | "CREDITO")}>
              <option value="CONTADO">Compra contado</option>
              <option value="CREDITO">Compra credito</option>
            </Select>
          </Field>
          <Field label="Fecha de comprobante" htmlFor="fecha" required>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-[1fr_1fr_1.4fr_2fr]">
          <Field label="Comprobante" htmlFor="est" required>
            <Input id="est" value={establecimiento} inputMode="numeric" maxLength={3} placeholder="000"
              className="text-right font-mono"
              onChange={(e) => setEstablecimiento(soloDigitos(e.target.value))}
              onBlur={() => establecimiento && setEstablecimiento(pad(establecimiento, 3))} />
          </Field>
          <Field label="Punto de emision" htmlFor="pto" required>
            <Input id="pto" value={puntoEmision} inputMode="numeric" maxLength={3} placeholder="000"
              className="text-right font-mono"
              onChange={(e) => setPuntoEmision(soloDigitos(e.target.value))}
              onBlur={() => puntoEmision && setPuntoEmision(pad(puntoEmision, 3))} />
          </Field>
          <Field label="Numero de factura" htmlFor="nro" required>
            <Input id="nro" value={numeroFactura} inputMode="numeric" maxLength={7} placeholder="0000000"
              className="text-right font-mono"
              onChange={(e) => setNumeroFactura(soloDigitos(e.target.value))}
              onBlur={() => numeroFactura && setNumeroFactura(pad(numeroFactura, 7))} />
          </Field>
          <div className="col-span-2 sm:col-span-1">
            <span className="mb-1 block text-sm font-medium text-secondary">Formato de factura</span>
            <div className="flex h-10 items-center rounded-lg border border-dashed border-border px-3 font-mono text-sm text-foreground">
              {nroCompleto || <span className="text-slate-400">000-000-0000000</span>}
            </div>
          </div>
        </div>
      </Section>

      {/* Proveedor y otros datos */}
      <Section title="Proveedor y otros datos">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Proveedor" htmlFor="prov" required>
            <SupplierPicker id="prov" selected={selectedSupplier} onSelect={setSelectedSupplier} onAdd={() => setAddSup(true)} />
          </Field>
          <div>
            <span className="mb-1 block text-sm font-medium text-secondary">RUC</span>
            <div className="flex h-10 items-center rounded-lg border border-border bg-muted/60 px-3 font-mono text-sm text-foreground">
              {selectedSupplier
                ? selectedSupplier.person.ruc || selectedSupplier.person.nroDoc
                : <span className="text-slate-400">—</span>}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Timbrado" htmlFor="timb" required>
            <SelectWithAdd id="timb" value={timbradoId}
              onChange={(e) => selectTimbrado(timbrados.find((t) => String(t.id) === e.target.value))}
              onAdd={() => (selectedSupplier ? setAddTimb(true) : notify("error", "Selecciona primero el proveedor"))}
              addTitle="Alta de timbrado">
              <option value="">
                {!selectedSupplier ? "— Elegi un proveedor —" : timbrados.length ? "-- Selecciona --" : "— Sin timbrados vigentes —"}
              </option>
              {timbrados.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.numero} · {t.establecimiento}-{t.puntoExpedicion} · vence {ymdAFecha(t.fechaVencimiento)}
                </option>
              ))}
            </SelectWithAdd>
          </Field>
          <Field label="Sucursal" htmlFor="suc" required>
            <Select id="suc" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.length === 0 && <option value="">— Sin sucursales —</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.codigo} - {b.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Deposito de ingreso" htmlFor="dep" required>
            <SelectWithAdd id="dep" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} onAdd={() => setAddWh(true)} addTitle="Crear deposito">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.codigo} - {w.nombre}</option>
              ))}
            </SelectWithAdd>
          </Field>
        </div>
      </Section>

      {/* Detalle */}
      <Section
        title="Detalle"
        actions={
          <Button size="sm" onClick={() => setLineModal({ open: true, edit: null })}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Articulo</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
                <th className="px-3 py-2 text-right font-medium">Descuento</th>
                <th className="px-3 py-2 text-right font-medium">Grav. 10%</th>
                <th className="px-3 py-2 text-right font-medium">Grav. 5%</th>
                <th className="px-3 py-2 text-right font-medium">Exentas</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Usa &quot;Agregar&quot; para cargar los articulos de la compra.</td></tr>
              ) : (
                lines.map((l) => {
                  const c = calcLinea(l);
                  return (
                    <tr key={l.article.id} onDoubleClick={() => setLineModal({ open: true, edit: l })}
                      className="border-b border-border last:border-0 align-top hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <div className="text-foreground">{l.article.descripcion}</div>
                        <div className="font-mono text-xs text-slate-500">
                          {l.article.codigo}
                          {l.article.controlaSerie && ` · ${l.series.length} serie(s)`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {c.adquirida}
                        {l.bonificada > 0 && <div className="text-[11px] text-slate-500">{l.bonificada} bonif.</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatGs(Math.round(c.costoUnitario))}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        {c.descuento ? formatGs(c.descuento) : "-"}
                        {l.descTipo === "PORC" && l.descValor > 0 && <div className="text-[11px] text-slate-500">{l.descValor}%</div>}
                      </td>
                      {(["IVA10", "IVA5", "EXENTA"] as const).map((t) => (
                        <td key={t} className="px-3 py-2 text-right font-mono font-medium text-foreground">
                          {c.partes[t] ? formatGs(c.partes[t]) : <span className="font-normal text-slate-300">0</span>}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button onClick={() => setLineModal({ open: true, edit: l })} aria-label="Editar"
                          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => removeLine(l.article.id)} aria-label="Quitar"
                          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
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

        {/* Metodo de pago: contado por medio / credito con condicion de pago */}
        {lines.length > 0 && (
          <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-secondary">
              {condicion === "CONTADO" ? "Metodo de pago" : "Condicion de pago"}
            </h3>

            {condicion === "CONTADO" ? (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {MEDIOS_CONTADO.map(({ key, icon: Icon }) => {
                    const usado = pagos.some((p) => p.medio === key);
                    return (
                      <button key={key} type="button" onClick={() => setMedioModal(key)}
                        className={cn(
                          "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          usado ? "border-accent bg-accent/10 text-accent" : "border-border bg-white text-secondary hover:border-primary hover:text-primary"
                        )}>
                        <Icon className="h-4 w-4" /> {MEDIO_COMPRA_LABEL[key]}
                      </button>
                    );
                  })}
                </div>

                {pagos.length > 0 && (
                  <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-white">
                    {pagos.map((p, i) => (
                      <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="w-28 font-medium text-foreground">{MEDIO_COMPRA_LABEL[p.medio]}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                          {[p.banco, p.referencia && (p.medio === "CHEQUE" ? `N° ${p.referencia}` : `Op. ${p.referencia}`),
                            p.fechaCobro && `cobro ${ymdAFecha(p.fechaCobro)}`].filter(Boolean).join(" · ")}
                        </span>
                        <span className="font-mono font-medium text-foreground">{formatGs(p.monto)}</span>
                        <button type="button" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} aria-label="Quitar pago"
                          className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {fechasAnteriores && (
                  <p className="mt-2 text-sm text-destructive">
                    Hay un cheque con fecha de cobro anterior a la fecha de la compra: quitalo y vuelve a cargarlo.
                  </p>
                )}
                {mediosSinCuenta.length > 0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {mediosSinCuenta.map((m) => MEDIO_COMPRA_LABEL[m]).join(" y ")}{" "}
                    {mediosSinCuenta.length > 1 ? "no tienen" : "no tiene"} cuenta contable propia: en el asiento se
                    registrara como salida de Caja. Se asigna en Contabilidad › Configuracion de cuentas.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                  <span className="text-secondary">
                    Asignado: <span className="font-mono font-semibold text-foreground">{formatGs(pagado)} Gs</span>
                  </span>
                  {faltaPagar === 0 ? (
                    <span className="flex items-center gap-1 text-accent"><Check className="h-4 w-4" /> Pago completo</span>
                  ) : (
                    <span className={faltaPagar > 0 ? "text-destructive" : "text-amber-600"}>
                      {faltaPagar > 0 ? `Falta ${formatGs(faltaPagar)} Gs` : `Sobra ${formatGs(-faltaPagar)} Gs`}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setCreditModal(true)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto",
                    cuotas.length && !cuotasDesactualizadas
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-white text-secondary hover:border-primary hover:text-primary"
                  )}>
                  <CalendarClock className="h-4 w-4" />
                  {cuotas.length ? "Editar condicion de pago" : "Cargar condicion de pago"}
                </button>
                {cuotas.length > 0 && (
                  <p className="mt-3 text-sm text-secondary">
                    {cuotas.length} cuota{cuotas.length > 1 ? "s" : ""} de {formatGs(cuotas[0].monto)} Gs
                    {" · "}vence{cuotas.length > 1 ? "n" : ""} {ymdAFecha(cuotas[0].fechaVencimiento)}
                    {cuotas.length > 1 && ` al ${ymdAFecha(cuotas[cuotas.length - 1].fechaVencimiento)}`}
                  </p>
                )}
                {cuotasDesactualizadas && (
                  <p className="mt-1 text-sm text-destructive">El total de la compra cambio: vuelve a aplicar la condicion de pago.</p>
                )}
                {fechasAnteriores && (
                  <p className="mt-1 text-sm text-destructive">Hay cuotas que vencen antes de la fecha de la compra: edita la condicion de pago.</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button onClick={confirm} loading={saving} disabled={lines.length === 0}>
            Confirmar compra
          </Button>
        </div>
      </Section>

      <PurchasePaymentModal
        medio={medioModal}
        onClose={() => setMedioModal(null)}
        pendiente={Math.max(faltaPagar, 0)}
        fecha={fecha}
        onSave={(p) => setPagos((ps) => [...ps, p])}
      />

      <PurchaseCreditModal
        open={creditModal}
        onClose={() => setCreditModal(false)}
        total={totalCompra}
        fecha={fecha}
        initial={cuotasDesactualizadas ? SIN_CUOTAS : cuotas}
        onSave={setCuotas}
      />

      <PurchaseLineModal
        open={lineModal.open}
        onClose={() => setLineModal((m) => ({ ...m, open: false }))}
        initial={lineModal.edit}
        excludeIds={lines.map((l) => l.article.id)}
        onSave={saveLine}
      />

      <QuickCreateModal
        kind="warehouse"
        open={addWh}
        onClose={() => setAddWh(false)}
        onCreated={(item) => {
          setWarehouses((p) => [...p, item as unknown as Warehouse]);
          setWarehouseId(String(item.id));
        }}
      />

      <SupplierTimbradoModal
        open={addTimb}
        onClose={() => setAddTimb(false)}
        supplierId={selectedSupplier?.id ?? null}
        defaults={{ establecimiento, puntoExpedicion: puntoEmision }}
        onCreated={(t) => {
          // Solo se ofrece si sigue vigente
          if (t.fechaVencimiento.slice(0, 10) >= today()) {
            setTimbrados((p) => [t, ...p]);
            selectTimbrado(t);
          } else {
            notify("error", "El timbrado registrado ya esta vencido");
          }
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

function soloDigitos(v: string) {
  return v.replace(/\D/g, "");
}

// "2026-12-31T00:00:00.000Z" -> "31/12/2026" (fecha de documento: dia en UTC)
function ymdAFecha(iso: string) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

function pad(v: string, n: number) {
  return (v || "").padStart(n, "0");
}

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
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
