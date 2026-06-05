"use client";

import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import type { Category } from "@/lib/types";

const columns: ColumnDef<Category>[] = [
  { header: "Categoria", render: (c) => <span className="font-medium text-foreground">{c.nombre}</span> },
];

const fields: FieldDef[] = [{ key: "nombre", label: "Nombre", required: true, colSpan: 2 }];

export default function CategoriasPage() {
  return (
    <CrudManager<Category>
      title="Categorias"
      code="STKM003"
      subtitle="Categorias de articulos"
      entityName="categoria"
      endpoint="/categories"
      columns={columns}
      fields={fields}
      emptyForm={{ nombre: "" }}
      toForm={(c) => ({ nombre: c.nombre })}
      searchText={(c) => c.nombre}
    />
  );
}
