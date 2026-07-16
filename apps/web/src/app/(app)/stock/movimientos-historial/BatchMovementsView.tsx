"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { formatGs, formatDateTime } from "@/lib/format";
import { Input, Select } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { useListQuery } from "@/lib/useListQuery";
import type { Article, StockMovementBatchRow, Warehouse } from "@/lib/types";
import { ArrowRight, X } from "lucide-react";
import { TipoBadge } from "./shared";
import { MovementBatchModal } from "./MovementBatchModal";

const columns: DataColumn<StockMovementBatchRow>[] = [
  {
    key: "fecha",
    header: "Fecha",
    render: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.fecha)}</span>,
  },
  {
    header: "Tipo",
    render: (r) => <TipoBadge tipo={r.tipo} />,
  },
  {
    header: "Deposito",
    render: (r) =>
      r.tipo === "TRANSFERENCIA" && r.destino ? (
        <div className="flex items-center gap-1.5 text-slate-600">
          <span>{r.origen?.nombre ?? "-"}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>{r.destino.nombre}</span>
        </div>
      ) : (
        <span className="text-slate-600">{r.origen?.nombre ?? "-"}</span>
      ),
  },
  {
    header: "Articulos",
    align: "right",
    render: (r) => <span className="font-mono font-medium text-foreground">{r.articulos}</span>,
  },
  {
    header: "Cantidad",
    align: "right",
    render: (r) => {
      const n = Number(r.cantidadTotal);
      return (
        <span className={`font-mono font-medium ${n < 0 ? "text-destructive" : "text-foreground"}`}>
          {formatGs(n)}
        </span>
      );
    },
  },
  {
    header: "Usuario",
    render: (r) => <span className="text-slate-500">{r.usuario ?? "-"}</span>,
  },
  {
    header: "Observacion",
    render: (r) => <span className="text-slate-500">{r.observacion ?? ""}</span>,
  },
];

export function BatchMovementsView({ warehouses }: { warehouses: Warehouse[] }) {
  const { companyId } = useAuth();
  const [warehouseId, setWarehouseId] = useState("");
  const [tipo, setTipo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [article, setArticle] = useState<Article | null>(null);
  const [selected, setSelected] = useState<StockMovementBatchRow | null>(null);

  const list = useListQuery<StockMovementBatchRow>("/stock/movement-batches", {
    defaultSort: "fecha",
    defaultDir: "desc",
    extraParams: {
      articleId: article?.id ?? undefined,
      warehouseId: warehouseId || undefined,
      tipo: tipo || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    },
    reloadKey: companyId,
  });

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Cada fila es una operacion de stock. Hace clic para ver el detalle de los articulos que se movieron.
      </p>

      {/* Buscador de articulo: muestra solo las operaciones que incluyen ese articulo */}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-secondary">Articulo</label>
        {article ? (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm sm:max-w-md">
              <span className="text-foreground">{article.descripcion}</span>
              <span className="font-mono text-xs font-semibold text-slate-500">{article.codigo}</span>
            </div>
            <button
              type="button"
              onClick={() => setArticle(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" />
              Quitar
            </button>
          </div>
        ) : (
          <div className="sm:max-w-md">
            <ArticleAutocomplete
              onSelect={setArticle}
              placeholder="Buscar operaciones que incluyan un articulo..."
            />
          </div>
        )}
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
        <div className="w-44">
          <label className="mb-1 block text-sm font-medium text-secondary">Tipo</label>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="AJUSTE">Ajuste</option>
            <option value="INGRESO">Ingreso</option>
            <option value="EGRESO">Egreso</option>
          </Select>
        </div>
        <div className="w-40">
          <label className="mb-1 block text-sm font-medium text-secondary">Desde</label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="w-40">
          <label className="mb-1 block text-sm font-medium text-secondary">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        rowKey={(r) => r.loteId}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        onRowClick={(r) => setSelected(r)}
        emptyTitle="Sin movimientos"
        emptyDescription="No hay movimientos que coincidan con los filtros seleccionados."
      />

      <MovementBatchModal batch={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
