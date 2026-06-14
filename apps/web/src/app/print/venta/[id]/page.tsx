"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import { MEDIO_PAGO_LABEL, type MedioPago } from "@/lib/types";
import { Printer } from "lucide-react";

interface VentaPrint {
  establecimiento: string;
  puntoExpedicion: string;
  numero: string;
  timbrado: string | null;
  fecha: string;
  condicion: "CONTADO" | "CREDITO";
  estado: string;
  subtotalExenta: string;
  subtotal5: string;
  subtotal10: string;
  iva5: string;
  iva10: string;
  total: string;
  entregaInicial: string;
  observacion: string | null;
  customer: { person: { razonSocial: string; ruc: string | null; nroDoc: string; direccion: string | null; telefono: string | null } };
  priceList: { nombre: string } | null;
  items: Array<{ id: number; cantidad: string; precioUnitario: string; ivaTipo: keyof typeof IVA_LABEL | string; total: string; article?: { codigo: string; descripcion: string } }>;
  payments?: Array<{ id: number; medio: MedioPago; monto: string }>;
  installments?: Array<{ id: number; nroCuota: number; fechaVencimiento: string; montoCuota: string }>;
}

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

export default function VentaPrintPage() {
  const params = useParams<{ id: string }>();
  const { user, companyId } = useAuth();
  const [v, setV] = useState<VentaPrint | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<VentaPrint>(`/sales/${params.id}`).then(setV).catch(() => setError(true));
  }, [params.id]);

  const empresa = user?.companies.find((c) => c.id === companyId) ?? user?.companies[0];

  if (error) return <div className="p-10 text-center text-slate-500">No se pudo cargar la venta.</div>;
  if (!v) return <div className="p-10 text-center text-slate-400">Cargando...</div>;

  const nro = `${v.establecimiento}-${v.puntoExpedicion}-${v.numero}`;
  const anulada = v.estado === "ANULADO";

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800">
      {/* Barra de acciones (no se imprime) */}
      <div className="mb-6 flex justify-end gap-2 print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> Imprimir
        </button>
      </div>

      {anulada && (
        <div className="mb-4 rounded-lg border-2 border-destructive bg-red-50 py-2 text-center text-base font-bold uppercase tracking-widest text-destructive">
          Comprobante anulado
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between border-b-2 border-slate-300 pb-4">
        <div>
          <div className="text-lg font-bold text-slate-900">{empresa?.razonSocial ?? "Empresa"}</div>
          {empresa?.nombreFantasia && <div className="text-slate-500">{empresa.nombreFantasia}</div>}
        </div>
        <div className="text-right">
          <div className="text-base font-bold uppercase tracking-wide text-slate-900">
            Comprobante de venta
          </div>
          <div className="font-mono text-slate-600">N {nro}</div>
          {v.timbrado && <div className="text-slate-500">Timbrado: {v.timbrado}</div>}
          <div className="text-slate-500">Fecha: {fmtFecha(v.fecha)}</div>
          <div className="text-slate-500">{v.condicion === "CREDITO" ? "Credito" : "Contado"}</div>
        </div>
      </div>

      {/* Cliente */}
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Cliente</div>
        <div className="font-medium text-slate-900">{v.customer.person.razonSocial}</div>
        <div className="text-slate-600">
          {v.customer.person.ruc ?? v.customer.person.nroDoc}
          {v.customer.person.telefono ? ` · ${v.customer.person.telefono}` : ""}
        </div>
        {v.customer.person.direccion && <div className="text-slate-600">{v.customer.person.direccion}</div>}
        {v.priceList && <div className="mt-1 text-xs text-slate-500">Lista: {v.priceList.nombre}</div>}
      </div>

      {/* Items */}
      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Articulo</th>
            <th className="py-2 text-right">Cant.</th>
            <th className="py-2 text-right">Precio unit.</th>
            <th className="py-2 text-center">IVA</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {v.items.map((it) => (
            <tr key={it.id} className="border-b border-slate-200">
              <td className="py-2">
                <div className="text-slate-900">{it.article?.descripcion}</div>
                <div className="font-mono text-xs text-slate-400">{it.article?.codigo}</div>
              </td>
              <td className="py-2 text-right font-mono">{formatGs(it.cantidad)}</td>
              <td className="py-2 text-right font-mono">{formatGs(it.precioUnitario)}</td>
              <td className="py-2 text-center text-slate-500">{IVA_LABEL[it.ivaTipo] ?? it.ivaTipo}</td>
              <td className="py-2 text-right font-mono">{formatGs(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1">
          {Number(v.subtotalExenta) > 0 && <Row label="Exentas" value={v.subtotalExenta} />}
          {Number(v.subtotal5) > 0 && <Row label="Gravadas 5%" value={v.subtotal5} />}
          {Number(v.iva5) > 0 && <Row label="IVA 5%" value={v.iva5} />}
          {Number(v.subtotal10) > 0 && <Row label="Gravadas 10%" value={v.subtotal10} />}
          {Number(v.iva10) > 0 && <Row label="IVA 10%" value={v.iva10} />}
          <div className="flex justify-between border-t-2 border-slate-300 pt-1 text-base font-bold text-slate-900">
            <span>Total</span>
            <span className="font-mono">{formatGs(v.total)} Gs</span>
          </div>
        </div>
      </div>

      {/* Formas de pago */}
      {v.payments && v.payments.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            {v.condicion === "CREDITO" ? "Entrega inicial" : "Formas de pago"}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
            {v.payments.map((p) => (
              <span key={p.id}>
                {MEDIO_PAGO_LABEL[p.medio]}: <span className="font-mono">{formatGs(p.monto)} Gs</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Plan de cuotas */}
      {v.condicion === "CREDITO" && v.installments && v.installments.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Plan de cuotas</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1">Cuota</th>
                <th className="py-1">Vencimiento</th>
                <th className="py-1 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {v.installments.map((c) => (
                <tr key={c.id} className="border-b border-slate-200">
                  <td className="py-1 font-mono">{c.nroCuota}</td>
                  <td className="py-1">{fmtFecha(c.fechaVencimiento)}</td>
                  <td className="py-1 text-right font-mono">{formatGs(c.montoCuota)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {v.observacion && (
        <div className="mt-4 text-slate-600">
          <span className="text-slate-400">Observacion: </span>
          {v.observacion}
        </div>
      )}

      <div className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-400">
        Documento interno. La factura electronica (SIFEN) se emite por separado.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-mono">{formatGs(value)}</span>
    </div>
  );
}
