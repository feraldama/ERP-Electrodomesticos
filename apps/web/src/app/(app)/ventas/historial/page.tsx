"use client";

import { useEffect, useMemo, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, hoyYmd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useListQuery } from "@/lib/useListQuery";
import type { Article, Branch, Brand, Category, Customer, Rubro, SalesHistoryRow, SalesHistorySummary } from "@/lib/types";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { CustomerPicker } from "@/components/CustomerPicker";
import { useToast } from "@/components/ui/Toast";
import { Download, ExternalLink, FilterX, X } from "lucide-react";

type Tab = "detalle" | "articulos";

// Fecha de documento (medianoche UTC): se muestra el dia tal cual, sin pasar a hora local.
const fmtFecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const signo = (n: number) => (n < 0 ? "text-destructive" : "");

// Abre la factura en otra pestaña para no perder los filtros del historial.
const abrirFactura = (r: SalesHistoryRow) => {
  if (r.invoiceId) window.open(`/ventas/listado?id=${r.invoiceId}`, "_blank", "noopener");
};

const columns: DataColumn<SalesHistoryRow>[] = [
  { key: "fecha", header: "Fecha", render: (r) => <span className="whitespace-nowrap text-slate-600">{fmtFecha(r.fecha)}</span> },
  {
    key: "comprobante",
    header: "Comprobante",
    render: (r) => (
      <div className="whitespace-nowrap">
        <div className="flex items-center gap-1.5 font-mono text-sm text-foreground">
          {r.comprobante}
          {r.invoiceId && <ExternalLink className="h-3 w-3 text-slate-300" aria-hidden />}
        </div>
        {r.tipo === "DEVOLUCION" ? (
          <span className="rounded bg-red-50 px-1.5 text-[11px] font-medium text-destructive">Devolucion</span>
        ) : (
          <div className="text-[11px] text-slate-400">{r.condicion === "CREDITO" ? "Credito" : "Contado"}</div>
        )}
      </div>
    ),
  },
  {
    key: "cliente",
    header: "Cliente",
    render: (r) => (
      <div>
        <div className="text-foreground">{r.cliente ?? "-"}</div>
        {r.clienteDoc && <div className="font-mono text-xs text-slate-400">{r.clienteDoc}</div>}
      </div>
    ),
  },
  {
    key: "articulo",
    header: "Articulo",
    render: (r) => (
      <div>
        <div className="text-foreground">{r.article.descripcion}</div>
        <div className="font-mono text-xs text-slate-400">{r.article.codigo}</div>
      </div>
    ),
  },
  { key: "vendedor", header: "Vendedor", render: (r) => <span className="text-slate-500">{r.vendedor ?? "-"}</span> },
  {
    key: "cantidad",
    header: "Cantidad",
    align: "right",
    render: (r) => <span className={cn("font-mono", signo(r.cantidad))}>{formatGs(r.cantidad)}</span>,
  },
  {
    header: "Precio unit.",
    align: "right",
    render: (r) => <span className="font-mono text-slate-500">{formatGs(r.precioUnitario)}</span>,
  },
  {
    key: "monto",
    header: "Monto",
    align: "right",
    render: (r) => <span className={cn("font-mono font-medium text-foreground", signo(r.monto))}>{formatGs(r.monto)}</span>,
  },
  {
    key: "margen",
    header: "Margen",
    align: "right",
    render: (r) => (
      <span className={cn("font-mono", r.margen < 0 ? "text-destructive" : "text-accent")} title={`Costo ${formatGs(r.costo)}`}>
        {formatGs(r.margen)}
      </span>
    ),
  },
];

