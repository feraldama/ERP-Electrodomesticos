"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import type { Article, CondicionPago, Customer, PriceList, PuntoExpedicion, SalesInvoice, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { SelectWithAdd } from "@/components/ui/SelectWithAdd";
import { QuickCreateModal } from "@/components/QuickCreateModal";
import { PersonFormModal } from "@/components/PersonFormModal";
import { CustomerPicker } from "@/components/CustomerPicker";
import { SerialPicker } from "@/components/SerialPicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useToast } from "@/components/ui/Toast";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { useArticleRowFocus } from "@/lib/useArticleRowFocus";
import { desglosarIvaIncluido } from "@/lib/iva";
import { Trash2 } from "lucide-react";

interface Line {
  article: Article;
  cantidad: string;
  precioUnitario: string;
  series: string[]; // solo si el articulo controla serie (cantidad = series.length)
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

// Suma n meses a una fecha yyyy-mm-dd y devuelve yyyy-mm-dd (fecha local, sin TZ).
function addMonthsStr(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setMonth(date.getMonth() + n);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function NuevaVentaInner() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [puntos, setPuntos] = useState<PuntoExpedicion[]>([]);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [condicion, setCondicion] = useState<CondicionPago>("CONTADO");
  const [puntoId, setPuntoId] = useState("");
  const [fecha, setFecha] = useState(today());
  const [observacion, setObservacion] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  // Existencia actual (cantidad en el deposito elegido) por articleId, para mostrarla
  // en cada linea. Se recarga al cambiar de deposito o el conjunto de articulos.
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [pagos, setPagos] = useState<Record<string, string>>({});
  const [cuotasInput, setCuotasInput] = useState("");
  // Fecha de vencimiento de cada cuota (yyyy-mm-dd). Se regenera al cambiar el nro de
  // cuotas o la fecha de la venta; el usuario puede editar cada una.
  const [vencimientos, setVencimientos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [addWh, setAddWh] = useState(false);
  const [addCust, setAddCust] = useState(false);
  const [serialPickerArticle, setSerialPickerArticle] = useState<number | null>(null);
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const { searchRef, registerQty, focusQty, qtyTabToSearch } = useArticleRowFocus();
  const searchParams = useSearchParams();
  const prefilledRef = useRef(false);
  const puntoFocusedRef = useRef(false);

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
    // Puntos de expedicion activos: cada uno factura un rubro. El elegido limita
    // los articulos que se pueden vender a los de ese rubro.
    api<PuntoExpedicion[]>("/puntos-expedicion")
      .then((ps) => setPuntos(ps.filter((p) => p.activo)))
      .catch(() => setPuntos([]));
  }, [companyId]);

