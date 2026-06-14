"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ChartAccount, CuentaTipo } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

const TIPOS: CuentaTipo[] = ["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "EGRESO", "ORDEN"];

const TIPO_BADGE: Record<CuentaTipo, string> = {
  ACTIVO: "bg-sky-100 text-sky-700",
  PASIVO: "bg-amber-100 text-amber-700",
  PATRIMONIO: "bg-violet-100 text-violet-700",
  INGRESO: "bg-accent/10 text-accent",
  EGRESO: "bg-red-50 text-destructive",
  ORDEN: "bg-slate-100 text-slate-500",
};

export default function PlanCuentasPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);

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

  function nuevo() {
    setEditing(null);
    setCodigo("");
    setNombre("");
    setTipo("ACTIVO");
    setParentId("");
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
      setOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo eliminar (puede tener movimientos o subcuentas)");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Plan de cuentas</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">CONM001</span>
          </div>
          <p className="text-sm text-slate-500">Cuentas contables de la empresa. Las imputables admiten movimientos.</p>
        </div>
        <Button onClick={nuevo}><Plus className="h-4 w-4" /> Nueva cuenta</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Codigo</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 text-center font-medium">Tipo</th>
              <th className="px-4 py-3 text-center font-medium">Imputable</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Cargando...</td></tr>
            ) : cuentas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">Sin cuentas.</td></tr>
            ) : (
              cuentas.map((c) => {
                const nivel = c.codigo.split(".").length - 1;
                return (
                  <tr key={c.id} className={`border-b border-border last:border-0 ${!c.activo ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 font-mono text-xs text-secondary">{c.codigo}</td>
                    <td className="px-4 py-2">
                      <span style={{ paddingLeft: `${nivel * 16}px` }} className={c.imputable ? "text-foreground" : "font-semibold text-foreground"}>
                        {c.nombre}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_BADGE[c.tipo]}`}>{c.tipo}</span>
                    </td>
                    <td className="px-4 py-2 text-center text-slate-500">{c.imputable ? "Si" : "-"}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => editar(c)} aria-label="Editar"
                        className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
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
            <Input id="cod" value={codigo} onChange={(e) => { setCodigo(e.target.value); setDirty(true); }} placeholder="ej 1.1.01.002" />
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
