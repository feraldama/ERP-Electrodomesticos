"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Article, Brand, Category, Rubro, Unit } from "@/lib/types";
import { IVA_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { SelectWithAdd } from "@/components/ui/SelectWithAdd";
import { QuickCreateModal, type QuickKind } from "@/components/QuickCreateModal";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ArticleSerialsManager } from "@/components/ArticleSerialsManager";
import { useListQuery } from "@/lib/useListQuery";
import { Plus, Pencil } from "lucide-react";

interface FormState {
  codigo: string;
  descripcion: string;
  brandId: string;
  categoryId: string;
  unitId: string;
  rubroId: string;
  tipo: "PRODUCTO" | "SERVICIO";
  ivaTipo: "IVA10" | "IVA5" | "EXENTA";
  controlaSerie: boolean;
  costoActual: string;
  precioVenta: string;
  stockMinimo: string;
  imagenUrl: string;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  codigo: "",
  descripcion: "",
  brandId: "",
  categoryId: "",
  unitId: "",
  rubroId: "",
  tipo: "PRODUCTO",
  ivaTipo: "IVA10",
  controlaSerie: false,
  costoActual: "0",
  precioVenta: "0",
  stockMinimo: "0",
  imagenUrl: "",
  activo: true,
};

const columns: DataColumn<Article>[] = [
  {
    key: "codigo",
    header: "Codigo",
    render: (a) => <span className="font-mono text-xs font-semibold text-secondary">{a.codigo}</span>,
  },
  { key: "descripcion", header: "Descripcion", render: (a) => <span className="text-foreground">{a.descripcion}</span> },
  { key: "marca", header: "Marca", render: (a) => <span className="text-slate-600">{a.brand?.nombre ?? "-"}</span> },
  { key: "categoria", header: "Categoria", render: (a) => <span className="text-slate-600">{a.category?.nombre ?? "-"}</span> },
  { key: "rubro", header: "Rubro", render: (a) => <span className="text-slate-600">{a.rubro?.nombre ?? "-"}</span> },
  { header: "IVA", align: "center", render: (a) => <span className="text-slate-600">{IVA_LABEL[a.ivaTipo]}</span> },
  {
    key: "estado",
    header: "Estado",
    align: "center",
    render: (a) => (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          a.activo ? "bg-accent/10 text-accent" : "bg-slate-100 text-slate-500"
        }`}
      >
        {a.activo ? "Activo" : "Inactivo"}
      </span>
    ),
  },
];

export default function ArticulosPage() {
  const { notify } = useToast();
  const list = useListQuery<Article>("/articles", { defaultSort: "descripcion" });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rubros, setRubros] = useState<Rubro[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addKind, setAddKind] = useState<QuickKind | null>(null);

  // Catalogo creado inline desde un "+": se agrega a la lista y se selecciona.
  function handleCatalogCreated(item: { id: number } & Record<string, unknown>) {
    switch (addKind) {
      case "brand":
        setBrands((p) => [...p, item as unknown as Brand]);
        set("brandId", String(item.id));
        break;
      case "category":
        setCategories((p) => [...p, item as unknown as Category]);
        set("categoryId", String(item.id));
        break;
      case "rubro":
        setRubros((p) => [...p, item as unknown as Rubro]);
        set("rubroId", String(item.id));
        break;
      case "unit":
        setUnits((p) => [...p, item as unknown as Unit]);
        set("unitId", String(item.id));
        break;
    }
  }

  useEffect(() => {
    api<Brand[]>("/brands").then(setBrands).catch(() => {});
    api<Category[]>("/categories").then(setCategories).catch(() => {});
    api<Unit[]>("/units").then(setUnits).catch(() => {});
    api<Rubro[]>("/rubros").then(setRubros).catch(() => {});
  }, []);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDirty(false);
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
      rubroId: a.rubroId?.toString() ?? "",
      tipo: a.tipo,
      ivaTipo: a.ivaTipo,
      controlaSerie: a.controlaSerie,
      costoActual: a.costoActual,
      precioVenta: a.precioVenta,
      stockMinimo: a.stockMinimo,
      imagenUrl: a.imagenUrl ?? "",
      activo: a.activo,
    });
    setErrors({});
    setDirty(false);
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

  // Validacion on-blur de los campos requeridos.
  function validateField(key: "codigo" | "descripcion") {
    const label = key === "codigo" ? "El codigo" : "La descripcion";
    setErrors((prev) => {
      const next = { ...prev };
      if (!form[key].trim()) next[key] = `${label} es obligatori${key === "codigo" ? "o" : "a"}`;
      else delete next[key];
      return next;
    });
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
      rubroId: form.rubroId ? Number(form.rubroId) : null,
      tipo: form.tipo,
      ivaTipo: form.ivaTipo,
      controlaSerie: form.controlaSerie,
      costoActual: Number(form.costoActual) || 0,
      precioVenta: Number(form.precioVenta) || 0,
      stockMinimo: Number(form.stockMinimo) || 0,
      imagenUrl: form.imagenUrl || null,
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
      list.reload();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
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
        <Input
          placeholder="Buscar por codigo o descripcion..."
          value={list.q}
          onChange={(e) => list.setQ(e.target.value)}
        />
      </div>

      {/* Tabla */}
      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        rowKey={(a) => a.id}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        actions={(a) => (
          <button
            onClick={() => openEdit(a)}
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        emptyTitle={list.q ? "Sin resultados" : "No hay articulos todavia"}
        emptyDescription={
          list.q ? "Proba con otro codigo o descripcion." : "Crea tu primer articulo para empezar a operar."
        }
        emptyAction={!list.q ? <Button onClick={openNew}>Nuevo articulo</Button> : undefined}
      />

      {/* Modal alta/edicion */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar articulo` : "Nuevo articulo"}
        size="lg"
        confirmClose={dirty}
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
            <Input id="codigo" value={form.codigo} onChange={(e) => set("codigo", e.target.value)} onBlur={() => validateField("codigo")} />
          </Field>
          <Field label="Tipo" htmlFor="tipo">
            <Select id="tipo" value={form.tipo} onChange={(e) => set("tipo", e.target.value as FormState["tipo"])}>
              <option value="PRODUCTO">Producto</option>
              <option value="SERVICIO">Servicio</option>
            </Select>
          </Field>

          <Field label="Descripcion" htmlFor="descripcion" required error={errors.descripcion} className="sm:col-span-2">
            <Input id="descripcion" value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} onBlur={() => validateField("descripcion")} />
          </Field>

          <Field label="Marca" htmlFor="brand">
            <SelectWithAdd id="brand" value={form.brandId} onChange={(e) => set("brandId", e.target.value)} onAdd={() => setAddKind("brand")} addTitle="Crear marca">
              <option value="">-- Sin marca --</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </SelectWithAdd>
          </Field>
          <Field label="Categoria" htmlFor="category">
            <SelectWithAdd id="category" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} onAdd={() => setAddKind("category")} addTitle="Crear categoria">
              <option value="">-- Sin categoria --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </SelectWithAdd>
          </Field>

          <Field label="Rubro (facturacion)" htmlFor="rubro" className="sm:col-span-2">
            <SelectWithAdd id="rubro" value={form.rubroId} onChange={(e) => set("rubroId", e.target.value)} onAdd={() => setAddKind("rubro")} addTitle="Crear rubro">
              <option value="">-- Sin rubro --</option>
              {rubros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </SelectWithAdd>
            <p className="mt-1 text-xs text-slate-500">
              Determina con que timbrado se factura el articulo (ej. Muebles, Electrodomesticos).
            </p>
          </Field>

          <Field label="Unidad" htmlFor="unit">
            <SelectWithAdd id="unit" value={form.unitId} onChange={(e) => set("unitId", e.target.value)} onAdd={() => setAddKind("unit")} addTitle="Crear unidad">
              <option value="">-- Sin unidad --</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} - {u.nombre}
                </option>
              ))}
            </SelectWithAdd>
          </Field>
          <Field label="IVA" htmlFor="iva">
            <Select id="iva" value={form.ivaTipo} onChange={(e) => set("ivaTipo", e.target.value as FormState["ivaTipo"])}>
              <option value="IVA10">10%</option>
              <option value="IVA5">5%</option>
              <option value="EXENTA">Exenta</option>
            </Select>
          </Field>

          <Field label="Imagen del articulo" htmlFor="imagen" className="sm:col-span-2">
            <ImageUpload value={form.imagenUrl || null} onChange={(url) => set("imagenUrl", url ?? "")} />
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

        {editing && form.controlaSerie && (
          <div className="mt-4">
            <ArticleSerialsManager articleId={editing.id} />
          </div>
        )}
      </Modal>

      {addKind && (
        <QuickCreateModal
          kind={addKind}
          open={addKind !== null}
          onClose={() => setAddKind(null)}
          onCreated={handleCatalogCreated}
        />
      )}
    </div>
  );
}
