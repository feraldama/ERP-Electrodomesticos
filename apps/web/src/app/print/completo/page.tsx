"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Printer } from "lucide-react";
import {
  ComprobanteDoc,
  PagareDoc,
  ReciboDoc,
  GarantiaDoc,
  aplicaPagare,
  aplicaRecibo,
  aplicaGarantia,
  type SaleFull,
  type GarantiaFull,
} from "@/components/print/saleDocs";

interface Bundle {
  venta: SaleFull;
  garantia: GarantiaFull | null;
}

// Una hoja del documento (con salto de pagina despues de cada una salvo la ultima).
function Page({ children }: { children: React.ReactNode }) {
  return <section className="print-page mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800">{children}</section>;
}

function CompletoInner() {
  const searchParams = useSearchParams();
  const { user, companyId } = useAuth();
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [error, setError] = useState(false);
  const printed = useRef(false);

  const ids = useMemo(
    () =>
      (searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    [searchParams]
  );

  useEffect(() => {
    if (ids.length === 0) return setError(true);
    let cancel = false;
    (async () => {
      try {
        const result = await Promise.all(
          ids.map(async (id) => {
            const venta = await api<SaleFull>(`/sales/${id}`);
            // La garantia solo se necesita si la venta la amerita (tiene articulos con garantia).
            let garantia: GarantiaFull | null = null;
            try {
              garantia = await api<GarantiaFull>(`/sales/${id}/garantia`);
            } catch {
              garantia = null;
            }
            return { venta, garantia } as Bundle;
          })
        );
        if (!cancel) setBundles(result);
      } catch {
        if (!cancel) setError(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [ids]);

  const empresa = user?.companies.find((c) => c.id === companyId) ?? user?.companies[0];

  // Auto-impresion una sola vez cuando todo esta cargado.
  useEffect(() => {
    if (!bundles || printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [bundles]);

  if (error) return <div className="p-10 text-center text-slate-500">No se pudieron cargar los documentos.</div>;
  if (!bundles) return <div className="p-10 text-center text-slate-400">Cargando...</div>;

  // Arma la lista de hojas a imprimir en orden: por cada comprobante, comprobante ->
  // pagare -> recibo -> garantia (segun corresponda).
  const pages: React.ReactNode[] = [];
  bundles.forEach((b, i) => {
    pages.push(<ComprobanteDoc key={`comp-${i}`} v={b.venta} empresa={empresa} />);
    if (aplicaPagare(b.venta)) pages.push(<PagareDoc key={`pag-${i}`} v={b.venta} empresa={empresa} />);
    if (aplicaRecibo(b.venta)) pages.push(<ReciboDoc key={`rec-${i}`} v={b.venta} empresa={empresa} />);
    if (aplicaGarantia(b.garantia)) pages.push(<GarantiaDoc key={`gar-${i}`} g={b.garantia!} empresa={empresa} />);
  });

  return (
    <div id="print-doc">
      {/* Barra de acciones (no se imprime) */}
      <div className="mx-auto max-w-3xl px-8 pt-6 print:hidden">
        <div className="flex justify-end">
          <button
            onClick={() => window.print()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Printer className="h-4 w-4" /> Imprimir todo
          </button>
        </div>
      </div>

      {pages.map((p, i) => (
        <Page key={i}>{p}</Page>
      ))}
    </div>
  );
}

export default function CompletoPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Cargando...</div>}>
      <CompletoInner />
    </Suspense>
  );
}
