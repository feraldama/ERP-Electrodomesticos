"use client";

import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuth } from "@/lib/auth";
import type { Warehouse } from "@/lib/types";

const columns: ColumnDef<Warehouse>[] = [
  { header: "Codigo", sortKey: "codigo", render: (w) => <span className="font-mono text-xs font-semibold text-secondary">{w.codigo}</span> },
  { header: "Deposito", sortKey: "nombre", render: (w) => <span className="font-medium text-foreground">{w.nombre}</span> },
  { header: "Estado", sortKey: "estado", align: "center", render: (w) => <StatusBadge activo={w.activo} /> },
];

const fields: FieldDef[] = [
  { key: "codigo", label: "Codigo", required: true, placeholder: "ej 001" },
  { key: "nombre", label: "Nombre", required: true },
  { key: "activo", label: "Activo", type: "checkbox", colSpan: 2 },
];

export default function DepositosPage() {
  // La empresa activa se manda via header (X-Company-Id); recargamos al cambiarla.
  const { companyId } = useAuth();
  return (
    <CrudManager<Warehouse>
      title="Depositos"
      code="STKM004"
      subtitle="Depositos de la empresa activa"
      entityName="deposito"
      endpoint="/warehouses"
      columns={columns}
      fields={fields}
      emptyForm={{ codigo: "", nombre: "", activo: true }}
      toForm={(w) => ({ codigo: w.codigo, nombre: w.nombre, activo: w.activo })}
      searchable
      defaultSort="codigo"
      reloadKey={companyId}
      feminine={false}
    />
  );
}
