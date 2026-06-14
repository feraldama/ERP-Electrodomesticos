// Helpers compartidos para listados paginados y ordenables por columna.
//
// Los endpoints de listado aceptan los query params: page, pageSize, sort, dir.
// - `sort` es una CLAVE PUBLICA de columna que debe estar en el whitelist `sortable`.
// - `sortable` mapea esa clave a una ruta Prisma con puntos (ej. "brand.nombre"),
//   que se convierte en un orderBy anidado ({ brand: { nombre: dir } }).
// La respuesta uniforme es { items, total, page, pageSize }.

export type SortDir = "asc" | "desc";

/** Mapa whitelist: clave publica de columna -> ruta Prisma con puntos. */
export type SortableMap = Record<string, string>;

export interface ListConfig {
  sortable: SortableMap;
  /** Clave publica por defecto (debe existir en `sortable`). */
  defaultSort: string;
  defaultDir?: SortDir;
  defaultPageSize?: number;
  maxPageSize?: number;
}

export interface ParsedListParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  /** Clave publica de columna efectivamente usada. */
  sort: string;
  dir: SortDir;
  /** Objeto orderBy listo para pasar a Prisma findMany. */
  orderBy: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_PAGE_SIZE = 200;

/**
 * Paginacion opt-in: solo si la request trae page/pageSize.
 * Asi los combos/autocompletes que NO los mandan siguen recibiendo un array plano
 * (compatibilidad), y los listados (que usan useListQuery) reciben { items, total, ... }.
 */
export function wantsPagination(query: Record<string, unknown>): boolean {
  return query.page != null || query.pageSize != null;
}

function firstString(v: unknown): string | undefined {
  if (Array.isArray(v)) return firstString(v[0]);
  return typeof v === "string" ? v : undefined;
}

/** "brand.nombre" + "asc" -> { brand: { nombre: "asc" } } */
function buildOrderBy(path: string, dir: SortDir): Record<string, unknown> {
  const parts = path.split(".");
  return parts.reduceRight<Record<string, unknown>>(
    (acc, key, i) => ({ [key]: i === parts.length - 1 ? dir : acc }),
    {} as Record<string, unknown>
  );
}

/** Parsea page/pageSize/sort/dir desde req.query con un whitelist de columnas. */
export function parseListParams(
  query: Record<string, unknown>,
  config: ListConfig
): ParsedListParams {
  const defaultPageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = config.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;

  const pageNum = Number(firstString(query.page));
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;

  const sizeNum = Number(firstString(query.pageSize));
  const pageSize = Number.isFinite(sizeNum) && sizeNum >= 1
    ? Math.min(Math.floor(sizeNum), maxPageSize)
    : defaultPageSize;

  const sortRaw = firstString(query.sort);
  const sort = sortRaw && sortRaw in config.sortable ? sortRaw : config.defaultSort;

  const dirRaw = firstString(query.dir);
  const dir: SortDir = dirRaw === "desc" ? "desc" : dirRaw === "asc" ? "asc" : config.defaultDir ?? "asc";

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    sort,
    dir,
    orderBy: buildOrderBy(config.sortable[sort], dir),
  };
}

/** Envuelve los resultados en la forma de respuesta uniforme. */
export function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize };
}

/**
 * Azucar para listados: si la request pide paginacion devuelve { items, total, ... };
 * si no (combos/autocompletes) devuelve un array plano (legacy).
 * El caller provee los closures de findMany (con su where/include) y count.
 */
export async function listOrPaginate<T>(
  query: Record<string, unknown>,
  config: ListConfig,
  findMany: (opts: { orderBy: Record<string, unknown>; skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
  legacyTake = 200
): Promise<T[] | Paginated<T>> {
  const { skip, take, orderBy, page, pageSize } = parseListParams(query, config);
  if (!wantsPagination(query)) {
    return findMany({ orderBy, skip: 0, take: legacyTake });
  }
  const [items, total] = await Promise.all([findMany({ orderBy, skip, take }), count()]);
  return paginated(items, total, page, pageSize);
}
