"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Printer } from "lucide-react";
import { PagareDoc, aplicaPagare, type SaleFull } from "@/components/print/saleDocs";

export default function PagarePrintPage() {
  const params = useParams<{ id: string }>();
  const { user, companyId } = useAuth();
  const [v, setV] = useState<SaleFull | null>(null);
  const [error, setError] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    api<SaleFull>(`/sales/${params.id}`).then(setV).catch(() => setError(true));
  }, [params.id]);

  const empresa = user?.companies.find((c) => c.id === companyId) ?? user?.companies[0];
  const esCredito = !!v && aplicaPagare(v);

  useEffect(() => {
    if (!v || printed.current || !esCredito) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [v, esCredito]);

  if (error) return <div className="p-10 text-center text-slate-500">No se pudo cargar la venta.</div>;
  if (!v) return <div className="p-10 text-center text-slate-400">Cargando...</div>;

  return (
    <div id="print-doc">
      <div className="mx-auto max-w-3xl px-8 pt-6 print:hidden">
        <div className="flex justify-end">
          <button
            onClick={() => window.print()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>
      <div className="print-page mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800">
        {esCredito ? (
          <PagareDoc v={v} empresa={empresa} />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-slate-500">
            Esta venta es de contado; no genera pagare.
          </div>
        )}
      </div>
    </div>
  );
}
