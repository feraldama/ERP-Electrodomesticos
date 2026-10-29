"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ChartAccount, ChartAccountMovimiento, CuentaTipo } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  Plus, Pencil, Trash2, Search, ChevronRight, ChevronDown, Folder, FolderOpen, FileText,
  ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, Check, X,
} from "lucide-react";

const TIPOS: CuentaTipo[] = ["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "EGRESO", "ORDEN"];

const TIPO_LABEL: Record<CuentaTipo, string> = {
  ACTIVO: "Activo",
  PASIVO: "Pasivo",
  PATRIMONIO: "Patrimonio",
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
  ORDEN: "Orden",
};

const TIPO_BADGE: Record<CuentaTipo, string> = {
  ACTIVO: "bg-sky-100 text-sky-700",
  PASIVO: "bg-amber-100 text-amber-700",
  PATRIMONIO: "bg-violet-100 text-violet-700",
  INGRESO: "bg-emerald-100 text-emerald-700",
  EGRESO: "bg-red-100 text-red-700",
  ORDEN: "bg-slate-100 text-slate-500",
};

const TIPO_DOT: Record<CuentaTipo, string> = {
  ACTIVO: "bg-sky-600",
  PASIVO: "bg-amber-600",
  PATRIMONIO: "bg-violet-600",
  INGRESO: "bg-emerald-600",
  EGRESO: "bg-red-600",
  ORDEN: "bg-slate-400",
};

const TIPO_ICON: Record<CuentaTipo, string> = {
  ACTIVO: "text-sky-600",
  PASIVO: "text-amber-600",
  PATRIMONIO: "text-violet-600",
  INGRESO: "text-emerald-600",
  EGRESO: "text-red-600",
  ORDEN: "text-slate-400",
};

// Saldo en el sentido natural de la cuenta: deudoras (activo, egreso, orden) debe - haber,
// acreedoras (pasivo, patrimonio, ingreso) haber - debe.
const DEUDORA: Record<CuentaTipo, boolean> = {
  ACTIVO: true, EGRESO: true, ORDEN: true, PASIVO: false, PATRIMONIO: false, INGRESO: false,
};

interface Nodo {
  cuenta: ChartAccount;
  hijos: Nodo[];
  nivel: number;
  debe: number;
  haber: number;
  saldo: number;
  descendientes: number;
}

function fmtFecha(iso: string) {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

// Arma el arbol por parentId (una cuenta con padre inexistente queda como raiz) y
// acumula debe/haber de las subcuentas en cada grupo.
function armarArbol(cuentas: ChartAccount[]) {
  const porId = new Map<number, Nodo>();
  for (const c of cuentas) porId.set(c.id, { cuenta: c, hijos: [], nivel: 0, debe: 0, haber: 0, saldo: 0, descendientes: 0 });
  const raices: Nodo[] = [];
  for (const n of porId.values()) {
    const padre = n.cuenta.parentId ? porId.get(n.cuenta.parentId) : undefined;
    if (padre) padre.hijos.push(n);
    else raices.push(n);
  }
  const porCodigo = (a: Nodo, b: Nodo) => a.cuenta.codigo.localeCompare(b.cuenta.codigo, "es", { numeric: true });
  function recorrer(n: Nodo, nivel: number) {
    n.nivel = nivel;
    n.hijos.sort(porCodigo);
    n.debe = n.cuenta.debe ?? 0;
    n.haber = n.cuenta.haber ?? 0;
    n.descendientes = 0;
    for (const h of n.hijos) {
      recorrer(h, nivel + 1);
      n.debe += h.debe;
      n.haber += h.haber;
      n.descendientes += 1 + h.descendientes;
    }
    n.saldo = DEUDORA[n.cuenta.tipo] ? n.debe - n.haber : n.haber - n.debe;
  }
  raices.sort(porCodigo);
  for (const r of raices) recorrer(r, 0);
  return { raices, porId };
}

function Saldo({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums", valor < 0 ? "text-destructive" : valor === 0 ? "text-slate-300" : "text-foreground", className)}>
      {valor < 0 ? `(${formatGs(-valor)})` : formatGs(valor)}
    </span>
  );
}

export default function PlanCuentasPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<CuentaTipo | null>(null);
  // Por defecto se ocultan: no admiten asientos y suelen ser planes viejos.
  const [ocultarInactivas, setOcultarInactivas] = useState(true);
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set());
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [movimientos, setMovimientos] = useState<ChartAccountMovimiento[] | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<CuentaTipo>("ACTIVO");
  const [parentId, setParentId] = useState("");
  const [imputable, setImputable] = useState(true);
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<ChartAccount[]>("/contabilidad/plan-cuentas")
      .then(setCuentas)
      .catch(() => setCuentas([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, companyId]);

  const { raices, porId } = useMemo(() => armarArbol(cuentas), [cuentas]);

  // Al cargar por primera vez se abren las raices para ver el primer nivel.
  useEffect(() => {
    setExpandidas((prev) => (prev.size ? prev : new Set(raices.map((r) => r.cuenta.id))));
  }, [raices]);

  const seleccionada = seleccion ? porId.get(seleccion) ?? null : null;

  useEffect(() => {
    if (!seleccion) {
      setMovimientos(null);
      return;
    }
    let vigente = true;
    setMovimientos(null);
    api<ChartAccountMovimiento[]>(`/contabilidad/plan-cuentas/${seleccion}/movimientos?limit=6`)
      .then((m) => vigente && setMovimientos(m))
      .catch(() => vigente && setMovimientos([]));
    return () => {
      vigente = false;
    };
  }, [seleccion, cuentas]);

  const conteoTipo = useMemo(() => {
    const c = Object.fromEntries(TIPOS.map((t) => [t, 0])) as Record<CuentaTipo, number>;
    for (const x of cuentas) c[x.tipo]++;
    return c;
  }, [cuentas]);

  // Filas visibles. Con busqueda o filtro activo se muestran las coincidencias con sus
  // ancestros, todo expandido; si no, se respeta lo que el usuario abrio.
  const filtrando = busqueda.trim() !== "" || filtroTipo !== null;
  const filas = useMemo(() => {
    const palabras = busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const coincide = (c: ChartAccount) => {
      if (filtroTipo && c.tipo !== filtroTipo) return false;
      const texto = `${c.codigo} ${c.nombre}`.toLowerCase();
      return palabras.every((p) => texto.includes(p));
    };
    const visible = new Map<number, boolean>();
    function marcar(n: Nodo): boolean {
      if (ocultarInactivas && !n.cuenta.activo) return false;
      let algunHijo = false;
      for (const h of n.hijos) if (marcar(h)) algunHijo = true;
      const v = algunHijo || (filtrando ? coincide(n.cuenta) : true);
      visible.set(n.cuenta.id, v);
      return v;
    }
    raices.forEach(marcar);

    const out: Nodo[] = [];
    function agregar(n: Nodo) {
      if (!visible.get(n.cuenta.id)) return;
      out.push(n);
      if (filtrando || expandidas.has(n.cuenta.id)) n.hijos.forEach(agregar);
    }
    raices.forEach(agregar);
    return out;
  }, [raices, busqueda, filtroTipo, filtrando, ocultarInactivas, expandidas]);

  function toggle(id: number) {
    setExpandidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }
  const expandirTodo = () => setExpandidas(new Set(cuentas.filter((c) => porId.get(c.id)?.hijos.length).map((c) => c.id)));
  const contraerTodo = () => setExpandidas(new Set());

  function ruta(n: Nodo) {
    const out: ChartAccount[] = [];
    let p = n.cuenta.parentId ? porId.get(n.cuenta.parentId) : undefined;
    while (p) {
      out.unshift(p.cuenta);
      p = p.cuenta.parentId ? porId.get(p.cuenta.parentId) : undefined;
    }
    return out;
  }

  function nuevo(padre?: ChartAccount) {
    setEditing(null);
    setCodigo("");
    setNombre("");
    setTipo(padre?.tipo ?? "ACTIVO");
    setParentId(padre ? String(padre.id) : "");
    setImputable(true);
    setActivo(true);
    setDirty(false);
    setOpen(true);
  }
  function editar(c: ChartAccount) {
    setEditing(c);
    setCodigo(c.codigo);
    setNombre(c.nombre);
    setTipo(c.tipo);
    setParentId(c.parentId ? String(c.parentId) : "");
    setImputable(c.imputable);
    setActivo(c.activo);
    setDirty(false);
    setOpen(true);
  }

  async function guardar() {
    if (!codigo.trim()) return notify("error", "Indica el codigo");
    if (!nombre.trim()) return notify("error", "Indica el nombre");
    setSaving(true);
    const body = JSON.stringify({
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      tipo,
      parentId: parentId ? Number(parentId) : null,
      imputable,
      activo,
    });
    try {
      if (editing) {
        await api(`/contabilidad/plan-cuentas/${editing.id}`, { method: "PUT", body });
        notify("success", "Cuenta actualizada");
      } else {
        await api("/contabilidad/plan-cuentas", { method: "POST", body });
        notify("success", "Cuenta creada");
        // Que la nueva subcuenta quede a la vista.
        if (parentId) setExpandidas((prev) => new Set(prev).add(Number(parentId)));
      }
      setOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    if (!editing) return;
    const ok = await confirm({
      title: "Eliminar cuenta",
      description: `Vas a eliminar "${editing.codigo} - ${editing.nombre}". Esta accion no se puede deshacer.`,
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api(`/contabilidad/plan-cuentas/${editing.id}`, { method: "DELETE" });
      notify("success", "Cuenta eliminada");
      if (seleccion === editing.id) setSeleccion(null);
      setOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo eliminar (puede tener movimientos o subcuentas)");
    } finally {
      setSaving(false);
    }
  }

  const imputables = cuentas.filter((c) => c.imputable).length;
  const inactivas = cuentas.filter((c) => !c.activo).length;

  return (
    <div className="max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Plan de cuentas</h1>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-500">CONM001</span>
          </div>
          <p className="text-sm text-slate-500">
            {cuentas.length} cuentas · {imputables} imputables{inactivas ? ` · ${inactivas} inactivas` : ""}
          </p>
        </div>
        <Button onClick={() => nuevo()}><Plus className="h-4 w-4" /> Nueva cuenta</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por codigo o nombre..."
            className="pl-9 pr-8"
            aria-label="Buscar cuenta"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")} aria-label="Limpiar busqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-slate-400 hover:text-secondary">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFiltroTipo(null)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filtroTipo === null ? "border-primary bg-primary text-white" : "border-border bg-white text-secondary hover:bg-muted"
            )}
          >
            Todas <span className={cn("font-mono", filtroTipo === null ? "text-slate-300" : "text-slate-400")}>{cuentas.length}</span>
          </button>
          {TIPOS.filter((t) => conteoTipo[t] > 0).map((t) => (
            <button
              key={t}
              onClick={() => setFiltroTipo(filtroTipo === t ? null : t)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filtroTipo === t ? "border-primary bg-primary text-white" : "border-border bg-white text-secondary hover:bg-muted"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", TIPO_DOT[t])} />
              {TIPO_LABEL[t]}
              <span className={cn("font-mono", filtroTipo === t ? "text-slate-300" : "text-slate-400")}>{conteoTipo[t]}</span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={contraerTodo} disabled={filtrando}>
            <ChevronsDownUp className="h-3.5 w-3.5" /> Contraer
          </Button>
          <Button variant="ghost" size="sm" onClick={expandirTodo} disabled={filtrando}>
            <ChevronsUpDown className="h-3.5 w-3.5" /> Expandir
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOcultarInactivas((v) => !v)} aria-pressed={ocultarInactivas}>
            {ocultarInactivas ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {ocultarInactivas ? "Mostrar inactivas" : "Ocultar inactivas"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-36 px-4 py-2.5 font-semibold">Codigo</th>
                  <th className="px-3 py-2.5 font-semibold">Cuenta</th>
                  <th className="w-28 px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="w-24 px-3 py-2.5 text-center font-semibold">Imputable</th>
                  <th className="w-40 px-4 py-2.5 text-right font-semibold">Saldo</th>
                  <th className="w-12 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Cargando...</td></tr>
                ) : filas.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {cuentas.length === 0 ? "Sin cuentas." : "Ninguna cuenta coincide con la busqueda."}
                  </td></tr>
                ) : (
                  filas.map((n) => {
                    const c = n.cuenta;
                    const raiz = n.nivel === 0;
                    const grupo = n.hijos.length > 0;
                    const abierta = filtrando || expandidas.has(c.id);
                    const sel = seleccion === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSeleccion(sel ? null : c.id)}
                        className={cn(
                          "group cursor-pointer border-b border-border last:border-0 transition-colors",
                          sel ? "bg-blue-50 shadow-[inset_3px_0_0_0_#3b82f6]" : raiz ? "bg-slate-50/60 hover:bg-muted/70" : "hover:bg-muted/50",
                          !c.activo && "opacity-50"
                        )}
                      >
                        <td className={cn("whitespace-nowrap px-4 py-2 font-mono text-xs", raiz ? "font-semibold text-foreground" : "text-secondary")}>
                          {c.codigo}
                        </td>
                        <td className="py-0 pl-2 pr-3">
                          <div className="flex h-10 items-center">
                            {Array.from({ length: n.nivel }).map((_, i) => (
                              <span key={i} className="flex h-full w-5 shrink-0 justify-center">
                                <span className="h-full w-px bg-slate-200" />
                              </span>
                            ))}
                            {grupo ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggle(c.id); }}
                                disabled={filtrando}
                                aria-expanded={abierta}
                                aria-label={abierta ? `Contraer ${c.nombre}` : `Expandir ${c.nombre}`}
                                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:cursor-default disabled:hover:bg-transparent"
                              >
                                {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            ) : (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                                <span className="h-1 w-1 rounded-full bg-slate-300" />
                              </span>
                            )}
                            {c.imputable ? (
                              <FileText className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                            ) : abierta && grupo ? (
                              <FolderOpen className={cn("mr-2 h-4 w-4 shrink-0", TIPO_ICON[c.tipo])} />
                            ) : (
                              <Folder className={cn("mr-2 h-4 w-4 shrink-0", TIPO_ICON[c.tipo])} />
                            )}
                            <span className={cn("truncate text-foreground", !c.imputable && "font-semibold")} title={c.nombre}>
                              {c.nombre}
                            </span>
                            {grupo && (
                              <span className="ml-2 shrink-0 rounded-full bg-muted px-1.5 font-mono text-[10px] text-slate-500">
                                {n.hijos.length}
                              </span>
                            )}
                            {!c.activo && (
                              <span className="ml-2 shrink-0 rounded border border-slate-300 px-1.5 text-[10px] text-slate-500">Inactiva</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {raiz ? (
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide", TIPO_BADGE[c.tipo])}>{c.tipo}</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className={cn("h-1.5 w-1.5 rounded-full", TIPO_DOT[c.tipo])} />
                              {TIPO_LABEL[c.tipo]}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.imputable ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-accent">
                              <Check className="h-3 w-3" /> Si
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Grupo</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                          <Saldo valor={n.saldo} className={cn(raiz && "font-semibold")} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={(e) => { e.stopPropagation(); editar(c); }} aria-label={`Editar ${c.nombre}`}
                            className={cn(
                              "cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                              sel ? "text-primary" : "text-slate-300 group-hover:text-slate-500"
                            )}>
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            <span>Mostrando {filas.length} de {cuentas.length} cuentas</span>
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><Folder className="h-3.5 w-3.5 text-slate-400" /> Cuenta de grupo</span>
              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-slate-400" /> Imputable (admite asientos)</span>
            </span>
          </div>
        </div>

        <aside className="overflow-hidden rounded-xl border border-border bg-white shadow-sm xl:sticky xl:top-4">
          {!seleccionada ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <FolderOpen className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-secondary">Selecciona una cuenta</p>
              <p className="mt-1 text-xs text-slate-400">Vas a ver su saldo, el debe/haber acumulado y los ultimos movimientos.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2.5 border-b border-border p-5">
                {ruta(seleccionada).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                    {ruta(seleccionada).map((p, i) => (
                      <Fragment key={p.id}>
                        {i > 0 && <ChevronRight className="h-3 w-3 text-slate-400" />}
                        <button onClick={() => setSeleccion(p.id)} className="cursor-pointer hover:text-primary hover:underline">{p.nombre}</button>
                      </Fragment>
                    ))}
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold leading-snug text-foreground">{seleccionada.cuenta.nombre}</h2>
                  <button onClick={() => setSeleccion(null)} aria-label="Cerrar detalle"
                    className="-mr-1 cursor-pointer rounded p-1 text-slate-400 hover:bg-muted hover:text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-primary">{seleccionada.cuenta.codigo}</span>
                  <span className={cn("rounded-full px-2 py-0.5", TIPO_BADGE[seleccionada.cuenta.tipo])}>{TIPO_LABEL[seleccionada.cuenta.tipo]}</span>
                  {seleccionada.cuenta.imputable ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Imputable</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Grupo · {seleccionada.descendientes} subcuentas</span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{seleccionada.cuenta.activo ? "Activa" : "Inactiva"}</span>
                </div>
              </div>

              <div className="border-b border-border p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Saldo {DEUDORA[seleccionada.cuenta.tipo] ? "deudor" : "acreedor"}
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  <span className="mr-1.5 text-sm font-medium text-slate-400">Gs.</span>
                  <Saldo valor={seleccionada.saldo} />
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Debe</p>
                    <p className="font-mono text-sm font-medium tabular-nums text-foreground">{formatGs(seleccionada.debe)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Haber</p>
                    <p className="font-mono text-sm font-medium tabular-nums text-foreground">{formatGs(seleccionada.haber)}</p>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Ultimos movimientos</h3>
                  {seleccionada.cuenta.imputable && (
                    <Link href={`/contabilidad/mayor?accountId=${seleccionada.cuenta.id}`} className="text-xs font-medium text-accent hover:underline">
                      Ver mayor →
                    </Link>
                  )}
                </div>
                {movimientos === null ? (
                  <p className="py-4 text-center text-xs text-slate-400">Cargando...</p>
                ) : movimientos.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">Sin movimientos registrados.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {movimientos.map((m) => {
                      const importe = DEUDORA[seleccionada.cuenta.tipo] ? m.debe - m.haber : m.haber - m.debe;
                      return (
                        <li key={m.id} className="flex items-start gap-3 py-2">
                          <span className="pt-0.5 font-mono text-[11px] text-slate-400">{fmtFecha(m.fecha)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-secondary" title={m.glosa}>{m.glosa}</span>
                            {m.cuenta && <span className="block truncate text-[10px] text-slate-400">{m.cuenta.nombre}</span>}
                          </span>
                          <span className={cn("whitespace-nowrap font-mono text-xs font-medium tabular-nums", importe >= 0 ? "text-accent" : "text-destructive")}>
                            {importe >= 0 ? "+" : "−"} {formatGs(Math.abs(importe))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex gap-2 px-5 pb-5">
                <Button variant="outline" className="flex-1" onClick={() => editar(seleccionada.cuenta)}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => nuevo(seleccionada.cuenta)}>
                  <Plus className="h-4 w-4" /> Subcuenta
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar cuenta ${editing.codigo}` : "Nueva cuenta"}
        confirmClose={dirty}
        footer={
          <>
            {editing && (
              <Button variant="danger" type="button" onClick={eliminar} loading={saving} className="mr-auto">
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            )}
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={guardar} loading={saving}>{editing ? "Guardar" : "Crear"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Codigo" htmlFor="cod" required>
            <Input id="cod" value={codigo} onChange={(e) => { setCodigo(e.target.value); setDirty(true); }} placeholder="ej 1-01-01-02-01-00" />
          </Field>
          <Field label="Nombre" htmlFor="nom" required>
            <Input id="nom" value={nombre} onChange={(e) => { setNombre(e.target.value); setDirty(true); }} />
          </Field>
          <Field label="Tipo" htmlFor="tipo">
            <Select id="tipo" value={tipo} onChange={(e) => { setTipo(e.target.value as CuentaTipo); setDirty(true); }}>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Cuenta padre" htmlFor="parent">
            <Select id="parent" value={parentId} onChange={(e) => { setParentId(e.target.value); setDirty(true); }}>
              <option value="">-- Ninguna (raiz) --</option>
              {cuentas.filter((c) => c.id !== editing?.id).map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
              ))}
            </Select>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={imputable} onChange={(e) => { setImputable(e.target.checked); setDirty(true); }} className="h-4 w-4 cursor-pointer accent-accent" />
            Imputable (admite movimientos)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={activo} onChange={(e) => { setActivo(e.target.checked); setDirty(true); }} className="h-4 w-4 cursor-pointer accent-accent" />
            Activa
          </label>
        </div>
      </Modal>
    </div>
  );
}