  // Precarga desde un presupuesto (?presupuesto=ID). Setea priceListId con lines
  // todavia vacio para que el recalculo no pise los precios del presupuesto.
  useEffect(() => {
    const pid = searchParams.get("presupuesto");
    if (!pid || prefilledRef.current || priceLists.length === 0) return;
    prefilledRef.current = true;
    (async () => {
      try {
        const q = await api<{
          priceListId: number | null;
          observacion: string | null;
          customer: Customer;
          items: Array<{ articleId: number; cantidad: string; precioUnitario: string }>;
        }>(`/presupuestos/${pid}`);
        setQuoteId(Number(pid));
        if (q.customer) setSelectedCustomer(q.customer);
        if (q.priceListId) setPriceListId(String(q.priceListId));
        setObservacion(q.observacion ?? "");
        const arts = await Promise.all(q.items.map((it) => api<Article>(`/articles/${it.articleId}`).catch(() => null)));
        const nuevas: Line[] = [];
        q.items.forEach((it, i) => {
          const a = arts[i];
          if (a) nuevas.push({ article: a, cantidad: String(Number(it.cantidad)), precioUnitario: String(Math.round(Number(it.precioUnitario))), series: [] });
        });
        setLines(nuevas);
        notify("success", "Presupuesto cargado: revisa, agrega forma de pago y confirma");
      } catch {
        notify("error", "No se pudo cargar el presupuesto");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, priceLists.length]);

  // Al cargar la pagina, el foco va al Punto de expedicion (rubro). Se espera a que los
  // puntos esten cargados (el Select puede ser nativo o combobox con buscador, ambos con
  // id="punto") y solo se hace una vez, sin pisar un presupuesto ya precargado.
  useEffect(() => {
    if (puntoFocusedRef.current || puntos.length === 0 || puntoId) return;
    puntoFocusedRef.current = true;
    document.getElementById("punto")?.focus();
  }, [puntos, puntoId]);

  const selectedList = useMemo(
    () => priceLists.find((l) => String(l.id) === priceListId),
    [priceLists, priceListId]
  );

  // Punto de expedicion elegido -> fija el rubro que se puede vender.
  const selectedPunto = useMemo(
    () => puntos.find((p) => String(p.id) === puntoId),
    [puntos, puntoId]
  );
  const rubroId = selectedPunto?.rubroId ?? null;

  // Al cambiar el punto (rubro), descarta las lineas que ya no correspondan.
  useEffect(() => {
    if (!rubroId) return;
    setLines((ls) => {
      const validas = ls.filter((l) => l.article.rubro?.id === rubroId);
      if (validas.length !== ls.length) {
        notify("success", "Se quitaron los articulos que no corresponden al punto de expedicion");
      }
      return validas;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubroId]);

  // Al cargar un presupuesto (lineas ya cargadas, sin punto elegido): si todas
  // comparten rubro y ese rubro tiene punto, lo autoselecciona.
  useEffect(() => {
    if (puntoId || lines.length === 0 || puntos.length === 0) return;
    const rubrosLinea = [...new Set(lines.map((l) => l.article.rubro?.id).filter(Boolean))];
    if (rubrosLinea.length === 1) {
      const p = puntos.find((x) => x.rubroId === rubrosLinea[0]);
      if (p) setPuntoId(String(p.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, puntos, puntoId]);

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

  // Las series pertenecen a un deposito: si se cambia, se limpian las elegidas.
  useEffect(() => {
    setLines((ls) => ls.map((l) => (l.article.controlaSerie ? { ...l, series: [], cantidad: "0" } : l)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  // Existencia en el deposito elegido para los articulos de las lineas. Se recalcula
  // al cambiar de deposito o el conjunto de articulos (no al editar cantidades).
  const lineArticleIds = useMemo(() => lines.map((l) => l.article.id).join(","), [lines]);
  useEffect(() => {
    if (!warehouseId) return setStockMap({});
    const ids = lineArticleIds ? lineArticleIds.split(",").map(Number) : [];
    if (ids.length === 0) return setStockMap({});
    let cancel = false;
    (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const rows = await api<Array<{ cantidad: string | number }>>(
              `/stock?warehouseId=${warehouseId}&articleId=${id}`
            );
            return [id, rows.reduce((s, r) => s + Number(r.cantidad), 0)] as const;
          } catch {
            return [id, 0] as const;
          }
        })
      );
      if (!cancel) setStockMap(Object.fromEntries(entries));
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, lineArticleIds]);

  async function addArticle(a: Article) {
    if (!selectedPunto) {
      notify("error", "Selecciona primero el punto de expedicion");
      return;
    }
    if (a.rubro?.id !== selectedPunto.rubroId) {
      notify(
        "error",
        `"${a.descripcion}" pertenece al rubro ${a.rubro?.nombre ?? "(sin rubro)"} y no corresponde al punto ${selectedPunto.codigo} (${selectedPunto.rubro?.nombre ?? "rubro"})`
      );
      return;
    }
    if (lines.some((l) => l.article.id === a.id)) {
      notify("error", "El articulo ya esta en la venta");
      return;
    }
    const precio = await resolvePrecio(a, priceListId);
    setLines((ls) => [...ls, { article: a, cantidad: a.controlaSerie ? "0" : "1", precioUnitario: precio, series: [] }]);
    // Los articulos con serie no tienen input de cantidad (se define por las series).
    if (!a.controlaSerie) focusQty(a.id);
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

  // La condicion es independiente de la lista (el usuario puede overridearla).
  const esCredito = condicion === "CREDITO";

  // Al cambiar de lista, propone su condicion (editable con el selector de abajo).
  useEffect(() => {
    if (selectedList) setCondicion(selectedList.condicion);
  }, [selectedList]);

  // Al pasar a credito, propone el nro de cuotas de la lista (editable). En contado se limpia.
  useEffect(() => {
    if (esCredito) setCuotasInput(String(selectedList?.cuotas || ""));
    else setCuotasInput("");
  }, [esCredito, selectedList]);

  function setPago(key: string, value: string) {
    setPagos((p) => ({ ...p, [key]: value }));
  }
  const pagosSum = METODOS.reduce((s, m) => s + (Number(pagos[m.key]) || 0), 0);
  const nCuotas = Number(cuotasInput) || 0;
  // En credito el pago es la entrega; el saldo se financia. En contado el pago = total.
  const saldoFinanciar = esCredito ? Math.max(0, totals.total - pagosSum) : 0;
  // La cuota "plena" se calcula sobre el total (no sobre el saldo financiado); la
  // entrega se imputa despues a las primeras cuotas.
  const cuotaAprox = esCredito && nCuotas > 0 ? Math.floor(totals.total / nCuotas) : 0;
  const faltaContado = totals.total - pagosSum; // >0 falta, <0 sobra (solo contado)

  // Regenera los vencimientos por defecto (fecha + i meses) al cambiar el nro de cuotas
  // o la fecha. Cualquier edicion manual se pierde al cambiar esos parametros (el
  // cronograma cambia). En contado se limpian.
  useEffect(() => {
    if (!esCredito || nCuotas < 1) {
      setVencimientos([]);
      return;
    }
    setVencimientos(Array.from({ length: nCuotas }, (_, i) => addMonthsStr(fecha, i + 1)));
  }, [esCredito, nCuotas, fecha]);

  // Edita el vencimiento de la cuota i. Si es la primera, re-basa todo el cronograma
  // (cuota 1 = fecha elegida, y cada cuota siguiente = esa fecha + N meses). El resto
  // de las cuotas solo cambian la propia.
  function setVencimiento(i: number, value: string) {
    setVencimientos((vs) =>
      i === 0 && value
        ? vs.map((_, j) => addMonthsStr(value, j))
        : vs.map((x, j) => (j === i ? value : x))
    );
  }

  // Cronograma de cuotas (espejo del backend): las cuotas se calculan sobre el TOTAL y
  // la entrega se imputa de la primera cuota en adelante (cancela las primeras y amortiza
  // parcialmente la siguiente). Cada cuota expone su monto, lo imputado, el saldo y estado.
  const cronograma = useMemo(() => {
    if (!esCredito || nCuotas < 1) return [];
    const base = Math.floor(totals.total / nCuotas);
    let entregaRest = pagosSum;
    return Array.from({ length: nCuotas }, (_, idx) => {
      const i = idx + 1;
      const montoCuota = i < nCuotas ? base : totals.total - base * (nCuotas - 1);
      const pagado = Math.min(entregaRest, montoCuota);
      entregaRest -= pagado;
      const saldo = montoCuota - pagado;
      const estado: "PAGADA" | "PARCIAL" | "PENDIENTE" =
        pagado >= montoCuota ? "PAGADA" : pagado > 0 ? "PARCIAL" : "PENDIENTE";
      return { montoCuota, pagado, saldo, estado };
    });
  }, [esCredito, nCuotas, totals.total, pagosSum]);

  async function confirm() {
    if (!selectedPunto) {
      document.getElementById("punto")?.focus();
      return notify("error", "Selecciona el punto de expedicion");
    }
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
      if (saldoFinanciar > 0 && vencimientos.some((v) => !v)) {
        return notify("error", "Completa la fecha de vencimiento de todas las cuotas");
      }
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
            ...(l.article.controlaSerie ? { series: l.series } : {}),
          })),
          condicion,
          ...(esCredito ? { cuotas: nCuotas, vencimientos } : {}),
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
      // Imprime automaticamente sin pasar por el listado. El comprobante + pagare +
      // garantia salen juntos en A4 (/print/completo, un solo trabajo). El recibo de dinero
      // se abre en una pestaña APARTE como ticket 80mm (/print/recibo) para poder mandarlo
      // a la impresora termica. Abrir 2 pestañas requiere permitir las ventanas emergentes
      // del sitio en el navegador (ver aviso al usuario); si estan bloqueadas, el navegador
      // avisa con el icono de popup bloqueado en la barra de direcciones.
      const ids = invoices.map((inv) => inv.id).join(",");
      window.open(`/print/completo?ids=${ids}`, "_blank");
      // Recibo(s) de entrega inicial en ticket 80mm, uno por comprobante que la tenga.
      if (esCredito && pagosSum > 0) {
        invoices
          .filter((inv) => Number(inv.entregaInicial) > 0)
          .forEach((inv) => window.open(`/print/recibo/${inv.id}`, "_blank"));
      }
      if (quoteId) {
        try { await api(`/presupuestos/${quoteId}/convertir`, { method: "POST" }); } catch { /* noop */ }
        setQuoteId(null);
      }
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
          <Field label="Punto de expedicion (rubro)" htmlFor="punto" required>
            <Select id="punto" value={puntoId} onChange={(e) => setPuntoId(e.target.value)}>
              <option value="">-- Selecciona un punto --</option>
              {puntos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.timbrado?.establecimiento ?? "001"}-{p.codigo} · {p.rubro?.nombre ?? "sin rubro"}
                </option>
              ))}
            </Select>
          </Field>
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
          <Field label="Condicion de pago" htmlFor="condicion" required>
            <Select id="condicion" value={condicion} onChange={(e) => setCondicion(e.target.value as CondicionPago)}>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Credito</option>
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
          <ArticleAutocomplete
            onSelect={addArticle}
            inputRef={searchRef}
            rubroId={rubroId}
            disabled={!selectedPunto}
            placeholder={
              selectedPunto
                ? `Buscar articulo del rubro ${selectedPunto.rubro?.nombre ?? ""}...`
                : "Selecciona primero el punto de expedicion"
            }
          />
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
                  <tr key={l.article.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2">
                      <div className="text-foreground">{l.article.descripcion}</div>
                      <div className="font-mono text-xs text-slate-500">{l.article.codigo}</div>
                      {warehouseId && (
                        <div className="text-xs">
                          {stockMap[l.article.id] == null ? (
                            <span className="text-slate-400">Stock: …</span>
                          ) : (
                            <span
                              className={
                                Number(l.cantidad) > stockMap[l.article.id]
                                  ? "font-medium text-destructive"
                                  : "text-slate-500"
                              }
                            >
                              Stock: {formatGs(stockMap[l.article.id])}
                            </span>
                          )}
                        </div>
                      )}
                      {l.article.controlaSerie && (
                        <button
                          type="button"
                          onClick={() => setSerialPickerArticle(l.article.id)}
                          className="mt-1 cursor-pointer text-xs font-medium text-primary hover:underline"
                        >
                          {l.series.length > 0 ? `Series: ${l.series.length} elegida(s)` : "Elegir series / IMEI"}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{l.article.rubro?.nombre ?? <span className="text-destructive">sin rubro</span>}</td>
                    <td className="px-3 py-2 text-right">
                      {l.article.controlaSerie ? (
                        <span className="inline-block w-20 rounded-lg bg-muted px-2 py-1 text-right text-sm text-slate-600">
                          {l.cantidad}
                        </span>
                      ) : (
                        <input type="number" min={0} value={l.cantidad}
                          ref={registerQty(l.article.id)}
                          onKeyDown={qtyTabToSearch}
                          onChange={(e) => updateLine(l.article.id, { cantidad: e.target.value })}
                          className="w-20 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      )}
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
            {selectedPunto && lines.length > 0 && (
              <p className="rounded-lg bg-muted px-3 py-2 text-secondary">
                Se emitira 1 comprobante en el punto{" "}
                <span className="font-mono font-semibold">
                  {selectedPunto.timbrado?.establecimiento ?? "001"}-{selectedPunto.codigo}
                </span>{" "}
                (rubro {selectedPunto.rubro?.nombre ?? "-"}).
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

            {/* Cronograma de cuotas: vencimiento editable por cuota */}
            {esCredito && nCuotas > 0 && saldoFinanciar > 0 && vencimientos.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <h3 className="mb-2 text-sm font-semibold text-secondary">Vencimiento de las cuotas</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {vencimientos.map((v, i) => {
                    const c = cronograma[i];
                    const pagada = c?.estado === "PAGADA";
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                          pagada ? "border-border bg-muted/40" : "border-border bg-white"
                        }`}
                      >
                        <span className="w-16 shrink-0 text-xs font-medium text-slate-500">Cuota {i + 1}</span>
                        <input
                          type="date"
                          value={v}
                          onChange={(e) => setVencimiento(i, e.target.value)}
                          disabled={pagada}
                          className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-slate-400"
                        />
                        <span className="flex shrink-0 flex-col items-end leading-tight">
                          <span
                            className={`font-mono text-xs font-medium ${pagada ? "text-slate-400 line-through" : "text-foreground"}`}
                          >
                            {formatGs(c?.saldo ?? 0)}
                          </span>
                          {c && c.estado !== "PENDIENTE" && (
                            <span className={`text-[10px] font-semibold ${pagada ? "text-emerald-600" : "text-amber-600"}`}>
                              {pagada ? "Pagada" : "Parcial"}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

      {serialPickerArticle != null &&
        (() => {
          const line = lines.find((l) => l.article.id === serialPickerArticle);
          if (!line) return null;
          return (
            <SerialPicker
              open
              onClose={() => setSerialPickerArticle(null)}
              articleId={serialPickerArticle}
              warehouseId={warehouseId ? Number(warehouseId) : null}
              selected={line.series}
              onConfirm={(series) =>
                updateLine(serialPickerArticle, { series, cantidad: String(series.length) })
              }
            />
          );
        })()}

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

export default function NuevaVentaPage() {
  return (
    <Suspense fallback={<p className="text-slate-400">Cargando...</p>}>
      <NuevaVentaInner />
    </Suspense>
  );
}
