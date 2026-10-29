"use client";

import { useEffect, useState } from "react";
import { formatGs } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export type MedioPagoCompra = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE";

export interface PagoCompra {
  medio: MedioPagoCompra;
  monto: number;
  banco?: string;
  referencia?: string; // nro de transferencia o de cheque
  fechaCobro?: string; // cheque, YYYY-MM-DD
}

export const MEDIO_COMPRA_LABEL: Record<MedioPagoCompra, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  CHEQUE: "Cheque",
};

interface PurchasePaymentModalProps {
  /** Medio a cargar; null = cerrado. */
  medio: MedioPagoCompra | null;
  onClose: () => void;
  /** Lo que falta pagar: monto propuesto. */
  pendiente: number;
  /** Fecha de la compra: fecha de cobro propuesta para el cheque. */
  fecha: string;
  onSave: (p: PagoCompra) => void;
}

// Carga un pago de una compra contado con un medio (efectivo, transferencia o cheque).
export function PurchasePaymentModal({ medio, onClose, pendiente, fecha, onSave }: PurchasePaymentModalProps) {
  const { notify } = useToast();
  const [monto, setMonto] = useState("");
  const [banco, setBanco] = useState("");
  const [referencia, setReferencia] = useState("");
  const [fechaCobro, setFechaCobro] = useState("");

  useEffect(() => {
    if (!medio) return;
    setMonto(pendiente > 0 ? String(pendiente) : "");
    setBanco("");
    setReferencia("");
    setFechaCobro(fecha);
  }, [medio, pendiente, fecha]);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!medio) return;
    const m = Number(monto) || 0;
    if (m <= 0) return notify("error", "Indica el monto");
    if (medio === "CHEQUE") {
      if (!referencia.trim()) return notify("error", "Indica el numero de cheque");
      if (!fechaCobro) return notify("error", "Indica la fecha de cobro del cheque");
      if (fechaCobro < fecha) return notify("error", "La fecha de cobro no puede ser anterior a la de la compra");
    }
    onSave({
      medio,
      monto: m,
      ...(medio !== "EFECTIVO" ? { banco: banco.trim(), referencia: referencia.trim() } : {}),
      ...(medio === "CHEQUE" ? { fechaCobro } : {}),
    });
    onClose();
  }

  return (
    <Modal
      open={!!medio}
      onClose={onClose}
      title={medio ? `Pago con ${MEDIO_COMPRA_LABEL[medio].toLowerCase()}` : ""}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
          <Button form="purchase-payment-form" type="submit">Agregar pago</Button>
        </>
      }
    >
      <form id="purchase-payment-form" onSubmit={guardar} className="space-y-4">
        <Field label="Monto" htmlFor="pago-monto" required>
          <MoneyInput id="pago-monto" value={monto} onChange={setMonto} placeholder="0" />
        </Field>
        {pendiente > 0 && (
          <p className="-mt-2 text-xs text-slate-500">Falta pagar {formatGs(pendiente)} Gs</p>
        )}
        {medio === "TRANSFERENCIA" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Banco" htmlFor="pago-banco">
              <Input id="pago-banco" value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="ej. Itau" />
            </Field>
            <Field label="Nro de operacion" htmlFor="pago-ref">
              <Input id="pago-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </Field>
          </div>
        )}
        {medio === "CHEQUE" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Banco" htmlFor="pago-banco">
              <Input id="pago-banco" value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="ej. Itau" />
            </Field>
            <Field label="Nro de cheque" htmlFor="pago-ref" required>
              <Input id="pago-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </Field>
            <Field label="Fecha de cobro" htmlFor="pago-cobro" required>
              <Input id="pago-cobro" type="date" value={fechaCobro} min={fecha} onChange={(e) => setFechaCobro(e.target.value)} />
            </Field>
          </div>
        )}
      </form>
    </Modal>
  );
}
