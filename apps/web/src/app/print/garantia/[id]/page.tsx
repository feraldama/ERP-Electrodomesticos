"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Printer } from "lucide-react";
import { GarantiaDoc, aplicaGarantia, type GarantiaFull } from "@/components/print/saleDocs";

export default function GarantiaPrintPage() {
  const params = useParams<{ id: string }>();
  const { user, companyId } = useAuth();
  const [g, setG] = useState<GarantiaFull | null>(null);
  const [error, setError] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    api<GarantiaFull>(`/sales/${params.id}/garantia`).then(setG).catch(() => setError(true));
  }, [params.id]);

  const empresa = user?.companies.find((c) => c.id === companyId) ?? user?.companies[0];
  const tieneGarantia = aplicaGarantia(g);

  // Auto-impresion solo si hay articulos con garantia.
  useEffect(() => {
    if (!g || printed.current || !tieneGarantia) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [g, tieneGarantia]);

  if (error) return <div className="p-10 text-center text-slate-500">No se pudo cargar la venta.</div>;
  if (!g) return <div className="p-10 text-center text-slate-400">Cargando...</div>;

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
        {tieneGarantia ? (
          <GarantiaDoc g={g} empresa={empresa} />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-slate-500">
            Esta venta no incluye articulos con garantia.
          </div>
        )}
      </div>
    </div>
  );
}
