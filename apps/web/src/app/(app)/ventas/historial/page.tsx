"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatGs } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useListQuery } from "@/lib/useListQuery";
import type { Article, Branch, Brand, Category, Customer, Rubro, SalesHistoryRow, SalesHistorySummary } from "@/lib/types";
import { Input, Select } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ArticleAutocomplete } from "@/components/ArticleAutocomplete";
import { CustomerPicker } from "@/components/CustomerPicker";
import { FilterX, X } from "lucide-react";

type Tab = "detalle" | "articulos";

const columns: DataColumn<SalesHistoryRow>[] = [
  { key: "fecha", header: "Fecha", render: (r) => <span className="whitespace-nowrap text-slate-600">{formatDate(r.fecha)}</span> },
  {
    key: "comprobante",
    header: "Comprobante",
    render: (r) => (
      <div className="whitespace-nowrap">
        <div className="font-mono text-sm text-foreground">{r.comprobante}</div>
        <div className="text-[11px] text-slate-400">{r.condicion === "CREDITO" ? "Credito" : "Contado"}</div>
      </div>
    ),
  },
  {
    key: "cliente",
    header: "Cliente",
    render: (r) => (
      <div>
        <div className="text-foreground">{r.cliente}</div>
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
  { key: "cantidad", header: "Cantidad", align: "right", render: (r) => <span className="font-mono">{formatGs(r.cantidad)}</span> },
  {
    header: "Precio unit.",
    align: "right",
    render: (r) => <span className="font-mono text-slate-500">{formatGs(r.precioUnitario)}</span>,
  },
  { key: "monto", header: "Monto", align: "right", render: (r) => <span className="font-mono font-medium text-foreground">{formatGs(r.monto)}</span> },
];

export default function HistorialVentasPage() {
  const { companyId } = useAuth();
  const [tab, setTab] = useState<Tab>("detalle");

  // Catalogos para los filtros
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Filtros
  const [article, setArticle] = useState<Pick<Article, "id" | "codigo" | "descripcion"> | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [rubroId, setRubroId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [condicion, setCondicion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    api<Brand[]>("/brands").then(setBrands).catch(() => setBrands([]));
    api<Category[]>("/categories").then(setCategories).catch(() => setCategories([]));
    api<Rubro[]>("/rubros").then(setRubros).catch(() => setRubros([]));
    api<Branch[]>("/branches").then(setBranches).catch(() => setBranches([]));
  }, [companyId]);

  const filtros = useMemo(
    () => ({
      articleId: article?.id,
      customerId: customer?.id,
      brandId: brandId || undefined,
      categoryId: categoryId || undefined,
      rubroId: rubroId || undefined,
      branchId: branchId || undefined,
      condicion: condicion || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    }),
    [article, customer, brandId, categoryId, rubroId, branchId, condicion, desde, hasta]
  );
  const hayFiltros = Object.values(filtros).some((v) => v !== undefined);

  const list = useListQuery<SalesHistoryRow>("/sales/historial-articulos", {
    defaultSort: "fecha",
    defaultDir: "desc",
    pageSize: 25,
    extraParams: filtros,
    reloadKey: companyId,
  });

  // Resumen con los mismos filtros (y la busqueda), con un pequeño debounce.
  const [resumen, setResumen] = useState<SalesHistorySummary | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filtros, q: list.q.trim() || undefined })) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    let vigente = true;
    setCargandoResumen(true);
    const t = setTimeout(() => {
      api<SalesHistorySummary>(`/sales/historial-articulos/resumen?${params}`)
        .then((r) => vigente && setResumen(r))
        .catch(() => vigente && setResumen(null))
        .finally(() => vigente && setCargandoResumen(false));
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [filtros, list.q, companyId]);

  function limpiar() {
    setArticle(null);
    setCustomer(null);
    setBrandId("");
    setCategoryId("");
    setRubroId("");
    setBranchId("");
    setCondicion("");
    setDesde("");
    setHasta("");
    list.setQ("");
  }

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Historial de ventas por articulo</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">VENC012</span>
        </div>
        <p className="text-sm text-slate-500">Articulos vendidos por comprobante, cliente y fecha. No incluye ventas anuladas.</p>
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
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <FiltroSelect label="Marca" value={brandId} onChange={setBrandId} todos="Todas"
            options={brands.map((b) => ({ value: String(b.id), label: b.nombre }))} />
          <FiltroSelect label="Categoria" value={categoryId} onChange={setCategoryId} todos="Todas"
            options={categories.map((c) => ({ value: String(c.id), label: c.nombre }))} />
          <FiltroSelect label="Rubro" value={rubroId} onChange={setRubroId} todos="Todos"
            options={rubros.map((r) => ({ value: String(r.id), label: r.nombre }))} />
          <FiltroSelect label="Sucursal" value={branchId} onChange={setBranchId} todos="Todas"
            options={branches.map((b) => ({ value: String(b.id), label: `${b.codigo} - ${b.nombre}` }))} />
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
        {(hayFiltros || list.q) && (
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={limpiar}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-secondary hover:bg-muted">
              <FilterX className="h-3.5 w-3.5" /> Limpiar filtros
            </button>
          </div>
        )}
      </section>

      {/* Cuadro de resumen */}
      <section className={cn("mb-5 grid grid-cols-2 gap-3 md:grid-cols-5", cargandoResumen && "opacity-60 transition-opacity")}>
        <Kpi label="Unidades vendidas" value={resumen ? formatGs(resumen.cantidad) : "—"} />
        <Kpi label="Monto vendido" value={resumen ? `${formatGs(resumen.monto)} Gs` : "—"} destacado />
        <Kpi label="Comprobantes" value={resumen ? formatGs(resumen.comprobantes) : "—"} />
        <Kpi label="Clientes" value={resumen ? formatGs(resumen.clientes) : "—"} />
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
          emptyTitle={hayFiltros || list.q ? "Sin ventas para estos filtros" : "Todavia no hay ventas registradas"}
          emptyDescription={hayFiltros || list.q ? "Proba ampliando el rango de fechas o quitando filtros." : undefined}
        />
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
                <th className="w-40 px-3 py-2.5 font-medium">% del monto</th>
              </tr>
            </thead>
            <tbody>
              {!resumen || resumen.articulos.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  {cargandoResumen ? "Cargando..." : "Sin ventas para estos filtros."}
                </td></tr>
              ) : (
                resumen.articulos.map((a, i) => {
                  const pct = resumen.monto ? (a.monto / resumen.monto) * 100 : 0;
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
                      <td className="px-3 py-2 text-right font-mono">{formatGs(a.cantidad)}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-foreground">{formatGs(a.monto)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
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

function Kpi({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 shadow-sm", destacado ? "border-accent/30 bg-accent/5" : "border-border bg-white")}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 font-mono text-lg font-semibold", destacado ? "text-accent" : "text-foreground")}>{value}</div>
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
