"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatGs } from "@/lib/format";
import type { MedioPago, Supplier, SupplierAccount } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { PersonFormModal } from "@/components/PersonFormModal";
import { SupplierPicker } from "@/components/SupplierPicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useToast } from "@/components/ui/Toast";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

// El pago a proveedor admite cheque (emitido, diferido); los cobros NO, por eso es local.
type MetodoPago = MedioPago | "CHEQUE";
const MEDIOS: Array<{ value: MetodoPago; label: string }> = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA_DEBITO", label: "Tarjeta debito" },
  { value: "TARJETA_CREDITO", label: "Tarjeta credito" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "CHEQUE", label: "Cheque" },
];

export default function PagoProveedoresPage() {
  const { notify } = useToast();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const supplierId = selectedSupplier ? String(selectedSupplier.id) : "";
  const [account, setAccount] = useState<SupplierAccount | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("EFECTIVO");
  const [fecha, setFecha] = useState(today());
  const [observacion, setObservacion] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addSup, setAddSup] = useState(false);
  // Datos del cheque (solo cuando metodo === "CHEQUE")
  const [banco, setBanco] = useState("");
  const [chequeNumero, setChequeNumero] = useState("");
  const [chequeFecha, setChequeFecha] = useState("");

  function loadAccount(id: string) {
    if (!id) {
      setAccount(null);
      return;
    }
    setLoading(true);
    api<SupplierAccount>(`/cuenta-proveedor?supplierId=${id}`)
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAccount(supplierId);
    setMonto("");
  }, [supplierId]);

  const saldo = account?.resumen.saldo ?? 0;
  const montoNum = Number(monto) || 0;

  async function confirmar() {
    if (!supplierId) return notify("error", "Selecciona un proveedor");
    if (montoNum <= 0) return notify("error", "Ingresa el monto a pagar");
    if (metodo === "CHEQUE") {
      if (!chequeNumero.trim()) return notify("error", "Indica el numero de cheque");
      if (!chequeFecha) return notify("error", "Indica la fecha de cobro del cheque");
    }

    setSaving(true);
    try {
      await api("/pagos", {
        method: "POST",
        body: JSON.stringify({
          supplierId: Number(supplierId),
          fecha,
          metodo,
          monto: montoNum,
          observacion: observacion.trim() || null,
          ...(metodo === "CHEQUE"
            ? { cheque: { banco: banco.trim() || null, numero: chequeNumero.trim(), fechaCobro: chequeFecha } }
            : {}),
        }),
      });
      notify("success", `Pago registrado: ${formatGs(montoNum)} Gs`);
      setMonto("");
      setObservacion("");
      setBanco("");
      setChequeNumero("");
      setChequeFecha("");
      loadAccount(supplierId);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al registrar el pago");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Pago a proveedores</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">FINI006</span>
        </div>
        <p className="text-sm text-slate-500">Registra un pago a cuenta del saldo del proveedor.</p>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <Field label="Proveedor" htmlFor="prov" required className="mb-4">
          <SupplierPicker id="prov" selected={selectedSupplier} onSelect={setSelectedSupplier} onAdd={() => setAddSup(true)} />
        </Field>

        {supplierId && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-sm text-secondary">Saldo a pagar</span>
            <span className="font-mono text-lg font-semibold text-primary">
              {loading ? "..." : `${formatGs(saldo)} Gs`}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Monto a pagar" htmlFor="monto" required>
            <MoneyInput id="monto" value={monto} onChange={setMonto} placeholder="0" />
            {saldo > 0 && (
              <button
                type="button"
                onClick={() => setMonto(String(Math.round(saldo)))}
                className="mt-1 cursor-pointer text-xs font-medium text-primary hover:underline"
              >
                Pagar saldo total
              </button>
            )}
          </Field>
          <Field label="Medio de pago" htmlFor="met">
            <Select id="met" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
              {MEDIOS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha" htmlFor="fecha" required>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>

          {/* Datos del cheque (solo si el medio es Cheque) */}
          {metodo === "CHEQUE" && (
            <>
              <Field label="Banco" htmlFor="banco">
                <Input id="banco" value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="ej Itau" />
              </Field>
              <Field label="Nro de cheque" htmlFor="chnum" required>
                <Input id="chnum" value={chequeNumero} onChange={(e) => setChequeNumero(e.target.value)} />
              </Field>
              <Field label="Fecha de cobro" htmlFor="chfec" required>
                <Input id="chfec" type="date" value={chequeFecha} onChange={(e) => setChequeFecha(e.target.value)} />
              </Field>
            </>
          )}

          <Field label="Observacion" htmlFor="obs" className="sm:col-span-3">
            <Input id="obs" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        {montoNum > saldo && saldo > 0 && (
          <p className="mt-3 text-xs text-amber-600">El monto supera el saldo: quedara un saldo a favor de {formatGs(montoNum - saldo)} Gs.</p>
        )}

        <div className="mt-5 flex justify-end">
          <Button onClick={confirmar} loading={saving} disabled={montoNum <= 0}>
            Registrar pago
          </Button>
        </div>
      </div>

      {/* Compras a credito (referencia) */}
      {account && account.compras.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-secondary">Compras a credito del proveedor</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Comprobante</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {account.compras.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-secondary">{c.nroComprobante}</td>
                    <td className="px-4 py-2 text-slate-600">{fmtFecha(c.fecha)}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{formatGs(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
