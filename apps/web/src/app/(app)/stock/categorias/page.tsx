"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CrudManager, type ColumnDef, type FieldDef } from "@/components/CrudManager";
import type { Category, ChartAccount } from "@/lib/types";

export default function CategoriasPage() {
  const { companyId } = useAuth();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);

  // Plan de cuentas de la empresa activa (para los selects y para mostrar el codigo en la tabla).
  useEffect(() => {
    if (!companyId) return;
    api<ChartAccount[]>("/contabilidad/plan-cuentas")
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [companyId]);

  // id -> "codigo - nombre" para render en tabla (incluye inactivas por si ya estaban asignadas).
  const accountLabel = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of accounts) m.set(a.id, `${a.codigo} - ${a.nombre}`);
    return m;
  }, [accounts]);

  // Solo cuentas imputables y activas son elegibles; se antepone "sin cuenta".
  const accountOptions = useMemo(
    () => [
      { value: "", label: "— Sin cuenta —" },
      ...accounts
        .filter((a) => a.imputable && a.activo)
        .map((a) => ({ value: String(a.id), label: `${a.codigo} - ${a.nombre}` })),
    ],
    [accounts]
  );

  const columns: ColumnDef<Category>[] = useMemo(() => {
    const cuenta = (id: number | null) => (id ? accountLabel.get(id) ?? "—" : "—");
    return [
      { header: "Categoria", sortKey: "nombre", render: (c) => <span className="font-medium text-foreground">{c.nombre}</span> },
      { header: "Compra", render: (c) => <span className="text-sm text-secondary">{cuenta(c.cuentaCompraId)}</span> },
      { header: "Venta", render: (c) => <span className="text-sm text-secondary">{cuenta(c.cuentaVentaId)}</span> },
      { header: "Devolucion", render: (c) => <span className="text-sm text-secondary">{cuenta(c.cuentaDevolucionId)}</span> },
    ];
  }, [accountLabel]);

  const fields: FieldDef[] = useMemo(
    () => [
      { key: "nombre", label: "Nombre", required: true, colSpan: 2 },
      { key: "cuentaCompraId", label: "Cuenta de compra", type: "select", numeric: true, colSpan: 2, options: accountOptions },
      { key: "cuentaVentaId", label: "Cuenta de venta", type: "select", numeric: true, colSpan: 2, options: accountOptions },
      { key: "cuentaDevolucionId", label: "Cuenta de devolucion", type: "select", numeric: true, colSpan: 2, options: accountOptions },
    ],
    [accountOptions]
  );

  return (
    <CrudManager<Category>
      title="Categorias"
      code="STKM003"
      subtitle="Categorias de articulos y su imputacion contable"
      entityName="categoria"
      endpoint="/categories"
      columns={columns}
      fields={fields}
      emptyForm={{ nombre: "", cuentaCompraId: "", cuentaVentaId: "", cuentaDevolucionId: "" }}
      toForm={(c) => ({
        nombre: c.nombre,
        cuentaCompraId: c.cuentaCompraId ? String(c.cuentaCompraId) : "",
        cuentaVentaId: c.cuentaVentaId ? String(c.cuentaVentaId) : "",
        cuentaDevolucionId: c.cuentaDevolucionId ? String(c.cuentaDevolucionId) : "",
      })}
      reloadKey={companyId}
      searchable
    />
  );
}
