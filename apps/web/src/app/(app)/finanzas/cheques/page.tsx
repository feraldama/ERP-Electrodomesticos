"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import type { Cheque, ChequeEstado } from "@/lib/types";
import { Field, Select } from "@/components/ui/Field";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Check, Ban } from "lucide-react";

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

const ESTADO_BADGE: Record<ChequeEstado, string> = {
  PENDIENTE: "bg-amber-50 text-amber-700",
  COBRADO: "bg-accent/10 text-accent",
  ANULADO: "bg-slate-100 text-slate-500",
  RECHAZADO: "bg-red-50 text-destructive",
};

const ESTADO_LABEL: Record<ChequeEstado, string> = {
  PENDIENTE: "Pendiente",
  COBRADO: "Cobrado",
  ANULADO: "Anulado",
  RECHAZADO: "Rechazado",
};

export default function ChequesPage() {
  const { companyId } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState<ChequeEstado | "">("PENDIENTE");

  const hoy = today();

  const load = useCallback(async (filtroEstado: string) => {
    setLoading(true);
    try {
      setCheques(await api<Cheque[]>(`/cheques${filtroEstado ? `?estado=${filtroEstado}` : ""}`));
    } catch {
      setCheques([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(estado);
  }, [load, estado, companyId]);

  async function cambiarEstado(c: Cheque, nuevo: ChequeEstado, danger = false) {
    const verbo = nuevo === "COBRADO" ? "marcar como cobrado" : nuevo === "ANULADO" ? "anular" : "rechazar";
    const ok = await confirm({
      title: `Cheque ${c.numero}`,
      description: `Vas a ${verbo} el cheque de ${formatGs(c.monto)} Gs${c.proveedorNombre ? ` a ${c.proveedorNombre}` : ""}.`,
      confirmText: nuevo === "COBRADO" ? "Marcar cobrado" : "Anular",
      danger,
    });
    if (!ok) return;
    try {
      await api(`/cheques/${c.id}/estado`, { method: "PUT", body: JSON.stringify({ estado: nuevo }) });
      notify("success", "Cheque actualizado");
      load(estado);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al actualizar el cheque");
    }
  }

  const columns: DataColumn<Cheque>[] = [
    { header: "Emision", render: (c) => <span className="text-slate-600">{fmtFecha(c.fechaEmision)}</span> },
    { header: "Proveedor", render: (c) => <span className="text-foreground">{c.proveedorNombre ?? "-"}</span> },
    { header: "Banco", render: (c) => <span className="text-slate-600">{c.banco || "-"}</span> },
    { header: "Nro", render: (c) => <span className="font-mono text-xs text-secondary">{c.numero}</span> },
    {
      header: "Cobro",
      render: (c) => {
        const vencido = c.estado === "PENDIENTE" && c.fechaCobro.slice(0, 10) < hoy;
        return (
          <span className={vencido ? "font-medium text-destructive" : "text-slate-600"}>
            {fmtFecha(c.fechaCobro)}
            {vencido && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-destructive">vencido</span>}
          </span>
        );
      },
    },
    { header: "Monto", align: "right", render: (c) => <span className="font-mono font-medium text-foreground">{formatGs(c.monto)}</span> },
    {
      header: "Estado",
      align: "center",
      render: (c) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE[c.estado]}`}>{ESTADO_LABEL[c.estado]}</span>
      ),
    },
  ];

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Cheques emitidos</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">FINI007</span>
        </div>
        <p className="text-sm text-slate-500">
          Cheques entregados a proveedores al pagar. Marca cuando se cobran (debitan) o si se anulan.
        </p>
      </div>

      <div className="mb-4 w-56">
        <Field label="Estado" htmlFor="estado">
          <Select id="estado" value={estado} onChange={(e) => setEstado(e.target.value as ChequeEstado | "")}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="COBRADO">Cobrados</option>
            <option value="ANULADO">Anulados</option>
            <option value="RECHAZADO">Rechazados</option>
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        rows={cheques}
        loading={loading}
        rowKey={(c) => c.id}
        actions={(c) =>
          c.estado === "PENDIENTE" ? (
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => cambiarEstado(c, "COBRADO")}
                aria-label="Marcar cobrado"
                title="Marcar cobrado"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => cambiarEstado(c, "ANULADO", true)}
                aria-label="Anular"
                title="Anular"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              >
                <Ban className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400">-</span>
          )
        }
        emptyTitle={estado === "PENDIENTE" ? "Sin cheques pendientes" : "Sin cheques"}
        emptyDescription="Los cheques se generan al pagar a un proveedor con el medio Cheque."
      />
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
