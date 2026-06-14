"use client";

import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Rubro } from "@/lib/types";

const columns: ColumnDef<Rubro>[] = [
  { header: "Rubro", sortKey: "nombre", render: (r) => <span className="font-medium text-foreground">{r.nombre}</span> },
  { header: "Estado", sortKey: "estado", align: "center", render: (r) => <StatusBadge activo={r.activo ?? true} /> },
];

const fields: FieldDef[] = [
  { key: "nombre", label: "Nombre", required: true, colSpan: 2 },
  { key: "activo", label: "Activo", type: "checkbox", colSpan: 2 },
];

export default function RubrosPage() {
  return (
    <CrudManager<Rubro>
      title="Rubros"
      code="STKM012"
      subtitle="Rubros de facturacion (agrupan articulos por timbrado)"
      entityName="rubro"
      endpoint="/rubros"
      feminine={false}
      columns={columns}
      fields={fields}
      emptyForm={{ nombre: "", activo: true }}
      toForm={(r) => ({ nombre: r.nombre, activo: r.activo ?? true })}
      searchable
    />
  );
}
