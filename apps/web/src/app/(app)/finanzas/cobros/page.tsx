"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatGs } from "@/lib/format";
import type { Customer, MedioPago, PendingInstallment } from "@/lib/types";
import { MEDIO_PAGO_LABEL } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { PersonFormModal } from "@/components/PersonFormModal";
import { CustomerPicker } from "@/components/CustomerPicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useToast } from "@/components/ui/Toast";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}
function nroComp(i: PendingInstallment["invoice"]) {
  return `${i.establecimiento}-${i.puntoExpedicion}-${i.numero}`;
}
function saldoDe(c: PendingInstallment) {
  return Math.round(Number(c.montoCuota) - Number(c.montoPagado));
}

const MEDIOS: MedioPago[] = ["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"];

export default function CobroCuotasPage() {
  const { notify } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const customerId = selectedCustomer ? String(selectedCustomer.id) : "";
  const [cuotas, setCuotas] = useState<PendingInstallment[]>([]);
  const [montos, setMontos] = useState<Record<number, string>>({});
  const [metodo, setMetodo] = useState<MedioPago>("EFECTIVO");
  const [fecha, setFecha] = useState(today());
  const [observacion, setObservacion] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addCust, setAddCust] = useState(false);

  const loadPending = useCallback(async (cid: string) => {
    if (!cid) {
      setCuotas([]);
      return;
    }
    setLoading(true);
    try {
      setCuotas(await api<PendingInstallment[]>(`/cobros/pending?customerId=${cid}`));
      setMontos({});
    } catch {
      setCuotas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending(customerId);
  }, [customerId, loadPending]);

  const hoy = today();

  function toggle(c: PendingInstallment) {
    setMontos((m) => {
      const next = { ...m };
      if (c.id in next) delete next[c.id];
      else next[c.id] = String(saldoDe(c));
      return next;
    });
  }
  function setMonto(id: number, value: string) {
    setMontos((m) => ({ ...m, [id]: value }));
  }
  function seleccionarTodas() {
    setMontos(Object.fromEntries(cuotas.map((c) => [c.id, String(saldoDe(c))])));
  }
  function limpiar() {
    setMontos({});
  }

  const totalCobrar = useMemo(
    () => Object.values(montos).reduce((s, v) => s + (Number(v) || 0), 0),
    [montos]
  );

  async function confirmar() {
    if (!customerId) return notify("error", "Selecciona un cliente");
    const allocations = Object.entries(montos)
      .map(([id, v]) => ({ installmentId: Number(id), monto: Number(v) || 0 }))
      .filter((a) => a.monto > 0);
    if (allocations.length === 0) return notify("error", "Selecciona al menos una cuota a cobrar");

    // Validacion de saldos (el backend tambien valida)
    for (const a of allocations) {
      const c = cuotas.find((x) => x.id === a.installmentId);
      if (c && a.monto > saldoDe(c)) {
        return notify("error", `El monto de la cuota ${c.nroCuota} supera su saldo`);
      }
    }

    setSaving(true);
    try {
      await api("/cobros", {
        method: "POST",
        body: JSON.stringify({
          customerId: Number(customerId),
          fecha,
          metodo,
          observacion: observacion.trim() || null,
          allocations,
        }),
      });
      notify("success", `Cobro registrado: ${formatGs(totalCobrar)} Gs`);
      setObservacion("");
      loadPending(customerId);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al registrar el cobro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Cobro de cuotas</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">FINI005</span>
        </div>
        <p className="text-sm text-slate-500">
          Registra un cobro de un cliente y aplicalo a sus cuotas pendientes.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cliente" htmlFor="cli" required className="lg:col-span-2">
            <CustomerPicker id="cli" selected={selectedCustomer} onSelect={setSelectedCustomer} onAdd={() => setAddCust(true)} />
          </Field>
          <Field label="Medio de pago" htmlFor="met">
            <Select id="met" value={metodo} onChange={(e) => setMetodo(e.target.value as MedioPago)}>
              {MEDIOS.map((m) => (
                <option key={m} value={m}>{MEDIO_PAGO_LABEL[m]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha" htmlFor="fecha" required>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Observacion" htmlFor="obs" className="lg:col-span-4">
            <Input id="obs" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        {/* Cuotas pendientes */}
        <div className="mt-5 mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-secondary">Cuotas pendientes</h2>
          {cuotas.length > 0 && (
            <div className="flex gap-3 text-xs font-medium">
              <button type="button" onClick={seleccionarTodas} className="cursor-pointer text-primary hover:underline">Seleccionar todas</button>
              <button type="button" onClick={limpiar} className="cursor-pointer text-slate-400 hover:underline">Limpiar</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium" />
                <th className="px-3 py-2 font-medium">Comprobante</th>
                <th className="px-3 py-2 text-center font-medium">Cuota</th>
                <th className="px-3 py-2 font-medium">Vencimiento</th>
                <th className="px-3 py-2 text-right font-medium">Monto</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 text-right font-medium">A cobrar</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Cargando...</td></tr>
              ) : !customerId ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Selecciona un cliente para ver sus cuotas.</td></tr>
              ) : cuotas.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Este cliente no tiene cuotas pendientes.</td></tr>
              ) : (
                cuotas.map((c) => {
                  const sel = c.id in montos;
                  const vencida = c.fechaVencimiento.slice(0, 10) < hoy;
                  return (
                    <tr key={c.id} className={`border-b border-border last:border-0 ${sel ? "bg-accent/5" : ""}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={sel} onChange={() => toggle(c)} className="h-4 w-4 cursor-pointer accent-accent" />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-secondary">{nroComp(c.invoice)}</td>
                      <td className="px-3 py-2 text-center">{c.nroCuota}</td>
                      <td className="px-3 py-2">
                        <span className={vencida ? "font-medium text-destructive" : "text-slate-600"}>{fmtFecha(c.fechaVencimiento)}</span>
                        {vencida && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-destructive">vencida</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">{formatGs(c.montoCuota)}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-foreground">{formatGs(saldoDe(c))}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="w-32 ml-auto">
                          <MoneyInput value={sel ? montos[c.id] : ""} onChange={(v) => setMonto(c.id, v)} placeholder="0" disabled={!sel} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm text-secondary">
            Total a cobrar: <span className="font-mono text-base font-semibold text-foreground">{formatGs(totalCobrar)} Gs</span>
          </div>
          <Button onClick={confirmar} loading={saving} disabled={totalCobrar <= 0}>
            Registrar cobro
          </Button>
        </div>
      </div>

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
