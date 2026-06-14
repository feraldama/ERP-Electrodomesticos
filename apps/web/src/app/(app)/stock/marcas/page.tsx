"use client";

import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Brand } from "@/lib/types";

const columns: ColumnDef<Brand>[] = [
  { header: "Marca", sortKey: "nombre", render: (b) => <span className="font-medium text-foreground">{b.nombre}</span> },
  { header: "Estado", sortKey: "estado", align: "center", render: (b) => <StatusBadge activo={b.activo ?? true} /> },
];

const fields: FieldDef[] = [
  { key: "nombre", label: "Nombre", required: true, colSpan: 2 },
  { key: "activo", label: "Activa", type: "checkbox", colSpan: 2 },
];

export default function MarcasPage() {
  return (
    <CrudManager<Brand>
      title="Marcas"
      code="STKM002"
      subtitle="Marcas de articulos"
      entityName="marca"
      endpoint="/brands"
      columns={columns}
      fields={fields}
      emptyForm={{ nombre: "", activo: true }}
      toForm={(b) => ({ nombre: b.nombre, activo: b.activo ?? true })}
      searchable
    />
  );
}
