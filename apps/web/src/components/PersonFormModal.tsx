"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import type { Person, PersonRole, TipoDoc } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { calcularDV } from "@/lib/ruc";

// El mapa (Leaflet) solo funciona en el cliente: lo cargamos dinamicamente.
const LocationPicker = dynamic(
  () => import("@/components/ui/LocationPicker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] w-full items-center justify-center rounded-xl border border-border bg-muted text-sm text-slate-400">
        Cargando mapa...
      </div>
    ),
  }
);

interface FormState {
  tipoDoc: TipoDoc;
  nroDoc: string;
  ruc: string;
  razonSocial: string;
  nombreFantasia: string;
  direccion: string;
  latitud: number | null;
  longitud: number | null;
  telefono: string;
  email: string;
  esCliente: boolean;
  esProveedor: boolean;
  esEmpleado: boolean;
  limiteCredito: string;
  diasCredito: string;
  cargo: string;
  salario: string;
}

const EMPTY: FormState = {
  tipoDoc: "CI",
  nroDoc: "",
  ruc: "",
  razonSocial: "",
  nombreFantasia: "",
  direccion: "",
  latitud: null,
  longitud: null,
  telefono: "",
  email: "",
  esCliente: false,
  esProveedor: false,
  esEmpleado: false,
  limiteCredito: "0",
  diasCredito: "0",
  cargo: "",
  salario: "0",
};

