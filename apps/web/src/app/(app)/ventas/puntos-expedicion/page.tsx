"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { TIPO_DOC_LABEL } from "@/lib/format";
import type { PuntoExpedicion, Rubro, Timbrado } from "@/lib/types";

const columns: ColumnDef<PuntoExpedicion>[] = [
  { header: "Rubro", sortKey: "rubro", render: (p) => <span className="font-medium text-foreground">{p.rubro?.nombre ?? "-"}</span> },
  {
    header: "Numero (estab-punto)",
    sortKey: "codigo",
    render: (p) => (
      <span className="font-mono text-xs font-semibold text-secondary">
        {p.timbrado?.establecimiento ?? "001"}-{p.codigo}
      </span>
    ),
  },
  {
    header: "Timbrado",
    render: (p) => <span className="font-mono text-xs text-slate-600">{p.timbrado?.numero ?? "-"}</span>,
  },
  { header: "Documento", render: (p) => <span className="text-slate-600">{TIPO_DOC_LABEL[p.tipoDocumento]}</span> },
  {
    header: "Ultimo Nro",
    align: "right",
    render: (p) => <span className="font-mono text-slate-600">{p.numeroActual}</span>,
  },
  { header: "Estado", align: "center", render: (p) => <StatusBadge activo={p.activo} /> },
];

const TIPO_DOC_OPTIONS = [
  { value: "FACTURA", label: "Factura" },
  { value: "NOTA_CREDITO", label: "Nota de credito" },
  { value: "NOTA_DEBITO", label: "Nota de debito" },
  { value: "REMISION", label: "Remision" },
];

export default function PuntosExpedicionPage() {
  const { companyId } = useAuth();
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [timbrados, setTimbrados] = useState<Timbrado[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  useEffect(() => {
    setLoadingRefs(true);
    Promise.all([api<Rubro[]>("/rubros"), api<Timbrado[]>("/timbrados")])
      .then(([r, t]) => {
        setRubros(r.filter((x) => x.activo !== false));
        setTimbrados(t);
      })
      .catch(() => {
        setRubros([]);
        setTimbrados([]);
      })
      .finally(() => setLoadingRefs(false));
  }, [companyId]);

  const timbradosActivos = useMemo(() => timbrados.filter((t) => t.activo), [timbrados]);

  const fields: FieldDef[] = useMemo(
    () => [
      {
        key: "rubroId",
        label: "Rubro",
        type: "select",
        required: true,
        numeric: true,
        quickAdd: "rubro",
        options: [{ value: "", label: "-- Selecciona un rubro --" }, ...rubros.map((r) => ({ value: String(r.id), label: r.nombre }))],
      },
      {
        key: "timbradoId",
        label: "Timbrado",
        type: "select",
        required: true,
        numeric: true,
        options: [
          { value: "", label: "-- Selecciona un timbrado --" },
          ...timbradosActivos.map((t) => ({ value: String(t.id), label: `${t.numero} (estab. ${t.establecimiento})` })),
        ],
      },
      { key: "codigo", label: "Punto de expedicion", required: true, placeholder: "ej 002" },
      { key: "tipoDocumento", label: "Tipo de documento", type: "select", options: TIPO_DOC_OPTIONS },
      { key: "numeroInicial", label: "Numero inicial", type: "number" },
      { key: "numeroFinal", label: "Numero final (opcional)", type: "number" },
      { key: "activo", label: "Activo", type: "checkbox", colSpan: 2 },
    ],
    [rubros, timbradosActivos]
  );

  // Pre-seleccionamos el timbrado si hay uno solo activo
  const defaultTimbradoId = timbradosActivos.length === 1 ? String(timbradosActivos[0].id) : "";

  if (!loadingRefs && timbradosActivos.length === 0) {
    return (
      <div>
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Puntos de expedicion por rubro</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">VENM009</span>
          </div>
          <p className="text-sm text-slate-500">Define el punto de expedicion con que factura cada rubro.</p>
        </div>
        <div className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState
            title="No hay timbrados cargados"
            description="Primero crea el timbrado de la empresa para poder definir sus puntos de expedicion."
            action={
              <Link href="/ventas/timbrados">
                <Button>Ir a Timbrados</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <CrudManager<PuntoExpedicion>
      title="Puntos de expedicion por rubro"
      code="VENM009"
      subtitle="Mismo timbrado, un punto de expedicion (con su numeracion) por rubro"
      entityName="punto de expedicion"
      endpoint="/puntos-expedicion"
      feminine={false}
      columns={columns}
      fields={fields}
      emptyForm={{
        rubroId: "",
        timbradoId: defaultTimbradoId,
        codigo: "",
        tipoDocumento: "FACTURA",
        numeroInicial: "1",
        numeroFinal: "",
        activo: true,
      }}
      toForm={(p) => ({
        rubroId: String(p.rubroId),
        timbradoId: String(p.timbradoId),
        codigo: p.codigo,
        tipoDocumento: p.tipoDocumento,
        numeroInicial: String(p.numeroInicial),
        numeroFinal: p.numeroFinal != null ? String(p.numeroFinal) : "",
        activo: p.activo,
      })}
      searchable
      defaultSort="codigo"
      reloadKey={companyId}
      onCatalogCreated={(key, item) => {
        if (key === "rubroId") setRubros((p) => [...p, item as unknown as Rubro]);
      }}
    />
  );
}
