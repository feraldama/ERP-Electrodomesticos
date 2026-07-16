"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Printer } from "lucide-react";
import { ReciboTicketDoc, aplicaRecibo, type SaleFull } from "@/components/print/saleDocs";

export default function ReciboPrintPage() {
  const params = useParams<{ id: string }>();
  const { user, companyId } = useAuth();
  const [v, setV] = useState<SaleFull | null>(null);
  const [error, setError] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    api<SaleFull>(`/sales/${params.id}`).then(setV).catch(() => setError(true));
  }, [params.id]);

  const empresa = user?.companies.find((c) => c.id === companyId) ?? user?.companies[0];
  const hayEntrega = !!v && aplicaRecibo(v);

  useEffect(() => {
    if (!v || printed.current || !hayEntrega) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [v, hayEntrega]);

  if (error) return <div className="p-10 text-center text-slate-500">No se pudo cargar la venta.</div>;
  if (!v) return <div className="p-10 text-center text-slate-400">Cargando...</div>;

  return (
    <div id="print-doc">
      {/* Rollo termico de 80mm: la pagina se ajusta al ancho del ticket y alto automatico. */}
      <style>{`@media print { @page { size: 80mm auto; margin: 4mm; } }`}</style>
      <div className="mx-auto max-w-md px-8 pt-6 print:hidden">
        <div className="flex justify-end">
          <button
            onClick={() => window.print()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Printer className="h-4 w-4" /> Imprimir ticket
          </button>
        </div>
      </div>
      <div className="print-page mx-auto w-[80mm] bg-white px-2 py-4">
        {hayEntrega ? (
          <ReciboTicketDoc v={v} empresa={empresa} />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            Esta venta no registra entrega inicial; no hay recibo de dinero.
          </div>
        )}
      </div>
    </div>
  );
}
