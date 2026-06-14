"use client";

import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { Timbrado } from "@/lib/types";

const columns: ColumnDef<Timbrado>[] = [
  {
    header: "Numero",
    sortKey: "numero",
    render: (t) => <span className="font-mono text-xs font-semibold text-secondary">{t.numero}</span>,
  },
  {
    header: "Establecimiento",
    sortKey: "establecimiento",
    render: (t) => <span className="font-mono text-xs text-slate-600">{t.establecimiento}</span>,
  },
  {
    header: "Vigencia",
    render: (t) => (
      <span className="text-slate-600">
        {formatDate(t.fechaInicio)}
        {t.fechaFin ? ` al ${formatDate(t.fechaFin)}` : ""}
      </span>
    ),
  },
  {
    header: "Puntos",
    align: "center",
    render: (t) => <span className="text-slate-600">{t._count?.puntos ?? 0}</span>,
  },
  { header: "Estado", sortKey: "estado", align: "center", render: (t) => <StatusBadge activo={t.activo} /> },
];

const fields: FieldDef[] = [
  { key: "numero", label: "Numero de timbrado", required: true, placeholder: "ej 12345678" },
  { key: "establecimiento", label: "Establecimiento", required: true, placeholder: "001" },
  { key: "fechaInicio", label: "Inicio de vigencia", type: "date", required: true },
  { key: "fechaFin", label: "Fin de vigencia (opcional)", type: "date" },
  { key: "activo", label: "Activo", type: "checkbox", colSpan: 2 },
];

export default function TimbradosPage() {
  const { companyId } = useAuth();
  return (
    <CrudManager<Timbrado>
      title="Timbrados"
      code="VENM008"
      subtitle="Timbrado de facturacion de la empresa activa (compartido por todos los rubros)"
      entityName="timbrado"
      endpoint="/timbrados"
      feminine={false}
      columns={columns}
      fields={fields}
      emptyForm={{
        numero: "",
        establecimiento: "001",
        fechaInicio: "",
        fechaFin: "",
        activo: true,
      }}
      toForm={(t) => ({
        numero: t.numero,
        establecimiento: t.establecimiento,
        fechaInicio: t.fechaInicio ? t.fechaInicio.slice(0, 10) : "",
        fechaFin: t.fechaFin ? t.fechaFin.slice(0, 10) : "",
        activo: t.activo,
      })}
      searchable
      defaultSort="numero"
      reloadKey={companyId}
    />
  );
}
