"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Module, ProgramCategoria } from "@/lib/types";
import { Input } from "@/components/ui/Field";
import { SlidersHorizontal, ArrowLeftRight, Search, List, Cog, type LucideIcon } from "lucide-react";

const CAT_ICON: Record<ProgramCategoria, LucideIcon> = {
  MANTENIMIENTOS: SlidersHorizontal,
  MOVIMIENTOS: ArrowLeftRight,
  CONSULTAS: Search,
  LISTADOS: List,
  PROCESOS: Cog,
};

const CATEGORIAS: Array<{ key: "TODOS" | ProgramCategoria; label: string }> = [
  { key: "TODOS", label: "Todos" },
  { key: "MANTENIMIENTOS", label: "Mantenimientos" },
  { key: "MOVIMIENTOS", label: "Movimientos" },
  { key: "CONSULTAS", label: "Consultas" },
  { key: "LISTADOS", label: "Listados" },
  { key: "PROCESOS", label: "Procesos" },
];

export default function ModulePage() {
  const params = useParams<{ codigo: string }>();
  const codigo = params.codigo?.toUpperCase();
  const [mod, setMod] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"TODOS" | ProgramCategoria>("TODOS");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!codigo) return;
    setLoading(true);
    api<Module>(`/catalog/modules/${codigo}/programs`)
      .then(setMod)
      .catch(() => setMod(null))
      .finally(() => setLoading(false));
  }, [codigo]);

  const programs = useMemo(() => {
    if (!mod) return [];
    return mod.programs.filter((p) => {
      const okCat = filtro === "TODOS" || p.categoria === filtro;
      const okQ =
        !q ||
        p.nombre.toLowerCase().includes(q.toLowerCase()) ||
        p.codigo.toLowerCase().includes(q.toLowerCase());
      return okCat && okQ;
    });
  }, [mod, filtro, q]);

  if (loading) return <p className="text-slate-400">Cargando...</p>;
  if (!mod) return <p className="text-slate-500">Modulo no encontrado.</p>;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground">{mod.nombre}</h1>
        <p className="text-sm text-slate-500">Programas del modulo</p>
      </div>

      {/* Buscador + tabs */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-60">
          <Input placeholder="Buscar programa..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {CATEGORIAS.map((c) => (
            <button
              key={c.key}
              onClick={() => setFiltro(c.key)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                filtro === c.key ? "bg-primary text-white" : "text-secondary hover:bg-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {programs.length === 0 ? (
        <p className="text-slate-400">No hay programas para este filtro.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {programs.map((p) => {
            const Icon = CAT_ICON[p.categoria];
            const card = (
              <div className="flex h-full cursor-pointer flex-col justify-between rounded-xl border border-border bg-white p-4 shadow-sm transition-all duration-200 hover:border-accent hover:shadow-md">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div className="min-h-[2.5rem] text-sm font-medium leading-snug text-foreground">
                  {p.nombre}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-secondary">{p.codigo}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {p.categoria}
                  </span>
                </div>
              </div>
            );
            return p.ruta ? (
              <Link key={p.id} href={p.ruta} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl">
                {card}
              </Link>
            ) : (
              <div key={p.id}>{card}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
