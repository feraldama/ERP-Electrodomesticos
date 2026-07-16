"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Warehouse } from "@/lib/types";
import { BatchMovementsView } from "./BatchMovementsView";
import { ArticleMovementsView } from "./ArticleMovementsView";

type Tab = "movimiento" | "articulo";

const TABS: { key: Tab; label: string }[] = [
  { key: "movimiento", label: "Por movimiento" },
  { key: "articulo", label: "Por articulo" },
];

export default function HistorialMovimientosPage() {
  const { companyId } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [tab, setTab] = useState<Tab>("movimiento");

  useEffect(() => {
    api<Warehouse[]>("/warehouses").then(setWarehouses).catch(() => setWarehouses([]));
  }, [companyId]);

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Historial de movimientos</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">STKC012</span>
        </div>
        <p className="text-sm text-slate-500">
          Movimientos de stock realizados: transferencias entre depositos, ajustes, ingresos y egresos.
        </p>
      </div>

      {/* Pestañas: agrupado por operacion vs. linea por linea (kardex) */}
      <div className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "movimiento" ? (
        <BatchMovementsView warehouses={warehouses} />
      ) : (
        <ArticleMovementsView warehouses={warehouses} />
      )}
    </div>
  );
}
