"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import { Input, Select } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useListQuery } from "@/lib/useListQuery";
import type { StockRow, Warehouse } from "@/lib/types";

function esBajo(r: StockRow) {
  const minimo = Number(r.article.stockMinimo);
  return minimo > 0 && Number(r.cantidad) <= minimo;
}

const columns: DataColumn<StockRow>[] = [
  { key: "deposito", header: "Deposito", render: (r) => <span className="text-slate-600">{r.warehouse.nombre}</span> },
  {
    key: "codigo",
    header: "Codigo",
    render: (r) => <span className="font-mono text-xs font-semibold text-secondary">{r.article.codigo}</span>,
  },
  { key: "articulo", header: "Articulo", render: (r) => <span className="text-foreground">{r.article.descripcion}</span> },
  {
    key: "cantidad",
    header: "Cantidad",
    align: "right",
    render: (r) => (
      <span className={`font-mono font-medium ${esBajo(r) ? "text-destructive" : "text-foreground"}`}>
        {formatGs(Number(r.cantidad))}
      </span>
    ),
  },
  {
    key: "stockMinimo",
    header: "Stock min.",
    align: "right",
    render: (r) => <span className="font-mono text-slate-500">{formatGs(Number(r.article.stockMinimo))}</span>,
  },
  {
    header: "Alerta",
    align: "center",
    render: (r) =>
      esBajo(r) ? (
        <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-destructive">Bajo</span>
      ) : null,
  },
];

export default function ConsultaStockPage() {
  const { companyId } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");

  const list = useListQuery<StockRow>("/stock", {
    defaultSort: "articulo",
    extraParams: { warehouseId: warehouseId || undefined },
    reloadKey: companyId,
  });

  useEffect(() => {
    api<Warehouse[]>("/warehouses").then(setWarehouses).catch(() => setWarehouses([]));
  }, [companyId]);

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Stock por deposito</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKC009</span>
        </div>
        <p className="text-sm text-slate-500">Existencias actuales por articulo y deposito</p>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="mb-1 block text-sm font-medium text-secondary">Deposito</label>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Todos los depositos</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.codigo} - {w.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-72">
          <label className="mb-1 block text-sm font-medium text-secondary">Buscar articulo</label>
          <Input placeholder="Codigo o descripcion..." value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        rowKey={(r) => r.id}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        emptyTitle={list.q ? "Sin resultados" : "Sin existencias registradas"}
        emptyDescription={
          list.q
            ? "Proba con otro codigo o descripcion."
            : "El stock se genera al cargar compras o ajustes de inventario."
        }
      />
    </div>
  );
}