export default function HistorialVentasPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>("detalle");

  // Catalogos para los filtros
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [vendedores, setVendedores] = useState<Array<{ id: number; nombre: string }>>([]);

  // Filtros
  const [article, setArticle] = useState<Pick<Article, "id" | "codigo" | "descripcion"> | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [rubroId, setRubroId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [condicion, setCondicion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [conDevoluciones, setConDevoluciones] = useState(true);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    api<Brand[]>("/brands").then(setBrands).catch(() => setBrands([]));
    api<Category[]>("/categories").then(setCategories).catch(() => setCategories([]));
    api<Rubro[]>("/rubros").then(setRubros).catch(() => setRubros([]));
    api<Branch[]>("/branches").then(setBranches).catch(() => setBranches([]));
    api<Array<{ id: number; nombre: string }>>("/sales/historial-articulos/vendedores").then(setVendedores).catch(() => setVendedores([]));
  }, [companyId]);

  const filtros = useMemo(
    () => ({
      articleId: article?.id,
      customerId: customer?.id,
      brandId: brandId || undefined,
      categoryId: categoryId || undefined,
      rubroId: rubroId || undefined,
      branchId: branchId || undefined,
      usuarioId: usuarioId || undefined,
      condicion: condicion || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    }),
    [article, customer, brandId, categoryId, rubroId, branchId, usuarioId, condicion, desde, hasta]
  );
  const hayFiltros = Object.values(filtros).some((v) => v !== undefined);
  // Parametros comunes a detalle, resumen y exportacion.
  const params = useMemo(() => ({ ...filtros, devoluciones: conDevoluciones ? undefined : "0" }), [filtros, conDevoluciones]);

  const list = useListQuery<SalesHistoryRow>("/sales/historial-articulos", {
    defaultSort: "fecha",
    defaultDir: "desc",
    pageSize: 25,
    extraParams: params,
    reloadKey: companyId,
  });

  const queryString = (extra: Record<string, string | number | undefined> = {}) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, q: list.q.trim() || undefined, ...extra })) {
      if (v !== undefined && v !== "") sp.set(k, String(v));
    }
    return sp.toString();
  };

  // Resumen con los mismos filtros (y la busqueda), con un pequeño debounce.
  const [resumen, setResumen] = useState<SalesHistorySummary | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const qsResumen = queryString();
  useEffect(() => {
    let vigente = true;
    setCargandoResumen(true);
    const t = setTimeout(() => {
      api<SalesHistorySummary>(`/sales/historial-articulos/resumen?${qsResumen}`)
        .then((r) => vigente && setResumen(r))
        .catch(() => vigente && setResumen(null))
        .finally(() => vigente && setCargandoResumen(false));
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [qsResumen, companyId]);

  async function exportar() {
    setExportando(true);
    try {
      await downloadFile(
        `/sales/historial-articulos/exportar?${queryString({ sort: list.sort, dir: list.dir })}`,
        `historial-ventas-${hoyYmd()}.csv`
      );
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  function limpiar() {
    setArticle(null);
    setCustomer(null);
    setBrandId("");
    setCategoryId("");
    setRubroId("");
    setBranchId("");
    setUsuarioId("");
    setCondicion("");
    setDesde("");
    setHasta("");
    list.setQ("");
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Historial de ventas por articulo</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">VENC012</span>
          </div>
          <p className="text-sm text-slate-500">Articulos vendidos por comprobante, cliente y fecha. No incluye ventas anuladas.</p>
        </div>
        <Button variant="outline" onClick={exportar} loading={exportando} disabled={list.total === 0}>
          <Download className="h-4 w-4" /> Exportar a Excel
        </Button>
      </div>

      {/* Filtros */}
      <section className="mb-4 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <span className="mb-1 block text-sm font-medium text-secondary">Producto</span>
            {article ? (
              <Chip onClear={() => setArticle(null)}>
                {article.descripcion} <span className="font-mono text-xs text-slate-500">{article.codigo}</span>
              </Chip>
            ) : (
              <ArticleAutocomplete onSelect={setArticle} placeholder="Buscar articulo por codigo o descripcion..." />
            )}
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-secondary">Cliente</span>
            {customer ? (
              <Chip onClear={() => setCustomer(null)}>{customer.person.razonSocial}</Chip>
            ) : (
              <CustomerPicker id="hv-cliente" selected={null} onSelect={setCustomer} />
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <FiltroSelect label="Marca" value={brandId} onChange={setBrandId} todos="Todas"
            options={brands.map((b) => ({ value: String(b.id), label: b.nombre }))} />
          <FiltroSelect label="Categoria" value={categoryId} onChange={setCategoryId} todos="Todas"
            options={categories.map((c) => ({ value: String(c.id), label: c.nombre }))} />
          <FiltroSelect label="Rubro" value={rubroId} onChange={setRubroId} todos="Todos"
            options={rubros.map((r) => ({ value: String(r.id), label: r.nombre }))} />
          <FiltroSelect label="Sucursal" value={branchId} onChange={setBranchId} todos="Todas"
            options={branches.map((b) => ({ value: String(b.id), label: `${b.codigo} - ${b.nombre}` }))} />
          <FiltroSelect label="Vendedor" value={usuarioId} onChange={setUsuarioId} todos="Todos"
            options={vendedores.map((v) => ({ value: String(v.id), label: v.nombre }))} />
          <FiltroSelect label="Condicion" value={condicion} onChange={setCondicion} todos="Todas"
            options={[{ value: "CONTADO", label: "Contado" }, { value: "CREDITO", label: "Credito" }]} />
          <div>
            <label htmlFor="hv-desde" className="mb-1 block text-sm font-medium text-secondary">Desde</label>
            <Input id="hv-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label htmlFor="hv-hasta" className="mb-1 block text-sm font-medium text-secondary">Hasta</label>
            <Input id="hv-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={conDevoluciones} onChange={(e) => setConDevoluciones(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-accent" />
            Descontar devoluciones (notas de credito)
          </label>
          {(hayFiltros || list.q) && (
            <button type="button" onClick={limpiar}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-secondary hover:bg-muted">
              <FilterX className="h-3.5 w-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {/* Cuadro de resumen */}
      <section className={cn("mb-5 grid grid-cols-2 gap-3 md:grid-cols-5", cargandoResumen && "opacity-60 transition-opacity")}>
        <Kpi label="Unidades vendidas" value={resumen ? formatGs(resumen.cantidad) : "—"} />
        <Kpi label={conDevoluciones ? "Monto neto" : "Monto vendido"} value={resumen ? `${formatGs(resumen.monto)} Gs` : "—"} destacado
          detalle={resumen && resumen.devoluciones > 0 ? `Devoluciones: −${formatGs(resumen.devoluciones)} Gs` : undefined} />
        <Kpi label="Margen bruto" value={resumen ? `${formatGs(resumen.margen)} Gs` : "—"}
          detalle={resumen?.margenPct != null ? `${resumen.margenPct}% sobre venta sin IVA` : undefined} />
        <Kpi label="Comprobantes" value={resumen ? formatGs(resumen.comprobantes) : "—"}
          detalle={resumen ? `${formatGs(resumen.clientes)} cliente${resumen.clientes === 1 ? "" : "s"}` : undefined} />
        <Kpi label="Ticket promedio" value={resumen ? `${formatGs(resumen.ticketPromedio)} Gs` : "—"} />
      </section>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div className="flex gap-1">
          {([["detalle", "Detalle de ventas"], ["articulos", "Resumen por articulo"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                tab === k ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-secondary"
              )}>
              {label}
            </button>
          ))}
        </div>
        <div className="mb-2 w-full sm:w-80">
          <Input placeholder="Buscar articulo, comprobante o cliente..." value={list.q} onChange={(e) => list.setQ(e.target.value)}
            aria-label="Buscar en el historial" />
        </div>
      </div>

      {tab === "detalle" ? (
        <>
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
            onRowClick={abrirFactura}
            emptyTitle={hayFiltros || list.q ? "Sin ventas para estos filtros" : "Todavia no hay ventas registradas"}
            emptyDescription={hayFiltros || list.q ? "Proba ampliando el rango de fechas o quitando filtros." : undefined}
          />
          <p className="mt-2 text-xs text-slate-400">
            Clic en una fila para ver la factura. Margen = venta sin IVA − costo promedio del articulo al vender.
          </p>
        </>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="w-10 px-3 py-2.5 text-right font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Articulo</th>
                <th className="px-3 py-2.5 font-medium">Marca / Categoria</th>
                <th className="px-3 py-2.5 text-right font-medium">Lineas</th>
                <th className="px-3 py-2.5 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                <th className="px-3 py-2.5 text-right font-medium">Margen</th>
                <th className="w-40 px-3 py-2.5 font-medium">% del monto</th>
              </tr>
            </thead>
            <tbody>
              {!resumen || resumen.articulos.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                  {cargandoResumen ? "Cargando..." : "Sin ventas para estos filtros."}
                </td></tr>
              ) : (
                resumen.articulos.map((a, i) => {
                  const pct = resumen.monto > 0 ? Math.max((a.monto / resumen.monto) * 100, 0) : 0;
                  return (
                    <tr key={a.articleId} title="Ver el detalle de este articulo"
                      onClick={() => { setArticle({ id: a.articleId, codigo: a.codigo, descripcion: a.descripcion }); setTab("detalle"); }}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="text-foreground">{a.descripcion}</div>
                        <div className="font-mono text-xs text-slate-400">{a.codigo}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{[a.marca, a.categoria].filter(Boolean).join(" · ") || "-"}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{formatGs(a.lineas)}</td>
                      <td className={cn("px-3 py-2 text-right font-mono", signo(a.cantidad))}>{formatGs(a.cantidad)}</td>
                      <td className={cn("px-3 py-2 text-right font-mono font-medium text-foreground", signo(a.monto))}>{formatGs(a.monto)}</td>
                      <td className={cn("px-3 py-2 text-right font-mono", a.margen < 0 ? "text-destructive" : "text-accent")}>
                        {formatGs(a.margen)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(Math.max(pct, 1), 100)}%` }} />
                          </div>
                          <span className="w-12 text-right font-mono text-xs text-slate-500">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {resumen && resumen.articulos.length === 50 && (
            <p className="border-t border-border px-3 py-2 text-xs text-slate-500">Se muestran los 50 articulos con mayor monto.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, destacado, detalle }: { label: string; value: string; destacado?: boolean; detalle?: string }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 shadow-sm", destacado ? "border-accent/30 bg-accent/5" : "border-border bg-white")}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 font-mono text-lg font-semibold", destacado ? "text-accent" : "text-foreground")}>{value}</div>
      {detalle && <div className="mt-0.5 text-xs text-slate-500">{detalle}</div>}
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground">
      <span className="truncate">{children}</span>
      <button type="button" onClick={onClear} aria-label="Quitar filtro"
        className="cursor-pointer rounded p-1 text-slate-400 hover:bg-white hover:text-secondary">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function FiltroSelect({ label, value, onChange, options, todos }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  todos: string;
}) {
  const id = `hv-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-secondary">{label}</label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{todos}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  );
}
