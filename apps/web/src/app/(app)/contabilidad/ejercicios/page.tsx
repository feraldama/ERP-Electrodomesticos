"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatGs } from "@/lib/format";
import type { FiscalPeriod } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Plus, Pencil, Trash2, Lock, LockOpen, BookCheck } from "lucide-react";

// YYYY-MM-DD para inputs date a partir de un ISO string.
const toYmd = (iso: string) => iso.slice(0, 10);

export default function EjerciciosPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [periodos, setPeriodos] = useState<FiscalPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FiscalPeriod | null>(null);
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<FiscalPeriod[]>("/contabilidad/periodos")
      .then(setPeriodos)
      .catch(() => setPeriodos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, companyId]);

  function nuevo() {
    setEditing(null);
    setNombre("");
    setFechaInicio("");
    setFechaFin("");
    setDirty(false);
    setOpen(true);
  }

  function editar(p: FiscalPeriod) {
    setEditing(p);
    setNombre(p.nombre);
    setFechaInicio(toYmd(p.fechaInicio));
    setFechaFin(toYmd(p.fechaFin));
    setDirty(false);
    setOpen(true);
  }

  async function guardar() {
    if (!nombre.trim()) return notify("error", "Indica el nombre del ejercicio");
    if (!fechaInicio || !fechaFin) return notify("error", "Indica el rango de fechas");
    setSaving(true);
    try {
      const body = JSON.stringify({ nombre, fechaInicio, fechaFin });
      if (editing) {
        await api(`/contabilidad/periodos/${editing.id}`, { method: "PUT", body });
        notify("success", "Ejercicio actualizado");
      } else {
        const r = await api<{ asientosAsignados: number }>("/contabilidad/periodos", { method: "POST", body });
        notify("success", r.asientosAsignados > 0 ? `Ejercicio creado (${r.asientosAsignados} asientos asignados)` : "Ejercicio creado");
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
      title: "Eliminar ejercicio",
      description: `Vas a eliminar "${editing.nombre}". Esta accion no se puede deshacer.`,
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api(`/contabilidad/periodos/${editing.id}`, { method: "DELETE" });
      notify("success", "Ejercicio eliminado");
      setOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo eliminar (puede tener asientos asignados)");
    } finally {
      setSaving(false);
    }
  }

  async function cierreEjercicio(p: FiscalPeriod) {
    const ok = await confirm({
      title: `Cerrar ejercicio ${p.nombre}`,
      description:
        "Se generara el asiento de cierre (lleva el resultado de ingresos y egresos a la cuenta de patrimonio) y el ejercicio quedara cerrado. Esta accion no se puede deshacer automaticamente.",
      confirmText: "Cerrar ejercicio",
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api<{ resultado: number; numeroAsiento: number | null }>(
        `/contabilidad/periodos/${p.id}/cierre`,
        { method: "POST" }
      );
      const tipo = r.resultado >= 0 ? "Utilidad" : "Perdida";
      notify(
        "success",
        r.numeroAsiento
          ? `Ejercicio cerrado. ${tipo}: ${formatGs(Math.abs(r.resultado))} Gs (asiento #${r.numeroAsiento})`
          : "Ejercicio cerrado (sin movimientos de resultado)"
      );
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo cerrar el ejercicio");
    }
  }

  async function toggleCerrado(p: FiscalPeriod) {
    const ok = await confirm({
      title: p.cerrado ? "Reabrir ejercicio" : "Cerrar ejercicio",
      description: p.cerrado
        ? `Vas a reabrir "${p.nombre}". Volvera a admitir nuevos asientos.`
        : `Vas a cerrar "${p.nombre}". No se podran procesar asientos con fecha dentro de este ejercicio.`,
      confirmText: p.cerrado ? "Reabrir" : "Cerrar",
      danger: !p.cerrado,
    });
    if (!ok) return;
    try {
      await api(`/contabilidad/periodos/${p.id}`, { method: "PUT", body: JSON.stringify({ cerrado: !p.cerrado }) });
      notify("success", p.cerrado ? "Ejercicio reabierto" : "Ejercicio cerrado");
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo cambiar el estado");
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Ejercicios fiscales</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">CONM011</span>
          </div>
          <p className="text-sm text-slate-500">
            Define los ejercicios contables. Al cerrar uno, el sistema rechaza nuevos asientos con fecha dentro de su rango.
          </p>
        </div>
        <Button onClick={nuevo}><Plus className="h-4 w-4" /> Nuevo ejercicio</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Ejercicio</th>
              <th className="px-4 py-3 font-medium">Desde</th>
              <th className="px-4 py-3 font-medium">Hasta</th>
              <th className="px-4 py-3 text-center font-medium">Asientos</th>
              <th className="px-4 py-3 text-center font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Cargando...</td></tr>
            ) : periodos.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Sin ejercicios. Crea uno para habilitar el control de periodos.</td></tr>
            ) : (
              periodos.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-foreground">{p.nombre}</td>
                  <td className="px-4 py-2 text-slate-600">{formatDate(p.fechaInicio)}</td>
                  <td className="px-4 py-2 text-slate-600">{formatDate(p.fechaFin)}</td>
                  <td className="px-4 py-2 text-center text-slate-500">{p.asientos}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.cerrado ? "bg-red-50 text-destructive" : "bg-accent/10 text-accent"}`}>
                      {p.cerrado ? "Cerrado" : "Abierto"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!p.cerrado && (
                        <button onClick={() => cierreEjercicio(p)} aria-label="Cierre de ejercicio" title="Cierre de ejercicio (genera asiento)"
                          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          <BookCheck className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => toggleCerrado(p)} aria-label={p.cerrado ? "Reabrir" : "Cerrar"}
                        className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {p.cerrado ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </button>
                      <button onClick={() => editar(p)} aria-label="Editar"
                        className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar ${editing.nombre}` : "Nuevo ejercicio"}
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
          <Field label="Nombre" htmlFor="nom" required className="sm:col-span-2">
            <Input id="nom" value={nombre} onChange={(e) => { setNombre(e.target.value); setDirty(true); }} placeholder="ej 2026" />
          </Field>
          <Field label="Desde" htmlFor="ini" required>
            <Input id="ini" type="date" value={fechaInicio} onChange={(e) => { setFechaInicio(e.target.value); setDirty(true); }} />
          </Field>
          <Field label="Hasta" htmlFor="fin" required>
            <Input id="fin" type="date" value={fechaFin} onChange={(e) => { setFechaFin(e.target.value); setDirty(true); }} />
          </Field>
        </div>
        {editing && editing.asientos > 0 && (
          <p className="mt-3 text-xs text-amber-700">
            Este ejercicio ya tiene {editing.asientos} asiento(s); no se pueden cambiar las fechas, solo el nombre.
          </p>
        )}
      </Modal>
    </div>
  );
}