function fromPerson(p: Person): FormState {
  return {
    tipoDoc: p.tipoDoc,
    nroDoc: p.nroDoc,
    ruc: p.ruc ?? "",
    razonSocial: p.razonSocial,
    nombreFantasia: p.nombreFantasia ?? "",
    direccion: p.direccion ?? "",
    latitud: p.latitud,
    longitud: p.longitud,
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    esCliente: p.esCliente,
    esProveedor: p.esProveedor,
    esEmpleado: p.esEmpleado,
    limiteCredito: p.customer?.limiteCredito ?? "0",
    diasCredito: String(p.customer?.diasCredito ?? 0),
    cargo: p.employee?.cargo ?? "",
    salario: p.employee?.salario ?? "0",
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (person: Person) => void;
  editing?: Person | null;
  /** Al crear, preselecciona el rol (cliente/proveedor/empleado). */
  role?: PersonRole;
}

// Formulario completo de persona (datos + mapa + roles) reutilizable como modal.
// Lo usan PersonsManager (alta/edicion) y el "+ crear" de los selects de cliente/proveedor.
export function PersonFormModal({ open, onClose, onSaved, editing = null, role = null }: Props) {
  const { notify } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Inicializa el form al abrir (desde la persona en edicion o vacio con rol preseleccionado).
  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? fromPerson(editing)
        : {
            ...EMPTY,
            esCliente: role === "customer",
            esProveedor: role === "supplier",
            esEmpleado: role === "employee",
          }
    );
    setErrors({});
  }, [open, editing, role]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Auto-calcula el RUC con su digito verificador (modulo 11) para CI y RUC.
  useEffect(() => {
    if (form.tipoDoc !== "CI" && form.tipoDoc !== "RUC") return;
    const base = form.nroDoc.split("-")[0].replace(/\D/g, "");
    const calc = base ? `${base}-${calcularDV(base)}` : "";
    setForm((f) => (f.ruc === calc ? f : { ...f, ruc: calc }));
  }, [form.tipoDoc, form.nroDoc]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.nroDoc.trim()) e.nroDoc = "Documento obligatorio";
    if (!form.razonSocial.trim()) e.razonSocial = "Nombre / razon social obligatorio";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload = {
      tipoDoc: form.tipoDoc,
      nroDoc: form.nroDoc.trim(),
      ruc: form.ruc.trim() || null,
      razonSocial: form.razonSocial.trim(),
      nombreFantasia: form.nombreFantasia.trim() || null,
      direccion: form.direccion.trim() || null,
      latitud: form.latitud,
      longitud: form.longitud,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      esCliente: form.esCliente,
      esProveedor: form.esProveedor,
      esEmpleado: form.esEmpleado,
      limiteCredito: Number(form.limiteCredito) || 0,
      diasCredito: Number(form.diasCredito) || 0,
      cargo: form.cargo.trim() || null,
      salario: Number(form.salario) || 0,
    };
    try {
      const saved = editing
        ? await api<Person>(`/persons/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Person>("/persons", { method: "POST", body: JSON.stringify(payload) });
      notify("success", editing ? "Persona actualizada" : "Persona creada");
      onSaved(saved);
      onClose();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar persona" : "Nueva persona"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
          <Button form="person-form" type="submit" loading={saving}>{editing ? "Guardar" : "Crear"}</Button>
        </>
      }
    >
      <form id="person-form" onSubmit={submit} className="space-y-5">
        {/* Datos basicos */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo de documento" htmlFor="tipoDoc">
            <Select id="tipoDoc" value={form.tipoDoc} onChange={(e) => set("tipoDoc", e.target.value as TipoDoc)}>
              <option value="CI">Cedula</option>
              <option value="RUC">RUC</option>
              <option value="PASAPORTE">Pasaporte</option>
              <option value="OTRO">Otro</option>
            </Select>
          </Field>
          <Field label="Nro. de documento" htmlFor="nroDoc" required error={errors.nroDoc}>
            <Input id="nroDoc" value={form.nroDoc} onChange={(e) => set("nroDoc", e.target.value)} />
          </Field>
          <Field label="Nombre / Razon social" htmlFor="razonSocial" required error={errors.razonSocial} className="sm:col-span-2">
            <Input id="razonSocial" value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} />
          </Field>
          <Field
            label={
              form.tipoDoc === "CI"
                ? "RUC (calculado de la cedula)"
                : form.tipoDoc === "RUC"
                ? "RUC (con digito verificador)"
                : "RUC"
            }
            htmlFor="ruc"
          >
            <Input
              id="ruc"
              value={form.ruc}
              onChange={(e) => set("ruc", e.target.value)}
              placeholder="80012345-6"
              disabled={form.tipoDoc === "CI" || form.tipoDoc === "RUC"}
              title={
                form.tipoDoc === "CI" || form.tipoDoc === "RUC"
                  ? "El digito verificador se calcula automaticamente (modulo 11)"
                  : undefined
              }
            />
          </Field>
          <Field label="Nombre de fantasia" htmlFor="nf">
            <Input id="nf" value={form.nombreFantasia} onChange={(e) => set("nombreFantasia", e.target.value)} />
          </Field>
          <Field label="Telefono" htmlFor="tel">
            <Input id="tel" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="mail">
            <Input id="mail" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Direccion" htmlFor="dir" className="sm:col-span-2">
            <Input id="dir" value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
          </Field>
        </div>

        {/* Ubicacion en el mapa (OpenStreetMap) */}
        <div>
          <p className="mb-1 block text-sm font-medium text-secondary">Ubicacion en el mapa</p>
          <LocationPicker
            lat={form.latitud}
            lng={form.longitud}
            address={form.direccion}
            onChange={(lat, lng) => {
              set("latitud", lat);
              set("longitud", lng);
            }}
          />
        </div>

        {/* Roles */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-3 text-sm font-medium text-secondary">Roles</p>
          <div className="flex flex-wrap gap-5">
            {([
              ["esCliente", "Cliente"],
              ["esProveedor", "Proveedor"],
              ["esEmpleado", "Empleado"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent"
                />
                {label}
              </label>
            ))}
          </div>

          {/* Campos condicionales */}
          {form.esCliente && (
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <Field label="Limite de credito (Gs)" htmlFor="lim">
                <MoneyInput id="lim" value={form.limiteCredito} onChange={(v) => set("limiteCredito", v)} />
              </Field>
              <Field label="Dias de credito" htmlFor="dias">
                <Input id="dias" type="number" min={0} value={form.diasCredito} onChange={(e) => set("diasCredito", e.target.value)} />
              </Field>
            </div>
          )}
          {form.esEmpleado && (
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <Field label="Cargo" htmlFor="cargo">
                <Input id="cargo" value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
              </Field>
              <Field label="Salario (Gs)" htmlFor="sal">
                <MoneyInput id="sal" value={form.salario} onChange={(v) => set("salario", v)} />
              </Field>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
