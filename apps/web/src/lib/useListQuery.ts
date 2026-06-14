"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/types";

export type SortDir = "asc" | "desc";

export interface UseListQueryOptions {
  /** Clave de columna por defecto (debe coincidir con el whitelist del backend). */
  defaultSort: string;
  defaultDir?: SortDir;
  /** Tamaño de pagina inicial (default 10). */
  pageSize?: number;
  /** Params extra fijos (ej. { warehouseId }). Se serializan en cada request. */
  extraParams?: Record<string, string | number | undefined>;
  /** Cambia para forzar recarga (ej. empresa activa). */
  reloadKey?: unknown;
  /** Debounce de la busqueda en ms (default 300). */
  debounceMs?: number;
}

export interface UseListQueryResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: SortDir;
  q: string;
  loading: boolean;
  setQ: (value: string) => void;
  setPageSize: (size: number) => void;
  setPage: (page: number) => void;
  /** Alterna asc/desc en la columna; si es otra columna, arranca en asc. */
  toggleSort: (key: string) => void;
  reload: () => void;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * Maneja estado y fetch de un listado paginado server-side (page/pageSize/sort/dir/q).
 * El endpoint debe devolver { items, total, page, pageSize } (paginacion opt-in del backend).
 */
export function useListQuery<T>(
  endpoint: string,
  options: UseListQueryOptions
): UseListQueryResult<T> {
  const { defaultSort, defaultDir = "asc", pageSize: initialPageSize = 10, reloadKey, debounceMs = 300 } = options;

  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [sort, setSort] = useState(defaultSort);
  const [dir, setDir] = useState<SortDir>(defaultDir);
  const [q, setQState] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Serializa los params extra de forma estable para usarlos como dependencia.
  const extraKey = JSON.stringify(options.extraParams ?? {});
  const extraParams = useMemo(() => options.extraParams ?? {}, [extraKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce de la busqueda.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), debounceMs);
    return () => clearTimeout(t);
  }, [q, debounceMs]);

  // Cualquier cambio de filtro/orden vuelve a la pagina 1.
  useEffect(() => {
    setPageState(1);
  }, [debouncedQ, sort, dir, pageSize, extraKey, reloadKey]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const url = `${endpoint}${buildQuery({
      page,
      pageSize,
      sort,
      dir,
      q: debouncedQ || undefined,
      ...extraParams,
    })}`;
    try {
      const data = await api<Paginated<T>>(url);
      setRows(data.items);
      setTotal(data.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, pageSize, sort, dir, debouncedQ, extraParams, tick]);

  useEffect(() => {
    fetchData();
  }, [fetchData, reloadKey]);

  const toggleSort = useCallback(
    (key: string) => {
      // Importante: no anidar setDir dentro del updater de setSort. En StrictMode
      // el updater corre dos veces y la direccion se invertiria dos veces (queda igual).
      if (sort === key) {
        setDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSort(key);
        setDir("asc");
      }
    },
    [sort]
  );

  const setPageSize = useCallback((size: number) => setPageSizeState(size), []);
  const setPage = useCallback((p: number) => setPageState(p), []);
  const setQ = useCallback((value: string) => setQState(value), []);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    rows,
    total,
    page,
    pageSize,
    sort,
    dir,
    q,
    loading,
    setQ,
    setPageSize,
    setPage,
    toggleSort,
    reload,
  };
}
