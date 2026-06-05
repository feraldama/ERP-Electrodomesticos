"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Article, Brand, Category, Unit } from "@/lib/types";
import { formatGs, IVA_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { Plus, Pencil } from "lucide-react";

interface FormState {
  codigo: string;
  descripcion: string;
  brandId: string;
  categoryId: string;
  unitId: string;
  tipo: "PRODUCTO" | "SERVICIO";
  ivaTipo: "IVA10" | "IVA5" | "EXENTA";
  controlaSerie: boolean;
  costoActual: string;
  precioVenta: string;
  stockMinimo: string;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  codigo: "",
  descripcion: "",
  brandId: "",
  categoryId: "",
  unitId: "",
  tipo: "PRODUCTO",
  ivaTipo: "IVA10",
  controlaSerie: false,
  costoActual: "0",
  precioVenta: "0",
  stockMinimo: "0",
  activo: true,
};

export default function ArticulosPage() {
  const { notify } = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const data = await api<Article[]>(`/articles${search ? `?q=${encodeURIComponent(search)}` : ""}`);
      setArticles(data);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
    api<Brand[]>("/brands").then(setBrands).catch(() => {});
    api<Category[]>("/categories").then(setCategories).catch(() => {});
    api<Unit[]>("/units").then(setUnits).catch(() => {});
  }, [load]);

  // Busqueda con debounce
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setOpen(true);
  }

  function openEdit(a: Article) {
    setEditing(a);
    setForm({
      codigo: a.codigo,
      descripcion: a.descripcion,
      brandId: a.brandId?.toString() ?? "",
      categoryId: a.categoryId?.toString() ?? "",
      unitId: a.unitId?.toString() ?? "",
      tipo: a.tipo,
      ivaTipo: a.ivaTipo,
      controlaSerie: a.controlaSerie,
      costoActual: a.costoActual,
      precioVenta: a.precioVenta,
      stockMinimo: a.stockMinimo,
      activo: a.activo,
    });
    setErrors({});
    setOpen(true);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.codigo.trim()) e.codigo = "El codigo es obligatorio";
    if (!form.descripcion.trim()) e.descripcion = "La descripcion es obligatoria";
    if (Number(form.precioVenta) < 0) e.precioVenta = "No puede ser negativo";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload = {
      codigo: form.codigo.trim(),
      descripcion: form.descripcion.trim(),
      brandId: form.brandId ? Number(form.brandId) : null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      unitId: form.unitId ? Number(form.unitId) : null,
      tipo: form.tipo,
      ivaTipo: form.ivaTipo,
      controlaSerie: form.controlaSerie,
      costoActual: Number(form.costoActual) || 0,
      precioVenta: Number(form.precioVenta) || 0,
      stockMinimo: Number(form.stockMinimo) || 0,
      activo: form.activo,
    };
    try {
      if (editing) {
        await api(`/articles/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        notify("success", "Articulo actualizado");
      } else {
        await api("/articles", { method: "POST", body: JSON.stringify(payload) });
        notify("success", "Articulo creado");
      }
      setOpen(false);
      load(q);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Administrar articulos</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">STKM001</span>
          </div>
          <p className="text-sm text-slate-500">Alta, edicion y consulta de articulos</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nuevo articulo
        </Button>
      </div>

      {/* Buscador */}
      <div className="mb-4 w-72">
        <Input placeholder="Buscar por codigo o descripcion..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Codigo</th>
              <th className="px-4 py-3 font-medium">Descripcion</th>
              <th className="px-4 py-3 font-medium">Marca</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 text-center font-medium">IVA</th>
              <th className="px-4 py-3 text-right font-medium">Costo</th>
              <th className="px-4 py-3 text-right font-medium">Precio venta</th>
              <th className="px-4 py-3 text-center font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : articles.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-0">
                  <EmptyState
                    title={q ? "Sin resultados" : "No hay articulos todavia"}
                    description={q ? "Proba con otro codigo o descripcion." : "Crea tu primer articulo para empezar a operar."}
                    action={!q ? <Button onClick={openNew}>Nuevo articulo</Button> : undefined}
                  />
                </td>
              </tr>
            ) : (
              articles.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-secondary">{a.codigo}</td>
                  <td className="px-4 py-3 text-foreground">{a.descripcion}</td>
                  <td className="px-4 py-3 text-slate-600">{a.brand?.nombre ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.category?.nombre ?? "-"}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{IVA_LABEL[a.ivaTipo]}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{formatGs(a.costoActual)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{formatGs(a.precioVenta)}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.activo ? "bg-accent/10 text-accent" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {a.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(a)}
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

      {!loading && articles.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">{articles.length} articulo(s)</p>
      )}

      {/* Modal alta/edicion */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar articulo` : "Nuevo articulo"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} type="button">
              Cancelar
            </Button>
            <Button form="article-form" type="submit" loading={saving}>
              {editing ? "Guardar cambios" : "Crear articulo"}
            </Button>
          </>
        }
      >
        <form id="article-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Codigo" htmlFor="codigo" required error={errors.codigo}>
            <Input id="codigo" value={form.codigo} onChange={(e) => set("codigo", e.target.value)} />
          </Field>
          <Field label="Tipo" htmlFor="tipo">
            <Select id="tipo" value={form.tipo} onChange={(e) => set("tipo", e.target.value as FormState["tipo"])}>
              <option value="PRODUCTO">Producto</option>
              <option value="SERVICIO">Servicio</option>
            </Select>
          </Field>

          <Field label="Descripcion" htmlFor="descripcion" required error={errors.descripcion} className="sm:col-span-2">
            <Input id="descripcion" value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
          </Field>

          <Field label="Marca" htmlFor="brand">
            <Select id="brand" value={form.brandId} onChange={(e) => set("brandId", e.target.value)}>
              <option value="">-- Sin marca --</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria" htmlFor="category">
            <Select id="category" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">-- Sin categoria --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Unidad" htmlFor="unit">
            <Select id="unit" value={form.unitId} onChange={(e) => set("unitId", e.target.value)}>
              <option value="">-- Sin unidad --</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} - {u.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="IVA" htmlFor="iva">
            <Select id="iva" value={form.ivaTipo} onChange={(e) => set("ivaTipo", e.target.value as FormState["ivaTipo"])}>
              <option value="IVA10">10%</option>
              <option value="IVA5">5%</option>
              <option value="EXENTA">Exenta</option>
            </Select>
          </Field>

          <Field label="Costo actual (Gs)" htmlFor="costo">
            <Input id="costo" type="number" min={0} value={form.costoActual} onChange={(e) => set("costoActual", e.target.value)} />
          </Field>
          <Field label="Precio de venta (Gs)" htmlFor="precio" error={errors.precioVenta}>
            <Input id="precio" type="number" min={0} value={form.precioVenta} onChange={(e) => set("precioVenta", e.target.value)} />
          </Field>

          <Field label="Stock minimo" htmlFor="stockmin">
            <Input id="stockmin" type="number" min={0} value={form.stockMinimo} onChange={(e) => set("stockMinimo", e.target.value)} />
          </Field>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
              <input
                type="checkbox"
                checked={form.controlaSerie}
                onChange={(e) => set("controlaSerie", e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              Controla numero de serie / IMEI
            </label>
          </div>
          {editing && (
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => set("activo", e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent"
                />
                Articulo activo
              </label>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
