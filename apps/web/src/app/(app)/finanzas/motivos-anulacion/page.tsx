"use client";

import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface MotivoAnulacion {
  id: number;
  codigo: string;
  descripcion: string;
  activo: boolean;
}

const columns: ColumnDef<MotivoAnulacion>[] = [
  { header: "Codigo", sortKey: "codigo", render: (m) => <span className="font-mono text-xs text-slate-600">{m.codigo}</span> },
  { header: "Descripcion", sortKey: "descripcion", render: (m) => <span className="font-medium text-foreground">{m.descripcion}</span> },
  { header: "Estado", sortKey: "estado", align: "center", render: (m) => <StatusBadge activo={m.activo} /> },
];

const fields: FieldDef[] = [
  { key: "codigo", label: "Codigo", required: true, placeholder: "Ej: 2303" },
  { key: "activo", label: "Activo", type: "checkbox" },
  { key: "descripcion", label: "Descripcion", required: true, colSpan: 2, placeholder: "Ej: ERROR EN LA CARGA" },
];

export default function MotivosAnulacionPage() {
  return (
    <CrudManager<MotivoAnulacion>
      title="Motivos de anulacion"
      code="FINM010"
      subtitle="Motivos que se eligen al anular un documento"
      entityName="motivo"
      endpoint="/motivos-anulacion"
      columns={columns}
      fields={fields}
      emptyForm={{ codigo: "", descripcion: "", activo: true }}
      toForm={(m) => ({ codigo: m.codigo, descripcion: m.descripcion, activo: m.activo })}
      defaultSort="descripcion"
      feminine={false}
      searchable
      deletable
      describeRow={(m) => `${m.descripcion} - ${m.codigo}`}
    />
  );
}
