"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Person, PersonRole, TipoDoc } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { Plus, Pencil, Users } from "lucide-react";
import { rucDesdeCedula } from "@/lib/ruc";

interface FormState {
  tipoDoc: TipoDoc;
  nroDoc: string;
  ruc: string;
  razonSocial: string;
  nombreFantasia: string;
  direccion: string;
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

function RoleBadges({ p }: { p: Person }) {
  const roles: Array<[boolean, string, string]> = [
    [p.esCliente, "Cliente", "bg-accent/10 text-accent"],
    [p.esProveedor, "Proveedor", "bg-blue-50 text-blue-700"],
    [p.esEmpleado, "Empleado", "bg-amber-50 text-amber-700"],
  ];
  const active = roles.filter(([on]) => on);
  if (active.length === 0) return <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {active.map(([, label, cls]) => (
        <span key={label} className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

interface Props {
  title: string;
  code: string;
  subtitle?: string;
  role?: PersonRole; // filtra el listado; tambien preselecciona el rol al crear
}

export function PersonsManager({ title, code, subtitle, role = null }: Props) {
  const { notify } = useToast();
  const [items, setItems] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (search: string) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (search) params.set("q", search);
      try {
        setItems(await api<Person[]>(`/persons${params.toString() ? `?${params}` : ""}`));
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [role]
  );

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  function openNew() {
    setEditing(null);
    setForm({
      ...EMPTY,
      esCliente: role === "customer",
      esProveedor: role === "supplier",
      esEmpleado: role === "employee",
    });
    setErrors({});
    setOpen(true);
  }

  function openEdit(p: Person) {
    setEditing(p);
    setForm({
      tipoDoc: p.tipoDoc,
      nroDoc: p.nroDoc,
      ruc: p.ruc ?? "",
      razonSocial: p.razonSocial,
      nombreFantasia: p.nombreFantasia ?? "",
      direccion: p.direccion ?? "",
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      esCliente: p.esCliente,
      esProveedor: p.esProveedor,
      esEmpleado: p.esEmpleado,
      limiteCredito: p.customer?.limiteCredito ?? "0",
      diasCredito: String(p.customer?.diasCredito ?? 0),
      cargo: p.employee?.cargo ?? "",
      salario: p.employee?.salario ?? "0",
    });
    setErrors({});
    setOpen(true);
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Auto-calcula el RUC (cedula + DV) cuando el documento es una cedula numerica.
  useEffect(() => {
    if (form.tipoDoc !== "CI") return;
    const calc = /^\d+$/.test(form.nroDoc) ? rucDesdeCedula(form.nroDoc) : "";
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
      if (editing) {
        await api(`/persons/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        notify("success", "Persona actualizada");
      } else {
        await api("/persons", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Persona creada");
      }
      setOpen(false);
      load(q);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">{code}</span>
          </div>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nueva persona
        </Button>
      </div>

      <div className="mb-4 w-72">
        <Input placeholder="Buscar por nombre o documento..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Nombre / Razon social</th>
              <th className="px-4 py-3 font-medium">Documento</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">Cargando...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState
                    title={q ? "Sin resultados" : "No hay personas todavia"}
                    description={q ? "Proba con otro nombre o documento." : "Crea la primera persona (cliente, proveedor o trabajador)."}
                    icon={<Users className="h-6 w-6" />}
                    action={!q ? <Button onClick={openNew}>Nueva persona</Button> : undefined}
                  />
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium text-foreground">{p.razonSocial}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {p.tipoDoc} {p.nroDoc}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.telefono || p.email || "-"}</td>
                  <td className="px-4 py-3"><RoleBadges p={p} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(p)}
                      className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && items.length > 0 && <p className="mt-3 text-xs text-slate-400">{items.length} registro(s)</p>}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar persona" : "Nueva persona"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
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
              label={form.tipoDoc === "CI" ? "RUC (calculado de la cedula)" : "RUC"}
              htmlFor="ruc"
            >
              <Input
                id="ruc"
                value={form.ruc}
                onChange={(e) => set("ruc", e.target.value)}
                placeholder="80012345-6"
                disabled={form.tipoDoc === "CI"}
                title={form.tipoDoc === "CI" ? "Se calcula automaticamente con el digito verificador" : undefined}
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
                  <Input id="lim" type="number" min={0} value={form.limiteCredito} onChange={(e) => set("limiteCredito", e.target.value)} />
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
                  <Input id="sal" type="number" min={0} value={form.salario} onChange={(e) => set("salario", e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
