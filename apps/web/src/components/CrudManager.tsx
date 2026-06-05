"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { Plus, Pencil } from "lucide-react";

type FormValue = string | boolean;
type FormValues = Record<string, FormValue>;

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox";
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  colSpan?: 1 | 2;
  placeholder?: string;
}

export interface ColumnDef<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
}

interface CrudManagerProps<T extends { id: number }> {
  title: string;
  code: string;
  subtitle?: string;
  entityName: string; // ej "marca"
  endpoint: string; // ej "/brands"
  columns: ColumnDef<T>[];
  fields: FieldDef[];
  toForm: (row: T) => FormValues;
  emptyForm: FormValues;
  searchText?: (row: T) => string; // habilita busqueda client-side
  reloadKey?: unknown; // fuerza recarga al cambiar (ej empresa activa)
  feminine?: boolean; // concordancia de genero (default true: marca/categoria)
}

const ALIGN: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function CrudManager<T extends { id: number }>({
  title,
  code,
  subtitle,
  entityName,
  endpoint,
  columns,
  fields,
  toForm,
  emptyForm,
  searchText,
  reloadKey,
  feminine = true,
}: CrudManagerProps<T>) {
  const { notify } = useToast();
  const nuevo = feminine ? "Nueva" : "Nuevo";
  const creada = feminine ? "creada" : "creado";
  const actualizada = feminine ? "actualizada" : "actualizado";
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<T[]>(endpoint));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const filtered = useMemo(() => {
    if (!searchText || !q) return items;
    return items.filter((r) => searchText(r).toLowerCase().includes(q.toLowerCase()));
  }, [items, q, searchText]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    setForm(toForm(row));
    setErrors({});
    setOpen(true);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    for (const f of fields) {
      if (f.required && f.type !== "checkbox" && !String(form[f.key] ?? "").trim()) {
        e[f.key] = `${f.label} es obligatorio`;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = form[f.key];
      if (f.type === "number") payload[f.key] = Number(v) || 0;
      else if (f.type === "checkbox") payload[f.key] = Boolean(v);
      else payload[f.key] = typeof v === "string" ? v.trim() : v;
    }

    try {
      if (editing) {
        await api(`${endpoint}/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        notify("success", `${cap(entityName)} ${actualizada}`);
      } else {
        await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
        notify("success", `${cap(entityName)} ${creada}`);
      }
      setOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function set(key: string, value: FormValue) {
    setForm((f) => ({ ...f, [key]: value }));
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
          {nuevo} {entityName}
        </Button>
      </div>

      {searchText && (
        <div className="mb-4 w-72">
          <Input placeholder={`Buscar ${entityName}...`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              {columns.map((c, i) => (
                <th key={i} className={`px-4 py-3 font-medium ${ALIGN[c.align ?? "left"]}`}>
                  {c.header}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-0">
                  <EmptyState
                    title={q ? "Sin resultados" : `No hay ${entityName}s todavia`}
                    description={
                      q ? "Proba con otro termino de busqueda." : `Crea la primera ${entityName} para empezar.`
                    }
                    action={
                      !q ? (
                        <Button onClick={openNew}>
                          {nuevo} {entityName}
                        </Button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                  {columns.map((c, i) => (
                    <td key={i} className={`px-4 py-3 ${ALIGN[c.align ?? "left"]}`}>
                      {c.render(row)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(row)}
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

      {!loading && filtered.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">{filtered.length} registro(s)</p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar ${entityName}` : `${nuevo} ${entityName}`}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button form="crud-form" type="submit" loading={saving}>
              {editing ? "Guardar" : "Crear"}
            </Button>
          </>
        }
      >
        <form id="crud-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            if (f.type === "checkbox") {
              return (
                <div key={f.key} className={`flex items-end ${f.colSpan === 2 ? "sm:col-span-2" : ""}`}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      checked={Boolean(form[f.key])}
                      onChange={(e) => set(f.key, e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-accent"
                    />
                    {f.label}
                  </label>
                </div>
              );
            }
            return (
              <Field
                key={f.key}
                label={f.label}
                htmlFor={f.key}
                required={f.required}
                error={errors[f.key]}
                className={f.colSpan === 2 ? "sm:col-span-2" : ""}
              >
                {f.type === "select" ? (
                  <Select id={f.key} value={String(form[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={f.key}
                    type={f.type === "number" ? "number" : "text"}
                    placeholder={f.placeholder}
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </Field>
            );
          })}
        </form>
      </Modal>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
