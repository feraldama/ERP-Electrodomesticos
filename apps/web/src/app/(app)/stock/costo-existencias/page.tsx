"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import { Input, Select } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useListQuery } from "@/lib/useListQuery";
import type { Brand, CostExistenceRow, Warehouse } from "@/lib/types";

// Costo con 2 decimales (los montos de existencia/valorizado van sin decimales, en Gs).
const money2 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const columns: DataColumn<CostExistenceRow>[] = [
  {
    key: "codigo",
    header: "Codigo",
    render: (r) => <span className="font-mono text-xs font-semibold text-secondary">{r.codigo}</span>,
  },
  { key: "articulo", header: "Articulo", render: (r) => <span className="text-foreground">{r.descripcion}</span> },
  { key: "marca", header: "Marca", render: (r) => <span className="text-slate-600">{r.marca ?? "-"}</span> },
  {
    key: "existencia",
    header: "Existencia",
    align: "right",
    render: (r) => <span className="font-mono font-medium text-foreground">{formatGs(r.existencia)}</span>,
  },
  {
    key: "costo",
    header: "Costo prom.",
    align: "right",
    render: (r) => <span className="font-mono text-slate-600">{money2.format(r.costo)}</span>,
  },
  {
    key: "valorizado",
    header: "Valorizado",
    align: "right",
    render: (r) => <span className="font-mono font-medium text-foreground">{formatGs(r.valorizado)}</span>,
  },
];

export default function CostoExistenciasPage() {
  const { companyId } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brandId, setBrandId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [soloConStock, setSoloConStock] = useState(true);

  const list = useListQuery<CostExistenceRow>("/stock/cost-existence", {
    defaultSort: "articulo",
    extraParams: {
      brandId: brandId || undefined,
      warehouseId: warehouseId || undefined,
      soloConStock: soloConStock ? "true" : "false",
    },
    reloadKey: companyId,
  });

  useEffect(() => {
    api<Brand[]>("/brands").then(setBrands).catch(() => setBrands([]));
    api<Warehouse[]>("/warehouses").then(setWarehouses).catch(() => setWarehouses([]));
  }, [companyId]);

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Costo promedio con existencias</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKC030</span>
        </div>
        <p className="text-sm text-slate-500">Existencia total, costo promedio y valorizado por articulo.</p>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="mb-1 block text-sm font-medium text-secondary">Marca</label>
          <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Todas las marcas</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </div>
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
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={soloConStock}
            onChange={(e) => setSoloConStock(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-primary/20"
          />
          Solo con existencia
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        rowKey={(r) => r.articleId}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        emptyTitle={list.q ? "Sin resultados" : "Sin articulos para mostrar"}
        emptyDescription={
          list.q
            ? "Proba con otro codigo o descripcion."
            : "Ajusta los filtros o carga compras/ajustes para generar existencias."
        }
      />
    </div>
  );
}
