"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

// Entidades de catalogo que se pueden crear inline desde un select.
export type QuickKind = "brand" | "rubro" | "category" | "unit" | "warehouse";

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}

interface KindConfig {
  endpoint: string;
  title: string;
  fields: FieldDef[];
}

const CONFIG: Record<QuickKind, KindConfig> = {
  brand: { endpoint: "/brands", title: "Nueva marca", fields: [{ key: "nombre", label: "Nombre", required: true }] },
  rubro: { endpoint: "/rubros", title: "Nuevo rubro", fields: [{ key: "nombre", label: "Nombre", required: true }] },
  category: { endpoint: "/categories", title: "Nueva categoria", fields: [{ key: "nombre", label: "Nombre", required: true }] },
  unit: {
    endpoint: "/units",
    title: "Nueva unidad",
    fields: [
      { key: "codigo", label: "Codigo", required: true, placeholder: "ej UN" },
      { key: "nombre", label: "Nombre", required: true },
    ],
  },
  warehouse: {
    endpoint: "/warehouses",
    title: "Nuevo deposito",
    fields: [
      { key: "codigo", label: "Codigo", required: true, placeholder: "ej 001" },
      { key: "nombre", label: "Nombre", required: true },
    ],
  },
};

type Created = { id: number } & Record<string, unknown>;

interface QuickCreateModalProps {
  kind: QuickKind;
  open: boolean;
  onClose: () => void;
  onCreated: (item: Created) => void;
}

// Mini-modal para crear un catalogo simple (marca, rubro, categoria, unidad, deposito) sin salir del form.
export function QuickCreateModal({ kind, open, onClose, onCreated }: QuickCreateModalProps) {
  const cfg = CONFIG[kind];
  const { notify } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Resetea el form cada vez que se abre.
  useEffect(() => {
    if (open) {
      setValues({});
      setErrors({});
    }
  }, [open, kind]);

  function validate() {
    const e: Record<string, string> = {};
    for (const f of cfg.fields) {
      if (f.required && !(values[f.key] ?? "").trim()) e[f.key] = `${f.label} es obligatorio`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload: Record<string, string> = {};
    for (const f of cfg.fields) payload[f.key] = (values[f.key] ?? "").trim();
    try {
      const created = await api<Created>(cfg.endpoint, { method: "POST", body: JSON.stringify(payload) });
      notify("success", `${cfg.title.replace(/^Nuev[ao]\s/, "").replace(/^./, (c) => c.toUpperCase())} creado`);
      onCreated(created);
      onClose();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  const dirty = Object.values(values).some((v) => (v ?? "").trim() !== "");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cfg.title}
      confirmClose={dirty}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="quick-create-form" type="submit" loading={saving}>
            Crear
          </Button>
        </>
      }
    >
      <form id="quick-create-form" onSubmit={submit} className="grid grid-cols-1 gap-4">
        {cfg.fields.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`qc-${f.key}`} required={f.required} error={errors[f.key]}>
            <Input
              id={`qc-${f.key}`}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              autoFocus={f.key === cfg.fields[0].key}
            />
          </Field>
        ))}
      </form>
    </Modal>
  );
}
