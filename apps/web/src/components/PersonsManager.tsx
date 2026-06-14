"use client";

import { useState } from "react";
import type { Person, PersonRole } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PersonFormModal } from "@/components/PersonFormModal";
import { useListQuery } from "@/lib/useListQuery";
import { Plus, Pencil } from "lucide-react";

function RoleBadges({ p }: { p: Person }) {
  const roles: Array<[boolean, string, string]> = [
    [p.esCliente, "Cliente", "bg-accent/10 text-accent"],
    [p.esProveedor, "Proveedor", "bg-blue-50 text-blue-700"],
    [p.esEmpleado, "Empleado", "bg-amber-50 text-amber-700"],
  ];
  const active = roles.filter(([on]) => on);
  if (active.length === 0) return <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {active.map(([, label, cls]) => (
        <span key={label} className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

interface Props {
  title: string;
  code: string;
  subtitle?: string;
  role?: PersonRole; // filtra el listado; tambien preselecciona el rol al crear
}

const columns: DataColumn<Person>[] = [
  { key: "nombre", header: "Nombre / Razon social", render: (p) => <span className="font-medium text-foreground">{p.razonSocial}</span> },
  {
    key: "documento",
    header: "Documento",
    render: (p) => (
      <span className="font-mono text-xs text-slate-600">
        {p.tipoDoc} {p.nroDoc}
      </span>
    ),
  },
  { header: "Contacto", render: (p) => <span className="text-slate-600">{p.telefono || p.email || "-"}</span> },
  { header: "Roles", render: (p) => <RoleBadges p={p} /> },
];

export function PersonsManager({ title, code, subtitle, role = null }: Props) {
  const list = useListQuery<Person>("/persons", {
    defaultSort: "nombre",
    extraParams: { role: role ?? undefined },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(p: Person) {
    setEditing(p);
    setOpen(true);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">{code}</span>
          </div>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nueva persona
        </Button>
      </div>

      <div className="mb-4 w-72">
        <Input
          placeholder="Buscar por nombre o documento..."
          value={list.q}
          onChange={(e) => list.setQ(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        rowKey={(p) => p.id}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        actions={(p) => (
          <button
            onClick={() => openEdit(p)}
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary"
            aria-label="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        emptyTitle={list.q ? "Sin resultados" : "No hay personas todavia"}
        emptyDescription={
          list.q ? "Proba con otro nombre o documento." : "Crea la primera persona (cliente, proveedor o trabajador)."
        }
        emptyAction={!list.q ? <Button onClick={openNew}>Nueva persona</Button> : undefined}
      />

      <PersonFormModal
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        role={role}
        onSaved={() => list.reload()}
      />
    </div>
  );
}
