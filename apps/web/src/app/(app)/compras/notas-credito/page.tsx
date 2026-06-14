"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import type { CreditablePurchase, PurchaseInvoice, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useToast } from "@/components/ui/Toast";
import { Search } from "lucide-react";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

type Modo = "articulos" | "monto";
interface SelItem {
  cantidad: string;
  costo: string;
}

export default function NotaCreditoCompraPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<PurchaseInvoice[]>([]);
  const [buscando, setBuscando] = useState(false);

  const [data, setData] = useState<CreditablePurchase | null>(null);
  const [modo, setModo] = useState<Modo>("articulos");
  const [sel, setSel] = useState<Record<number, SelItem>>({});
  const [montoManual, setMontoManual] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [nroComprobante, setNroComprobante] = useState("");
  const [fecha, setFecha] = useState(today());
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Warehouse[]>("/warehouses")
      .then((ws) => {
        setWarehouses(ws);
        if (ws.length) setWarehouseId((p) => p || String(ws[0].id));
      })
      .catch(() => setWarehouses([]));
  }, [companyId]);

  useEffect(() => {
    if (!q.trim()) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        setResultados(await api<PurchaseInvoice[]>(`/purchases?q=${encodeURIComponent(q.trim())}`));
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function elegirCompra(inv: PurchaseInvoice) {
    setQ("");
    setResultados([]);
    setSel({});
    setMontoManual("");
    setMotivo("");
    setNroComprobante("");
    try {
      setData(await api<CreditablePurchase>(`/notas-credito-compra/creditable?invoiceId=${inv.id}`));
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo cargar la compra");
    }
  }

  function toggle(articleId: number, restante: number, costo: string) {
    setSel((s) => {
      const next = { ...s };
      if (articleId in next) delete next[articleId];
      else next[articleId] = { cantidad: String(restante), costo: String(Math.round(Number(costo))) };
      return next;
    });
  }
  function setItem(articleId: number, patch: Partial<SelItem>) {
    setSel((s) => ({ ...s, [articleId]: { ...s[articleId], ...patch } }));
  }

  const totalArticulos = useMemo(
    () => Object.values(sel).reduce((acc, it) => acc + Math.round((Number(it.cantidad) || 0) * (Number(it.costo) || 0)), 0),
    [sel]
  );
  const total = modo === "articulos" ? totalArticulos : Number(montoManual) || 0;

  async function confirmar() {
    if (!data) return notify("error", "Selecciona una compra");
    if (!nroComprobante.trim()) return notify("error", "Ingresa el nro de la NC del proveedor");

    if (modo === "articulos") {
      const items = Object.entries(sel)
        .map(([articleId, it]) => ({ articleId: Number(articleId), cantidad: Number(it.cantidad) || 0, costoUnitario: Number(it.costo) || 0 }))
        .filter((i) => i.cantidad > 0);
      if (items.length === 0) return notify("error", "Selecciona al menos un articulo a devolver");
      for (const i of items) {
        const it = data.items.find((x) => x.articleId === i.articleId);
        if (it && i.cantidad > it.restante) return notify("error", `No se puede devolver mas de lo comprado de ${it.codigo}`);
      }
      if (!warehouseId) return notify("error", "Selecciona el deposito de egreso");
      await enviar({ invoiceId: data.invoice.id, nroComprobante: nroComprobante.trim(), fecha, motivo: motivo.trim() || null, warehouseId: Number(warehouseId), items });
    } else {
      const monto = Number(montoManual) || 0;
      if (monto <= 0) return notify("error", "Ingresa el monto de la nota de credito");
      if (!motivo.trim()) return notify("error", "Indica el motivo de la nota de credito");
      if (monto > data.creditableRestante) return notify("error", `El monto supera lo acreditable (${formatGs(data.creditableRestante)} Gs)`);
      await enviar({ invoiceId: data.invoice.id, nroComprobante: nroComprobante.trim(), fecha, motivo: motivo.trim(), montoManual: monto });
    }
  }

  async function enviar(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await api("/notas-credito-compra", { method: "POST", body: JSON.stringify(body) });
      notify("success", `Nota de credito ${nroComprobante.trim()} registrada por ${formatGs(total)} Gs`);
      const d = await api<CreditablePurchase>(`/notas-credito-compra/creditable?invoiceId=${data!.invoice.id}`);
      setData(d);
      setSel({});
      setMontoManual("");
      setMotivo("");
      setNroComprobante("");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al registrar la nota de credito");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Nota de credito / devolucion (compra)</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">COMI002</span>
        </div>
        <p className="text-sm text-slate-500">
          Acredita una compra: devolves articulos (egreso de stock) o una NC por monto. Ajusta la cuenta del proveedor.
        </p>
      </div>

      {/* Buscar compra */}
      <div className="relative mb-5 max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Buscar compra por comprobante o proveedor..." value={q} onChange={(e) => setQ(e.target.value)} />
        {q.trim() && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-lg">
            {buscando && resultados.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">Buscando...</li>
            ) : resultados.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">Sin resultados.</li>
            ) : (
              resultados.map((inv) => (
                <li key={inv.id}
                  onMouseDown={(e) => { e.preventDefault(); elegirCompra(inv); }}
                  className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent/10">
                  <span className="font-mono text-xs text-secondary">{inv.nroComprobante}</span>
                  <span className="truncate text-foreground">{inv.supplier?.person.razonSocial}</span>
                  <span className="font-mono text-xs text-slate-400">{formatGs(inv.total)}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {!data ? (
        <p className="text-slate-400">Busca y selecciona la compra a acreditar.</p>
      ) : (
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          {/* Cabecera compra */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="font-mono text-sm font-semibold text-secondary">{data.invoice.nroComprobante}</div>
              <div className="text-sm text-foreground">{data.invoice.proveedor}</div>
              <div className="text-xs text-slate-400">{fmtFecha(data.invoice.fecha)} · {data.invoice.condicion === "CREDITO" ? "Credito" : "Contado"}</div>
            </div>
            <div className="text-right text-sm">
              <div className="text-slate-500">Total compra: <span className="font-mono text-foreground">{formatGs(data.invoice.total)}</span></div>
              <div className="text-slate-500">Ya acreditado: <span className="font-mono text-foreground">{formatGs(data.creditadoTotal)}</span></div>
              <div className="font-medium text-slate-600">Acreditable: <span className="font-mono">{formatGs(data.creditableRestante)}</span></div>
            </div>
          </div>

          {/* Toggle modo */}
          <div className="mb-4 inline-flex rounded-lg border border-border p-1">
            <button type="button" onClick={() => setModo("articulos")}
              className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${modo === "articulos" ? "bg-primary text-white" : "text-slate-500 hover:text-foreground"}`}>
              Devolver articulos
            </button>
            <button type="button" onClick={() => setModo("monto")}
              className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${modo === "monto" ? "bg-primary text-white" : "text-slate-500 hover:text-foreground"}`}>
              NC por monto
            </button>
          </div>

          {modo === "articulos" ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium" />
                      <th className="px-3 py-2 font-medium">Articulo</th>
                      <th className="px-3 py-2 text-center font-medium">IVA</th>
                      <th className="px-3 py-2 text-center font-medium">Comprado</th>
                      <th className="px-3 py-2 text-center font-medium">Acred.</th>
                      <th className="px-3 py-2 text-center font-medium">Restante</th>
                      <th className="px-3 py-2 text-right font-medium">Cant. a devolver</th>
                      <th className="px-3 py-2 text-right font-medium">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it) => {
                      const selected = it.articleId in sel;
                      const sinSaldo = it.restante <= 0;
                      return (
                        <tr key={it.articleId} className={`border-b border-border last:border-0 ${selected ? "bg-accent/5" : ""}`}>
                          <td className="px-3 py-2">
                            <input type="checkbox" disabled={sinSaldo} checked={selected}
                              onChange={() => toggle(it.articleId, it.restante, it.costoUnitario)}
                              className="h-4 w-4 cursor-pointer accent-accent disabled:opacity-40" />
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-foreground">{it.descripcion}</div>
                            <div className="font-mono text-xs text-slate-400">{it.codigo}</div>
                          </td>
                          <td className="px-3 py-2 text-center text-slate-500">{IVA_LABEL[it.ivaTipo]}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{it.comprado}</td>
                          <td className="px-3 py-2 text-center text-slate-400">{it.acreditado}</td>
                          <td className="px-3 py-2 text-center font-medium text-foreground">{it.restante}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" min={0} max={it.restante} disabled={!selected}
                              value={selected ? sel[it.articleId].cantidad : ""}
                              onChange={(e) => setItem(it.articleId, { cantidad: e.target.value })}
                              className="w-20 rounded-lg border border-border px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="ml-auto w-28">
                              <MoneyInput value={selected ? sel[it.articleId].costo : ""} onChange={(v) => setItem(it.articleId, { costo: v })} disabled={!selected} placeholder="0" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 max-w-xs">
                <Field label="Deposito de egreso" htmlFor="dep" required>
                  <Select id="dep" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.codigo} - {w.nombre}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </>
          ) : (
            <div className="max-w-xs">
              <Field label="Monto de la nota de credito" htmlFor="monto" required>
                <MoneyInput id="monto" value={montoManual} onChange={setMontoManual} placeholder="0" />
              </Field>
            </div>
          )}

          {/* Pie */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Nro NC proveedor" htmlFor="nro" required>
              <Input id="nro" value={nroComprobante} onChange={(e) => setNroComprobante(e.target.value)} placeholder="001-001-0000123" />
            </Field>
            <Field label="Fecha" htmlFor="fecha" required>
              <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label={`Motivo ${modo === "monto" ? "(requerido)" : "(opcional)"}`} htmlFor="motivo">
              <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ej devolucion por falla" />
            </Field>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <div className="text-sm text-secondary">
              Total NC: <span className="font-mono text-base font-semibold text-foreground">{formatGs(total)} Gs</span>
            </div>
            <Button onClick={confirmar} loading={saving} disabled={total <= 0}>
              Registrar nota de credito
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
