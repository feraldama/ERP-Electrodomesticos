"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import { Input, Select } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useListQuery } from "@/lib/useListQuery";
import type { Brand, Category, Rubro, StockRow, StockSummaryRow, Warehouse } from "@/lib/types";

type Tab = "detallado" | "resumido";

function esBajoDetalle(r: StockRow) {
  const minimo = Number(r.article.stockMinimo);
  return minimo > 0 && Number(r.cantidad) <= minimo;
}
function esBajoResumen(r: StockSummaryRow) {
  return r.stockMinimo > 0 && r.existencia <= r.stockMinimo;
}

const detailColumns: DataColumn<StockRow>[] = [
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
      <span className={`font-mono font-medium ${esBajoDetalle(r) ? "text-destructive" : "text-foreground"}`}>
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
      esBajoDetalle(r) ? (
        <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-destructive">Bajo</span>
      ) : null,
  },
];

const summaryColumns: DataColumn<StockSummaryRow>[] = [
  {
    key: "codigo",
    header: "Codigo",
    render: (r) => <span className="font-mono text-xs font-semibold text-secondary">{r.codigo}</span>,
  },
  { key: "articulo", header: "Articulo", render: (r) => <span className="text-foreground">{r.descripcion}</span> },
  {
    key: "cantidad",
    header: "Existencia total",
    align: "right",
    render: (r) => (
      <span className={`font-mono font-medium ${esBajoResumen(r) ? "text-destructive" : "text-foreground"}`}>
        {formatGs(r.existencia)}
      </span>
    ),
  },
  {
    key: "stockMinimo",
    header: "Stock min.",
    align: "right",
    render: (r) => <span className="font-mono text-slate-500">{formatGs(r.stockMinimo)}</span>,
  },
  {
    header: "Alerta",
    align: "center",
    render: (r) =>
      esBajoResumen(r) ? (
        <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-destructive">Bajo</span>
      ) : null,
  },
];

export default function ConsultaStockPage() {
  const { companyId } = useAuth();
  const [tab, setTab] = useState<Tab>("detallado");

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [warehouseId, setWarehouseId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [rubroId, setRubroId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [hasta, setHasta] = useState("");
  const [soloConStock, setSoloConStock] = useState(true); // Existencia Cero = No (default de Century)

  const list = useListQuery<StockRow | StockSummaryRow>("/stock", {
    defaultSort: "articulo",
    extraParams: {
      resumido: tab === "resumido" ? "true" : undefined,
      warehouseId: warehouseId || undefined,
      brandId: brandId || undefined,
      rubroId: rubroId || undefined,
      categoryId: categoryId || undefined,
      hasta: hasta || undefined,
      soloConStock: soloConStock ? "true" : "false",
    },
    reloadKey: companyId,
  });

  useEffect(() => {
    api<Warehouse[]>("/warehouses").then(setWarehouses).catch(() => setWarehouses([]));
    api<Brand[]>("/brands").then(setBrands).catch(() => setBrands([]));
    api<Rubro[]>("/rubros").then(setRubros).catch(() => setRubros([]));
    api<Category[]>("/categories").then(setCategories).catch(() => setCategories([]));
  }, [companyId]);

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Stock por deposito</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKC009</span>
        </div>
        <p className="text-sm text-slate-500">Existencias por articulo y deposito</p>
      </div>

      {/* Tabs Detallado / Resumido */}
      <div className="mb-4 flex border-b border-border">
        {(["detallado", "resumido"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-secondary"
            }`}
          >
            {t}
          </button>
        ))}
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
        <div className="w-52">
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
        <div className="w-52">
          <label className="mb-1 block text-sm font-medium text-secondary">Rubro</label>
          <Select value={rubroId} onChange={(e) => setRubroId(e.target.value)}>
            <option value="">Todos los rubros</option>
            {rubros.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <label className="mb-1 block text-sm font-medium text-secondary">Clasificacion</label>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas las clasificaciones</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <label className="mb-1 block text-sm font-medium text-secondary">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="w-64">
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
          Ocultar existencia cero
        </label>
      </div>

      {tab === "detallado" ? (
        <DataTable
          columns={detailColumns}
          rows={list.rows as StockRow[]}
          loading={list.loading}
          rowKey={(r) => `${r.warehouse.id}-${r.article.id}`}
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
              : "Ajusta los filtros o carga compras/ajustes para generar existencias."
          }
        />
      ) : (
        <DataTable
          columns={summaryColumns}
          rows={list.rows as StockSummaryRow[]}
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
          emptyTitle={list.q ? "Sin resultados" : "Sin existencias registradas"}
          emptyDescription={
            list.q
              ? "Proba con otro codigo o descripcion."
              : "Ajusta los filtros o carga compras/ajustes para generar existencias."
          }
        />
      )}
    </div>
  );
}
