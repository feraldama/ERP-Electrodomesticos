"use client";

import { useEffect, useState } from "react";
import { formatGs } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export interface CuotaCompra {
  fechaVencimiento: string; // YYYY-MM-DD
  monto: number;
}

interface PurchaseCreditModalProps {
  open: boolean;
  onClose: () => void;
  /** Total de la compra: lo que deben sumar las cuotas. */
  total: number;
  /** Fecha de la compra: base de los vencimientos. */
  fecha: string;
  /** Condicion ya cargada (para editarla). */
  initial: CuotaCompra[];
  onSave: (cuotas: CuotaCompra[]) => void;
}

/** "2026-10-29" + 30 -> "2026-11-28" (aritmetica en UTC: sin saltos por horario). */
function sumarDias(ymd: string, dias: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const fmtFecha = (ymd: string) => ymd.split("-").reverse().join("/");

// Cronograma: cuotas iguales (el redondeo se ajusta en la ultima), cada `dias` dias.
function generar(total: number, n: number, primerVto: string, dias: number) {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    fecha: sumarDias(primerVto, i * dias),
    monto: String(i === n - 1 ? total - base * (n - 1) : base),
  }));
}

// Condicion de pago de una compra a credito: cantidad de cuotas, vencimientos y montos.
export function PurchaseCreditModal({ open, onClose, total, fecha, initial, onSave }: PurchaseCreditModalProps) {
  const { notify } = useToast();
  const [cuotas, setCuotas] = useState("1");
  const [primerVto, setPrimerVto] = useState("");
  const [dias, setDias] = useState("30");
  const [filas, setFilas] = useState<Array<{ fecha: string; monto: string }>>([]);

  useEffect(() => {
    if (!open) return;
    if (initial.length) {
      setCuotas(String(initial.length));
      setPrimerVto(initial[0].fechaVencimiento);
      setFilas(initial.map((c) => ({ fecha: c.fechaVencimiento, monto: String(c.monto) })));
    } else {
      const vto = sumarDias(fecha, 30);
      setCuotas("1");
      setDias("30");
      setPrimerVto(vto);
      setFilas(generar(total, 1, vto, 30));
    }
  }, [open, initial, fecha, total]);

  // Cambiar cuotas, primer vencimiento o intervalo regenera el cronograma.
  function regenerar(next: { cuotas?: string; primerVto?: string; dias?: string }) {
    const c = next.cuotas ?? cuotas;
    const p = next.primerVto ?? primerVto;
    const d = next.dias ?? dias;
    if (next.cuotas !== undefined) setCuotas(c);
    if (next.primerVto !== undefined) setPrimerVto(p);
    if (next.dias !== undefined) setDias(d);
    const n = Number(c);
    if (n >= 1 && n <= 60 && p) setFilas(generar(total, n, p, Number(d) || 30));
  }

  const suma = filas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const diferencia = total - suma;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!filas.length) return notify("error", "Indica la cantidad de cuotas");
    if (filas.some((f) => !f.fecha)) return notify("error", "Completa la fecha de vencimiento de todas las cuotas");
    if (filas.some((f) => f.fecha < fecha)) return notify("error", "Un vencimiento no puede ser anterior a la fecha de la compra");
    if (filas.some((f) => !(Number(f.monto) > 0))) return notify("error", "Todas las cuotas deben tener monto");
    if (diferencia !== 0) return notify("error", "Las cuotas deben sumar el total de la compra");
    onSave(filas.map((f) => ({ fechaVencimiento: f.fecha, monto: Number(f.monto) })));
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Condicion de pago (credito)"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
          <Button form="purchase-credit-form" type="submit">Aplicar</Button>
        </>
      }
    >
      <form id="purchase-credit-form" onSubmit={guardar} className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-secondary">Total a financiar</span>
          <span className="font-mono font-semibold text-foreground">{formatGs(total)} Gs</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Cantidad de cuotas" htmlFor="cr-cuotas" required>
            <Input id="cr-cuotas" type="number" min={1} max={60} value={cuotas}
              onChange={(e) => regenerar({ cuotas: e.target.value })} className="text-right" />
          </Field>
          <Field label="Primer vencimiento" htmlFor="cr-vto" required>
            <Input id="cr-vto" type="date" value={primerVto} min={fecha}
              onChange={(e) => regenerar({ primerVto: e.target.value })} />
          </Field>
          <Field label="Dias entre cuotas" htmlFor="cr-dias">
            <Input id="cr-dias" type="number" min={1} value={dias} disabled={Number(cuotas) < 2}
              onChange={(e) => regenerar({ dias: e.target.value })} className="text-right" />
          </Field>
        </div>

        {filas.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-20 px-3 py-2 font-medium">Cuota</th>
                  <th className="px-3 py-2 font-medium">Vencimiento</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 font-mono text-slate-500">{i + 1}/{filas.length}</td>
                    <td className="px-3 py-1.5">
                      <Input type="date" value={f.fecha} min={fecha} aria-label={`Vencimiento cuota ${i + 1}`}
                        onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))}
                        className="h-8 max-w-44 px-2 py-1" />
                    </td>
                    <td className="px-3 py-1.5">
                      <MoneyInput value={f.monto} aria-label={`Monto cuota ${i + 1}`}
                        onChange={(v) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, monto: v } : x)))}
                        className="ml-auto h-8 w-36 px-2 py-1 text-right" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-secondary">
                {filas.length} cuota{filas.length > 1 ? "s" : ""} · ultimo vencimiento {fmtFecha(filas[filas.length - 1].fecha || primerVto)}
              </span>
              <span className={cn("font-mono font-semibold", diferencia === 0 ? "text-foreground" : "text-destructive")}>
                {formatGs(suma)} Gs
                {diferencia !== 0 && (
                  <span className="ml-2 text-xs font-medium">({diferencia > 0 ? "falta" : "sobra"} {formatGs(Math.abs(diferencia))})</span>
                )}
              </span>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
