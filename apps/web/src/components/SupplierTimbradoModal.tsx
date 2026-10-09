"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SupplierTimbrado } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface SupplierTimbradoModalProps {
  open: boolean;
  onClose: () => void;
  supplierId: number | null;
  /** Valores sugeridos (los que ya se cargaron en la compra). */
  defaults?: { establecimiento?: string; puntoExpedicion?: string };
  onCreated: (t: SupplierTimbrado) => void;
}

const vacio = {
  numero: "",
  tipoDocumento: "FACTURA",
  establecimiento: "",
  puntoExpedicion: "",
  fechaInicio: "",
  fechaVencimiento: "",
  numeroInicial: "",
  numeroFinal: "",
  tipo: "",
};

const soloDigitos = (v: string) => v.replace(/\D/g, "");

// Alta de un timbrado de proveedor (queda registrado para las proximas compras).
export function SupplierTimbradoModal({ open, onClose, supplierId, defaults, onCreated }: SupplierTimbradoModalProps) {
  const { notify } = useToast();
  const [v, setV] = useState(vacio);
  const [saving, setSaving] = useState(false);

  // Resetea el form cada vez que se abre, sugiriendo establecimiento/punto de la compra.
  useEffect(() => {
    if (open) {
      setV({
        ...vacio,
        establecimiento: defaults?.establecimiento ?? "",
        puntoExpedicion: defaults?.puntoExpedicion ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof typeof vacio) => (val: string) => setV((p) => ({ ...p, [k]: val }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!supplierId) return notify("error", "Selecciona primero el proveedor");
    if (v.numero.length !== 8) return notify("error", "El timbrado debe tener 8 digitos");
    if (!Number(v.establecimiento) || !Number(v.puntoExpedicion)) {
      return notify("error", "Ingresa establecimiento y punto de emision");
    }
    if (!v.fechaInicio || !v.fechaVencimiento) return notify("error", "Ingresa las fechas de vigencia");
    if (v.fechaVencimiento < v.fechaInicio) return notify("error", "La fecha de vencimiento es anterior a la inicial");

    setSaving(true);
    try {
      const t = await api<SupplierTimbrado>(`/suppliers/${supplierId}/timbrados`, {
        method: "POST",
        body: JSON.stringify({
          numero: v.numero,
          tipoDocumento: v.tipoDocumento,
          establecimiento: v.establecimiento.padStart(3, "0"),
          puntoExpedicion: v.puntoExpedicion.padStart(3, "0"),
          fechaInicio: v.fechaInicio,
          fechaVencimiento: v.fechaVencimiento,
          numeroInicial: v.numeroInicial ? Number(v.numeroInicial) : null,
          numeroFinal: v.numeroFinal ? Number(v.numeroFinal) : null,
          tipo: v.tipo || null,
        }),
      });
      notify("success", "Timbrado registrado");
      onCreated(t);
      onClose();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al registrar el timbrado");
    } finally {
      setSaving(false);
    }
  }

  const dirty = v.numero !== "" || v.fechaInicio !== "" || v.fechaVencimiento !== "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Datos del timbrado"
      confirmClose={dirty}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="supplier-timbrado-form" type="submit" loading={saving}>
            Crear
          </Button>
        </>
      }
    >
      <form id="supplier-timbrado-form" onSubmit={submit} className="grid grid-cols-1 gap-4">
        <Field label="Nº Timbrado" htmlFor="st-num" required>
          <Input id="st-num" value={v.numero} inputMode="numeric" maxLength={8} className="font-mono"
            onChange={(e) => set("numero")(soloDigitos(e.target.value))} />
        </Field>
        <Field label="Clase documento" htmlFor="st-clase" required>
          <Select id="st-clase" value={v.tipoDocumento} onChange={(e) => set("tipoDocumento")(e.target.value)}>
            <option value="FACTURA">Factura</option>
            <option value="NOTA_CREDITO">Nota de credito</option>
            <option value="NOTA_DEBITO">Nota de debito</option>
            <option value="REMISION">Remision</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Establecimiento" htmlFor="st-est" required>
            <Input id="st-est" value={v.establecimiento} inputMode="numeric" maxLength={3} placeholder="000"
              className="text-right font-mono"
              onChange={(e) => set("establecimiento")(soloDigitos(e.target.value))}
              onBlur={() => v.establecimiento && set("establecimiento")(v.establecimiento.padStart(3, "0"))} />
          </Field>
          <Field label="Punto de emision" htmlFor="st-pto" required>
            <Input id="st-pto" value={v.puntoExpedicion} inputMode="numeric" maxLength={3} placeholder="000"
              className="text-right font-mono"
              onChange={(e) => set("puntoExpedicion")(soloDigitos(e.target.value))}
              onBlur={() => v.puntoExpedicion && set("puntoExpedicion")(v.puntoExpedicion.padStart(3, "0"))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fecha inicial" htmlFor="st-ini" required>
            <Input id="st-ini" type="date" value={v.fechaInicio} onChange={(e) => set("fechaInicio")(e.target.value)} />
          </Field>
          <Field label="Fecha de vencimiento" htmlFor="st-venc" required>
            <Input id="st-venc" type="date" value={v.fechaVencimiento} onChange={(e) => set("fechaVencimiento")(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Num. inicial" htmlFor="st-ninit">
            <Input id="st-ninit" value={v.numeroInicial} inputMode="numeric" maxLength={7} className="text-right font-mono"
              onChange={(e) => set("numeroInicial")(soloDigitos(e.target.value))} />
          </Field>
          <Field label="Num. final" htmlFor="st-nfin">
            <Input id="st-nfin" value={v.numeroFinal} inputMode="numeric" maxLength={7} className="text-right font-mono"
              onChange={(e) => set("numeroFinal")(soloDigitos(e.target.value))} />
          </Field>
        </div>
        <Field label="Tipo timbrado" htmlFor="st-tipo">
          <Select id="st-tipo" value={v.tipo} onChange={(e) => set("tipo")(e.target.value)}>
            <option value="">— Sin especificar —</option>
            <option value="PREIMPRESO">Preimpreso</option>
            <option value="AUTOIMPRESOR">Autoimpresor</option>
            <option value="ELECTRONICO">Electronico</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
