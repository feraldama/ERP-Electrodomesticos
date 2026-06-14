"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, IVA_LABEL } from "@/lib/format";
import { Printer } from "lucide-react";

interface QuotePrint {
  numero: string;
  fecha: string;
  validezDias: number;
  observacion: string | null;
  subtotalExenta: string;
  subtotal5: string;
  subtotal10: string;
  iva5: string;
  iva10: string;
  total: string;
  customer: { person: { razonSocial: string; ruc: string | null; nroDoc: string; direccion: string | null; telefono: string | null } };
  priceList: { nombre: string } | null;
  items: Array<{ id: number; cantidad: string; precioUnitario: string; ivaTipo: keyof typeof IVA_LABEL | string; total: string; article?: { codigo: string; descripcion: string } }>;
}

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

export default function PresupuestoPrintPage() {
  const params = useParams<{ id: string }>();
  const { user, companyId } = useAuth();
  const [q, setQ] = useState<QuotePrint | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<QuotePrint>(`/presupuestos/${params.id}`)
      .then(setQ)
      .catch(() => setError(true));
  }, [params.id]);

  const empresa = user?.companies.find((c) => c.id === companyId) ?? user?.companies[0];

  if (error) return <div className="p-10 text-center text-slate-500">No se pudo cargar el presupuesto.</div>;
  if (!q) return <div className="p-10 text-center text-slate-400">Cargando...</div>;

  const ivaTotal = Number(q.iva5) + Number(q.iva10);

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

      {/* Encabezado */}
      <div className="flex items-start justify-between border-b-2 border-slate-300 pb-4">
        <div>
          <div className="text-lg font-bold text-slate-900">{empresa?.razonSocial ?? "Empresa"}</div>
          {empresa?.nombreFantasia && <div className="text-slate-500">{empresa.nombreFantasia}</div>}
        </div>
        <div className="text-right">
          <div className="text-base font-bold uppercase tracking-wide text-slate-900">Presupuesto</div>
          <div className="font-mono text-slate-600">N {q.numero}</div>
          <div className="text-slate-500">Fecha: {fmtFecha(q.fecha)}</div>
          <div className="text-slate-500">Validez: {q.validezDias} dias</div>
        </div>
      </div>

      {/* Cliente */}
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Cliente</div>
        <div className="font-medium text-slate-900">{q.customer.person.razonSocial}</div>
        <div className="text-slate-600">
          {q.customer.person.ruc ?? q.customer.person.nroDoc}
          {q.customer.person.telefono ? ` · ${q.customer.person.telefono}` : ""}
        </div>
        {q.customer.person.direccion && <div className="text-slate-600">{q.customer.person.direccion}</div>}
        {q.priceList && <div className="mt-1 text-xs text-slate-500">Lista: {q.priceList.nombre}</div>}
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
          {q.items.map((it) => (
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
          {Number(q.subtotalExenta) > 0 && <Row label="Exentas" value={q.subtotalExenta} />}
          {Number(q.subtotal5) > 0 && <Row label="Gravadas 5%" value={q.subtotal5} />}
          {Number(q.subtotal10) > 0 && <Row label="Gravadas 10%" value={q.subtotal10} />}
          {ivaTotal > 0 && <Row label="IVA" value={String(ivaTotal)} />}
          <div className="flex justify-between border-t-2 border-slate-300 pt-1 text-base font-bold text-slate-900">
            <span>Total</span>
            <span className="font-mono">{formatGs(q.total)} Gs</span>
          </div>
        </div>
      </div>

      {q.observacion && <div className="mt-4 text-slate-600"><span className="text-slate-400">Observacion: </span>{q.observacion}</div>}

      <div className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-400">
        Presupuesto valido por {q.validezDias} dias desde la fecha de emision. No es un comprobante fiscal.
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
