"use client";

import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PriceList } from "@/lib/types";
import { Check } from "lucide-react";

const columns: ColumnDef<PriceList>[] = [
  {
    header: "Lista",
    sortKey: "nombre",
    render: (l) => (
      <div>
        <div className="font-medium text-foreground">{l.nombre}</div>
        <div className="font-mono text-xs text-slate-500">{l.codigo}</div>
      </div>
    ),
  },
  {
    header: "Condicion",
    sortKey: "condicion",
    align: "center",
    render: (l) => (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          l.condicion === "CREDITO" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
        }`}
      >
        {l.condicion === "CREDITO" ? "Credito" : "Contado"}
      </span>
    ),
  },
  {
    header: "Cuotas",
    align: "center",
    render: (l) => <span className="text-slate-600">{l.cuotas > 0 ? l.cuotas : "-"}</span>,
  },
  {
    header: "Articulos con precio",
    align: "center",
    render: (l) => <span className="text-slate-600">{l._count?.prices ?? 0}</span>,
  },
  {
    header: "Por defecto",
    align: "center",
    render: (l) => (l.esDefault ? <Check className="mx-auto h-4 w-4 text-accent" /> : <span className="text-slate-300">-</span>),
  },
  { header: "Estado", align: "center", render: (l) => <StatusBadge activo={l.activo} /> },
];

const fields: FieldDef[] = [
  { key: "codigo", label: "Codigo", required: true, placeholder: "ej CRED18" },
  { key: "nombre", label: "Nombre", required: true, placeholder: "ej Credito 18 cuotas" },
  {
    key: "condicion",
    label: "Condicion",
    type: "select",
    options: [
      { value: "CONTADO", label: "Contado" },
      { value: "CREDITO", label: "Credito" },
    ],
  },
  { key: "cuotas", label: "Nro de cuotas (0 = contado)", type: "number", required: true },
  { key: "orden", label: "Orden", type: "number" },
  { key: "esDefault", label: "Usar por defecto al vender", type: "checkbox" },
  { key: "activo", label: "Activa", type: "checkbox" },
];

export default function ListasPreciosPage() {
  return (
    <CrudManager<PriceList>
      title="Listas de precios"
      code="VENM010"
      subtitle="Contado y planes de credito (las cuotas se cargan aca y aplican a toda venta con esa lista)"
      entityName="lista de precios"
      endpoint="/price-lists"
      columns={columns}
      fields={fields}
      emptyForm={{
        codigo: "",
        nombre: "",
        condicion: "CONTADO",
        cuotas: "0",
        orden: "",
        esDefault: false,
        activo: true,
      }}
      toForm={(l) => ({
        codigo: l.codigo,
        nombre: l.nombre,
        condicion: l.condicion,
        cuotas: String(l.cuotas),
        orden: String(l.orden ?? ""),
        esDefault: l.esDefault,
        activo: l.activo,
      })}
      searchable
      defaultSort="orden"
    />
  );
}
