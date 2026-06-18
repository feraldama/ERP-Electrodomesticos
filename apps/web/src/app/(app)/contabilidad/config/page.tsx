"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AccountingConfigRow, ChartAccount } from "@/lib/types";
import { Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

// Etiquetas amigables para cada clave del posting.
const CLAVE_LABEL: Record<string, string> = {
  CAJA: "Caja",
  CLIENTES: "Clientes (deudores por ventas)",
  PROVEEDORES: "Proveedores",
  IVA_DEBITO_10: "IVA Debito 10%",
  IVA_DEBITO_5: "IVA Debito 5%",
  IVA_CREDITO_10: "IVA Credito 10%",
  IVA_CREDITO_5: "IVA Credito 5%",
  VENTAS_10: "Ventas gravadas 10%",
  VENTAS_5: "Ventas gravadas 5%",
  VENTAS_EXENTA: "Ventas exentas",
  COMPRAS_GRAV: "Compras / costo gravado",
  COMPRAS_EXENTA: "Compras / costo exento",
  RESULTADO_EJERCICIO: "Resultado del ejercicio (cierre)",
};

export default function ConfigCuentasPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const [config, setConfig] = useState<AccountingConfigRow[]>([]);
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<AccountingConfigRow[]>("/contabilidad/config"),
      api<ChartAccount[]>("/contabilidad/plan-cuentas"),
    ])
      .then(([cfg, cts]) => {
        setConfig(cfg);
        setCuentas(cts.filter((c) => c.imputable && c.activo));
      })
      .catch(() => {
        setConfig([]);
        setCuentas([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, companyId]);

  async function asignar(clave: string, accountId: number) {
    setSaving(clave);
    try {
      await api("/contabilidad/config", { method: "PUT", body: JSON.stringify({ clave, accountId }) });
      const cta = cuentas.find((c) => c.id === accountId) ?? null;
      setConfig((prev) =>
        prev.map((r) =>
          r.clave === clave ? { ...r, accountId, codigo: cta?.codigo ?? null, nombre: cta?.nombre ?? null } : r
        )
      );
      notify("success", "Cuenta asignada");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(null);
    }
  }

  const sinAsignar = config.filter((r) => !r.accountId).length;

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Configuracion de cuentas</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">CONM010</span>
        </div>
        <p className="text-sm text-slate-500">
          Asocia cada concepto del posting automatico a una cuenta imputable del plan. El motor de
          asientos usa estas cuentas al procesar ventas, compras, cobros y pagos.
        </p>
      </div>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : (
        <>
          {sinAsignar > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Hay {sinAsignar} concepto(s) sin cuenta asignada. Los asientos de esos conceptos fallaran
              al procesarse hasta completarlos.
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Concepto</th>
                  <th className="px-4 py-3 font-medium">Cuenta asignada</th>
                </tr>
              </thead>
              <tbody>
                {config.map((r) => (
                  <tr key={r.clave} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground">
                      {CLAVE_LABEL[r.clave] ?? r.clave}
                      {r.codigo && <span className="ml-2 font-mono text-xs text-slate-400">{r.codigo}</span>}
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={r.accountId ?? ""}
                        disabled={saving === r.clave}
                        onChange={(e) => e.target.value && asignar(r.clave, Number(e.target.value))}
                      >
                        <option value="">- Sin asignar -</option>
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo} - {c.nombre}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
