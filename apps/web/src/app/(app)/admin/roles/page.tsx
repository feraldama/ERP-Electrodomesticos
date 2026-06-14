"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Module } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { Plus, Shield } from "lucide-react";

interface Role {
  id: number;
  nombre: string;
  descripcion: string | null;
  usuarios: number;
  permisos: string[];
}

export default function RolesPage() {
  const { notify } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selId, setSelId] = useState<number | "nuevo" | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [permisos, setPermisos] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  async function loadRoles() {
    try {
      setRoles(await api<Role[]>("/roles"));
    } catch {
      setRoles([]);
    }
  }

  useEffect(() => {
    loadRoles();
    api<Module[]>("/catalog/modules").then(setModules).catch(() => setModules([]));
  }, []);

  function seleccionar(r: Role) {
    setSelId(r.id);
    setNombre(r.nombre);
    setDescripcion(r.descripcion ?? "");
    setPermisos(new Set(r.permisos));
  }
  function nuevo() {
    setSelId("nuevo");
    setNombre("");
    setDescripcion("");
    setPermisos(new Set());
  }

  function toggle(codigo: string) {
    setPermisos((s) => {
      const next = new Set(s);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }
  function toggleModulo(mod: Module, all: boolean) {
    setPermisos((s) => {
      const next = new Set(s);
      for (const p of mod.programs) {
        if (all) next.add(p.codigo);
        else next.delete(p.codigo);
      }
      return next;
    });
  }

  async function guardar() {
    if (!nombre.trim()) return notify("error", "Indica el nombre del rol");
    setSaving(true);
    try {
      const body = JSON.stringify({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, permisos: [...permisos] });
      if (selId === "nuevo") {
        await api("/roles", { method: "POST", body });
        notify("success", "Rol creado");
      } else {
        await api(`/roles/${selId}`, { method: "PUT", body });
        notify("success", "Rol actualizado");
      }
      await loadRoles();
      setSelId(null);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const totalSel = permisos.size;
  const editing = selId !== null;

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Roles y permisos</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">ADMM001</span>
          </div>
          <p className="text-sm text-slate-500">Define que pantallas puede usar cada rol.</p>
        </div>
        <Button onClick={nuevo}><Plus className="h-4 w-4" /> Nuevo rol</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Lista de roles */}
        <div className="space-y-1">
          {roles.length === 0 ? (
            <p className="text-sm text-slate-400">No hay roles.</p>
          ) : (
            roles.map((r) => (
              <button key={r.id} onClick={() => seleccionar(r)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selId === r.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-slate-400" />
                  <span className="font-medium text-foreground">{r.nombre}</span>
                </span>
                <span className="text-xs text-slate-400">{r.usuarios} usr · {r.permisos.length} perm</span>
              </button>
            ))
          )}
        </div>

        {/* Editor */}
        {!editing ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-slate-400">
            Selecciona un rol o crea uno nuevo para editar sus permisos.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="nombre" required>
                <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej Cajero" />
              </Field>
              <Field label="Descripcion" htmlFor="desc">
                <Input id="desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
              </Field>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-secondary">Permisos (pantallas)</h2>
                <span className="text-xs text-slate-400">{totalSel} seleccionado(s)</span>
              </div>
              <div className="space-y-4">
                {modules.map((mod) => {
                  const codigos = mod.programs.map((p) => p.codigo);
                  const todos = codigos.length > 0 && codigos.every((c) => permisos.has(c));
                  return (
                    <div key={mod.id} className="rounded-lg border border-border">
                      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
                        <span className="text-sm font-medium text-foreground">{mod.nombre}</span>
                        <button type="button" onClick={() => toggleModulo(mod, !todos)}
                          className="cursor-pointer text-xs font-medium text-primary hover:underline">
                          {todos ? "Quitar todos" : "Marcar todos"}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-x-4 gap-y-1 p-3 sm:grid-cols-2">
                        {mod.programs.map((p) => (
                          <label key={p.codigo} className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
                            <input type="checkbox" checked={permisos.has(p.codigo)} onChange={() => toggle(p.codigo)}
                              className="h-4 w-4 cursor-pointer accent-accent" />
                            <span>{p.nombre}</span>
                            <span className="font-mono text-[10px] text-slate-400">{p.codigo}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelId(null)}>Cancelar</Button>
              <Button onClick={guardar} loading={saving}>{selId === "nuevo" ? "Crear rol" : "Guardar"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
