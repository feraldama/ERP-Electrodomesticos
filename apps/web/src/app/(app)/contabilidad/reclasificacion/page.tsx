"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, hoyYmd } from "@/lib/format";
import type { ChartAccount } from "@/lib/types";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface CuentaReclasificable {
  accountId: number;
  codigo: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  imputable: boolean;
  saldo: number; // debe - haber (>0 deudor, <0 acreedor)
  sugerida: boolean;
  destinoSugeridoId: number | null;
  motivoSugerencia: string | null;
}

interface Fila {
  incluir: boolean;
  destinoId: string;
}

const GLOSA_DEFAULT = "Reclasificacion por cambio de plan de cuentas";

function SaldoCell({ saldo }: { saldo: number }) {
  return (
    <span className="whitespace-nowrap font-mono">
      {formatGs(Math.abs(saldo))}{" "}
      <span className="text-xs text-slate-400">{saldo > 0 ? "Deudor" : "Acreedor"}</span>
    </span>
  );
}

export default function ReclasificacionPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [fecha, setFecha] = useState(hoyYmd());
  const [glosa, setGlosa] = useState(GLOSA_DEFAULT);
  const [todas, setTodas] = useState(false);
  const [cuentas, setCuentas] = useState<CuentaReclasificable[]>([]);
  const [plan, setPlan] = useState<ChartAccount[]>([]);
  const [filas, setFilas] = useState<Record<number, Fila>>({});
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);

  const load = useCallback(() => {
    if (!fecha) return;
    setLoading(true);
    Promise.all([
      api<CuentaReclasificable[]>(`/contabilidad/reclasificacion?fecha=${fecha}`),
      api<ChartAccount[]>("/contabilidad/plan-cuentas"),
    ])
      .then(([cs, p]) => {
        setCuentas(cs);
        setPlan(p);
        // Las cuentas sugeridas arrancan marcadas y con su destino propuesto.
        setFilas(
          Object.fromEntries(
            cs.map((c) => [c.accountId, { incluir: c.sugerida && !!c.destinoSugeridoId, destinoId: c.destinoSugeridoId ? String(c.destinoSugeridoId) : "" }])
          )
        );
      })
      .catch((err) => notify("error", err instanceof Error ? err.message : "No se pudieron cargar las cuentas"))
      .finally(() => setLoading(false));
  }, [fecha, notify]);

  useEffect(() => {
    load();
  }, [load, companyId]);

  const destinos = useMemo(() => plan.filter((c) => c.activo && c.imputable), [plan]);
  const cuentaPorId = useMemo(() => new Map(plan.map((c) => [c.id, c])), [plan]);
  const visibles = cuentas.filter((c) => todas || c.sugerida);
  const seleccionadas = cuentas.filter((c) => filas[c.accountId]?.incluir);
  const faltaDestino = seleccionadas.some((c) => !filas[c.accountId]?.destinoId);

  // Vista previa del asiento: por cada cuenta, se cancela su saldo contra el destino.
  const preview = seleccionadas.flatMap((c) => {
    const destino = cuentaPorId.get(Number(filas[c.accountId]?.destinoId));
    if (!destino) return [];
    const monto = Math.abs(c.saldo);
    return [
      { key: `${c.accountId}-o`, cuenta: `${c.codigo} - ${c.nombre}`, debe: c.saldo < 0 ? monto : 0, haber: c.saldo > 0 ? monto : 0 },
      { key: `${c.accountId}-d`, cuenta: `${destino.codigo} - ${destino.nombre}`, debe: c.saldo > 0 ? monto : 0, haber: c.saldo < 0 ? monto : 0 },
    ];
  });
  const totalDebe = preview.reduce((s, l) => s + l.debe, 0);
  const totalHaber = preview.reduce((s, l) => s + l.haber, 0);

  function setFila(id: number, patch: Partial<Fila>) {
    setFilas((f) => ({ ...f, [id]: { ...f[id], ...patch } }));
  }

  async function generar() {
    const ok = await confirm({
      title: "Generar asiento de reclasificacion",
      description: `Se genera un asiento con fecha ${fecha.split("-").reverse().join("/")} que traspasa el saldo de ${seleccionadas.length} cuenta(s) por ${formatGs(totalDebe)}. Los saldos se recalculan a esa fecha al generar.`,
      confirmText: "Generar asiento",
    });
    if (!ok) return;
    setGenerando(true);
    try {
      const res = await api<{ numero: number; total: number }>("/contabilidad/reclasificacion", {
        method: "POST",
        body: JSON.stringify({
          fecha,
          glosa,
          items: seleccionadas.map((c) => ({ origenId: c.accountId, destinoId: Number(filas[c.accountId].destinoId) })),
        }),
      });
      notify("success", `Asiento N${res.numero} generado por ${formatGs(res.total)}`);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "No se pudo generar el asiento");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Reclasificacion de cuentas</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">CONP012</span>
        </div>
        <p className="text-sm text-slate-500">
          Traspasa el saldo de una cuenta a otra con un asiento. Util cuando se cambio el plan de cuentas y las cuentas
          anteriores (inactivas) conservan saldo.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Fecha del asiento" htmlFor="rc-fecha">
          <Input id="rc-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <div className="w-96">
          <Field label="Glosa" htmlFor="rc-glosa">
            <Input id="rc-glosa" value={glosa} maxLength={200} onChange={(e) => setGlosa(e.target.value)} />
          </Field>
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
          Mostrar todas las cuentas con saldo
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-3" />
              <th className="px-4 py-3 font-medium">Cuenta origen</th>
              <th className="px-4 py-3 text-right font-medium">Saldo a la fecha</th>
              <th className="w-10 px-2 py-3" />
              <th className="px-4 py-3 font-medium">Cuenta destino</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">Cargando...</td>
              </tr>
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {todas ? "No hay cuentas con saldo a esa fecha." : "No hay cuentas inactivas con saldo: no hace falta reclasificar."}
                </td>
              </tr>
            ) : (
              visibles.map((c) => {
                const fila = filas[c.accountId];
                const destino = cuentaPorId.get(Number(fila?.destinoId));
                const tipoDistinto = destino && destino.tipo !== c.tipo;
                return (
                  <tr key={c.accountId} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Reclasificar ${c.codigo}`}
                        checked={!!fila?.incluir}
                        onChange={(e) => setFila(c.accountId, { incluir: e.target.checked })}
                        className="h-4 w-4 cursor-pointer accent-accent"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-foreground">
                        <span className="font-mono text-xs text-slate-500">{c.codigo}</span> {c.nombre}
                      </div>
                      {(!c.activo || !c.imputable) && (
                        <span className="mt-0.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          {!c.activo ? "Inactiva" : "No imputable"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <SaldoCell saldo={c.saldo} />
                    </td>
                    <td className="px-2 py-2 text-slate-300">
                      <ArrowRight className="h-4 w-4" />
                    </td>
                    <td className="min-w-80 px-4 py-2">
                      <label htmlFor={`rc-dest-${c.accountId}`} className="sr-only">
                        Cuenta destino de {c.codigo}
                      </label>
                      <Select
                        id={`rc-dest-${c.accountId}`}
                        value={fila?.destinoId ?? ""}
                        onChange={(e) => setFila(c.accountId, { destinoId: e.target.value, incluir: !!e.target.value })}
                      >
                        <option value="">— Elegir cuenta —</option>
                        {destinos
                          .filter((d) => d.id !== c.accountId)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.codigo} - {d.nombre}
                            </option>
                          ))}
                      </Select>
                      <div className="mt-1 text-xs">
                        {tipoDistinto ? (
                          <span className="text-amber-700">Atencion: tipo distinto ({c.tipo} a {destino.tipo})</span>
                        ) : (
                          fila?.destinoId === String(c.destinoSugeridoId) &&
                          c.motivoSugerencia && <span className="text-slate-400">Sugerida · {c.motivoSugerencia}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {preview.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Vista previa del asiento</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Cuenta</th>
                  <th className="px-4 py-2 text-right font-medium">Debe</th>
                  <th className="px-4 py-2 text-right font-medium">Haber</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((l) => (
                  <tr key={l.key} className="border-b border-border last:border-0">
                    <td className="px-4 py-1.5 text-foreground">{l.cuenta}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{l.debe ? formatGs(l.debe) : ""}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{l.haber ? formatGs(l.haber) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40 font-semibold">
                  <td className="px-4 py-2 text-right text-xs text-slate-500">Totales</td>
                  <td className="px-4 py-2 text-right font-mono">{formatGs(totalDebe)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatGs(totalHaber)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-3">
        {faltaDestino && <span className="text-sm text-amber-700">Elegi la cuenta destino de todas las cuentas marcadas.</span>}
        <Button onClick={generar} loading={generando} disabled={loading || seleccionadas.length === 0 || faltaDestino || !fecha}>
          Generar asiento de reclasificacion
        </Button>
      </div>
    </div>
  );
}
