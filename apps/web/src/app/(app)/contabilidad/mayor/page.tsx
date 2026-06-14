"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { ChartAccount, Ledger } from "@/lib/types";
import { Field, Select } from "@/components/ui/Field";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

export default function LibroMayorPage() {
  const { companyId } = useAuth();
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [data, setData] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<ChartAccount[]>("/contabilidad/plan-cuentas")
      .then((cs) => setCuentas(cs.filter((c) => c.imputable)))
      .catch(() => setCuentas([]));
  }, [companyId]);

  useEffect(() => {
    if (!accountId) {
      setData(null);
      return;
    }
    setLoading(true);
    api<Ledger>(`/contabilidad/mayor?accountId=${accountId}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [accountId]);

  const saldoFinal = useMemo(() => (data && data.movimientos.length ? data.movimientos[data.movimientos.length - 1].saldo : 0), [data]);

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Libro mayor</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">CONC005</span>
        </div>
        <p className="text-sm text-slate-500">Movimientos de una cuenta con saldo corriente.</p>
      </div>

      <div className="mb-5 max-w-md">
        <Field label="Cuenta" htmlFor="cta">
          <Select id="cta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">-- Selecciona una cuenta --</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
            ))}
          </Select>
        </Field>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !data ? (
        <p className="text-slate-400">Selecciona una cuenta para ver su mayor.</p>
      ) : data.movimientos.length === 0 ? (
        <p className="text-slate-400">La cuenta {data.cuenta.codigo} no tiene movimientos.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Asiento</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Glosa</th>
                <th className="px-4 py-3 text-right font-medium">Debe</th>
                <th className="px-4 py-3 text-right font-medium">Haber</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.movimientos.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">N{m.numero ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-600">{fmtFecha(m.fecha)}</td>
                  <td className="px-4 py-2 text-foreground">{m.glosa}</td>
                  <td className="px-4 py-2 text-right font-mono text-slate-600">{Number(m.debe) > 0 ? formatGs(m.debe) : "-"}</td>
                  <td className="px-4 py-2 text-right font-mono text-slate-600">{Number(m.haber) > 0 ? formatGs(m.haber) : "-"}</td>
                  <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{formatGs(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 text-sm font-semibold text-foreground">
                <td className="px-4 py-2" colSpan={5}>Saldo final</td>
                <td className="px-4 py-2 text-right font-mono">{formatGs(saldoFinal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
