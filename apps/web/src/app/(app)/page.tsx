"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { DashboardStats, Module } from "@/lib/types";
import { ModuleIcon } from "@/components/ModuleIcon";
import { Package, Warehouse, ShoppingCart, Users, type LucideIcon } from "lucide-react";

// Acento de color por modulo (sobrio)
const MODULE_COLOR: Record<string, string> = {
  STK: "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
  COM: "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
  VEN: "bg-accent/10 text-accent group-hover:bg-accent/20",
  FIN: "bg-violet-50 text-violet-600 group-hover:bg-violet-100",
  CON: "bg-slate-100 text-slate-600 group-hover:bg-slate-200",
};

interface Kpi {
  label: string;
  value: string;
  hint?: string;
  Icon: LucideIcon;
  color: string;
}

export default function DashboardPage() {
  const { companyId } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Module[]>("/catalog/modules").then(setModules).catch(() => setModules([])),
      api<DashboardStats>("/dashboard/stats").then(setStats).catch(() => setStats(null)),
    ]).finally(() => setLoading(false));
  }, [companyId]);

  const kpis: Kpi[] = stats
    ? [
        {
          label: "Articulos activos",
          value: stats.articulos.toLocaleString("es-PY"),
          Icon: Package,
          color: "bg-blue-50 text-blue-600",
        },
        {
          label: "Valor en stock",
          value: formatGs(stats.valorStock),
          hint: `${stats.unidadesStock.toLocaleString("es-PY")} unidades`,
          Icon: Warehouse,
          color: "bg-accent/10 text-accent",
        },
        {
          label: "Compras",
          value: stats.comprasCount.toLocaleString("es-PY"),
          hint: `${formatGs(stats.comprasTotal)} Gs`,
          Icon: ShoppingCart,
          color: "bg-amber-50 text-amber-600",
        },
        {
          label: "Clientes / Proveedores",
          value: `${stats.clientes} / ${stats.proveedores}`,
          Icon: Users,
          color: "bg-violet-50 text-violet-600",
        },
      ]
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Inicio</h1>
        <p className="text-sm text-slate-500">Resumen de la empresa y acceso a los modulos</p>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading || !stats
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-white" />
            ))
          : kpis.map((k) => (
              <div key={k.label} className="flex items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${k.color}`}>
                  <k.Icon className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className="truncate font-mono text-xl font-semibold text-foreground">{k.value}</p>
                  {k.hint && <p className="truncate text-xs text-slate-500">{k.hint}</p>}
                </div>
              </div>
            ))}
      </div>

      {/* Modulos */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Modulos</h2>
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {modules.map((m) => (
            <Link
              key={m.id}
              href={`/modulo/${m.codigo}`}
              className="group flex cursor-pointer flex-col items-center rounded-xl border border-border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors duration-200 ${MODULE_COLOR[m.codigo] ?? "bg-muted text-slate-500"}`}>
                <ModuleIcon codigo={m.codigo} className="h-7 w-7" />
              </div>
              <span className="mt-4 text-center text-sm font-semibold uppercase tracking-wide text-secondary">
                {m.nombre}
              </span>
              <span className="mt-1 font-mono text-xs text-slate-500">{m.programs.length} programas</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
