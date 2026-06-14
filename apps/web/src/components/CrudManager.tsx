"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { SelectWithAdd } from "@/components/ui/SelectWithAdd";
import { QuickCreateModal, type QuickKind } from "@/components/QuickCreateModal";
import { useListQuery } from "@/lib/useListQuery";
import { Plus, Pencil } from "lucide-react";

type FormValue = string | boolean;
type FormValues = Record<string, FormValue>;

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox" | "date";
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  colSpan?: 1 | 2;
  placeholder?: string;
  numeric?: boolean; // select cuyo valor es un id numerico: se envia como number (o null si vacio)
  quickAdd?: QuickKind; // select con boton "+" para crear una opcion nueva inline
}

export interface ColumnDef<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Clave de orden del backend; si se define, la columna es ordenable. */
  sortKey?: string;
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
  searchable?: boolean; // muestra el buscador (la busqueda es server-side via ?q=)
  defaultSort?: string; // clave de orden inicial del backend (default "nombre")
  reloadKey?: unknown; // fuerza recarga al cambiar (ej empresa activa)
  feminine?: boolean; // concordancia de genero (default true: marca/categoria)
  // Catalogo creado inline desde un field con quickAdd: la pagina agrega la opcion a su lista.
  onCatalogCreated?: (fieldKey: string, item: { id: number } & Record<string, unknown>) => void;
}

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
  searchable,
  defaultSort = "nombre",
  reloadKey,
  feminine = true,
  onCatalogCreated,
}: CrudManagerProps<T>) {
  const { notify } = useToast();
  const nuevo = feminine ? "Nueva" : "Nuevo";
  const creada = feminine ? "creada" : "creado";
  const actualizada = feminine ? "actualizada" : "actualizado";

  const list = useListQuery<T>(endpoint, { defaultSort, reloadKey });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Field cuyo "+" esta abierto (para crear una opcion de catalogo inline).
  const [addField, setAddField] = useState<{ key: string; kind: QuickKind } | null>(null);

  const dataColumns: DataColumn<T>[] = columns.map((c) => ({
    key: c.sortKey,
    header: c.header,
    render: c.render,
    align: c.align,
  }));

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
      if (f.type === "checkbox") {
        payload[f.key] = Boolean(v);
      } else if (f.type === "number") {
        const s = String(v ?? "").trim();
        // Campo numerico opcional vacio -> null (no 0)
        payload[f.key] = s === "" ? (f.required ? 0 : null) : Number(s);
      } else if (f.type === "date") {
        const s = String(v ?? "").trim();
        payload[f.key] = s === "" ? null : s;
      } else if (f.numeric) {
        // Select con id numerico
        const s = String(v ?? "").trim();
        payload[f.key] = s === "" ? (f.required ? undefined : null) : Number(s);
      } else {
        payload[f.key] = typeof v === "string" ? v.trim() : v;
      }
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
      list.reload();
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

      {searchable && (
        <div className="mb-4 w-72">
          <Input
            placeholder={`Buscar ${entityName}...`}
            value={list.q}
            onChange={(e) => list.setQ(e.target.value)}
          />
        </div>
      )}

      <DataTable
        columns={dataColumns}
        rows={list.rows}
        loading={list.loading}
        rowKey={(row) => row.id}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        actions={(row) => (
          <button
            onClick={() => openEdit(row)}
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary"
            aria-label="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        emptyTitle={list.q ? "Sin resultados" : `No hay ${entityName}s todavia`}
        emptyDescription={
          list.q ? "Proba con otro termino de busqueda." : `Crea la primera ${entityName} para empezar.`
        }
        emptyAction={!list.q ? <Button onClick={openNew}>{`${nuevo} ${entityName}`}</Button> : undefined}
      />

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
                {f.type === "select" && f.quickAdd ? (
                  <SelectWithAdd
                    id={f.key}
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                    onAdd={() => setAddField({ key: f.key, kind: f.quickAdd! })}
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </SelectWithAdd>
                ) : f.type === "select" ? (
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
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
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

      {addField && (
        <QuickCreateModal
          kind={addField.kind}
          open={addField !== null}
          onClose={() => setAddField(null)}
          onCreated={(item) => {
            set(addField.key, String(item.id));
            onCatalogCreated?.(addField.key, item);
          }}
        />
      )}
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
