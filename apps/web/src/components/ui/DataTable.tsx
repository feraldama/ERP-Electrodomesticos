"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SortDir } from "@/lib/useListQuery";

export interface DataColumn<T> {
  /** Si se define, la columna es ordenable; debe coincidir con el whitelist del backend. */
  key?: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Clase extra para la celda (td). */
  className?: string;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  loading: boolean;
  rowKey: (row: T) => string | number;

  // Estado de orden/paginacion (de useListQuery). Omitir para modo lectura.
  total?: number;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: SortDir;
  onSort?: (key: string) => void;
  onPage?: (page: number) => void;
  onPageSize?: (size: number) => void;

  onRowClick?: (row: T) => void;
  /** Render de acciones por fila (columna final). */
  actions?: (row: T) => React.ReactNode;

  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}

const ALIGN: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const PAGE_SIZES = [10, 25, 50, 100];

export function DataTable<T>({
  columns,
  rows,
  loading,
  rowKey,
  total,
  page,
  pageSize,
  sort,
  dir,
  onSort,
  onPage,
  onPageSize,
  onRowClick,
  actions,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: DataTableProps<T>) {
  const colCount = columns.length + (actions ? 1 : 0);
  const paginated = total != null && page != null && pageSize != null;
  const totalPages = paginated ? Math.max(1, Math.ceil(total! / pageSize!)) : 1;
  const from = !paginated || total === 0 ? 0 : (page! - 1) * pageSize! + 1;
  const to = paginated ? Math.min(page! * pageSize!, total!) : rows.length;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              {columns.map((c, i) => {
                const sortable = !!c.key && !!onSort;
                const isSorted = sortable && sort === c.key;
                const ariaSort = isSorted ? (dir === "asc" ? "ascending" : "descending") : "none";
                return (
                  <th
                    key={i}
                    aria-sort={sortable ? ariaSort : undefined}
                    className={`px-4 py-3 font-medium ${ALIGN[c.align ?? "left"]}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort!(c.key!)}
                        className={`group inline-flex cursor-pointer items-center gap-1 rounded uppercase tracking-wide transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          c.align === "right" ? "flex-row-reverse" : ""
                        } ${isSorted ? "text-secondary" : ""}`}
                      >
                        <span>{c.header}</span>
                        {isSorted ? (
                          dir === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {actions && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-slate-500">
                  Cargando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-border last:border-0 transition-colors hover:bg-muted/40 ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((c, i) => (
                    <td key={i} className={`px-4 py-3 ${ALIGN[c.align ?? "left"]} ${c.className ?? ""}`}>
                      {c.render(row)}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {actions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer de paginacion (solo en modo paginado) */}
      {paginated && !loading && total! > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <label htmlFor="dt-page-size">Mostrar</label>
            <select
              id="dt-page-size"
              value={pageSize}
              onChange={(e) => onPageSize?.(Number(e.target.value))}
              className="cursor-pointer rounded-lg border border-border bg-white px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span>por pagina</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="tabular-nums">
              {from}&ndash;{to} de {total!.toLocaleString("es-PY")}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPage?.(page! - 1)}
                disabled={page! <= 1}
                aria-label="Pagina anterior"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPage?.(page! + 1)}
                disabled={page! >= totalPages}
                aria-label="Pagina siguiente"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
