"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs, formatDate } from "@/lib/format";
import type { LibroIva } from "@/lib/types";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

// Primer dia del mes actual y hoy, en formato YYYY-MM-DD (para los inputs date).
function defaultRange() {
  const hoy = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: ymd(inicio), hasta: ymd(hoy) };
}

const money = (v: number) => (v ? formatGs(v) : "-");

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Exporta a Excel sin dependencias: una tabla HTML servida como .xls (Excel la abre
// con columnas y acentos correctos). Los importes van como numeros crudos para que
// Excel los sume; las NC ya vienen en negativo.
function descargarExcel(titulo: string, contraparte: string, desde: string, hasta: string, data: LibroIva) {
  const head = ["Fecha", "Tipo", "Comprobante", "RUC", contraparte, "Grav. 10%", "Grav. 5%", "Exenta", "IVA 10%", "IVA 5%", "Total"];
  const filaHtml = (c: string[], tag: "th" | "td" = "td") => `<tr>${c.map((x) => `<${tag}>${x}</${tag}>`).join("")}</tr>`;
  const num = (v: number) => (v ? String(Math.round(v)) : "");
  const t = data.totales;
  const cuerpo = data.filas
    .map((f) =>
      filaHtml([
        formatDate(f.fecha),
        f.tipoDoc === "NOTA_CREDITO" ? "NC" : "FAC",
        esc(f.comprobante),
        esc(f.ruc),
        esc(f.razonSocial),
        num(f.gravada10),
        num(f.gravada5),
        num(f.exenta),
        num(f.iva10),
        num(f.iva5),
        num(f.total),
      ])
    )
    .join("");
  const totales = filaHtml(
    ["", "", "", "", `TOTALES (${data.filas.length})`, num(t.gravada10), num(t.gravada5), num(t.exenta), num(t.iva10), num(t.iva5), num(t.total)],
    "th"
  );
  const html =
    `<html><head><meta charset="utf-8"></head><body>` +
    `<table border="1"><caption style="text-align:left;font-weight:bold">${esc(titulo)} — ${desde} a ${hasta}</caption>` +
    `<thead>${filaHtml(head, "th")}</thead><tbody>${cuerpo}${totales}</tbody></table></body></html>`;

  const blob = new Blob(["﻿", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${titulo.replace(/\s+/g, "_")}_${desde}_a_${hasta}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  titulo: string;
  codigo: string;
  endpoint: string; // "/contabilidad/libro-compras" | "/contabilidad/libro-ventas"
  contraparte: string; // "Proveedor" | "Cliente"
}

export function LibroIva({ titulo, codigo, endpoint, contraparte }: Props) {
  const { companyId } = useAuth();
  const [{ desde, hasta }, setRange] = useState(defaultRange);
  const [data, setData] = useState<LibroIva | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ desde, hasta }).toString();
    api<LibroIva>(`${endpoint}?${qs}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [endpoint, desde, hasta]);

  useEffect(() => {
    load();
  }, [load, companyId]);

  const t = data?.totales;

  return (
    <div className="max-w-6xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">{titulo}</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">{codigo}</span>
        </div>
        <p className="text-sm text-slate-500">
          Detalle de comprobantes con su IVA por tasa. Las notas de credito figuran como resta.
        </p>
      </div>

      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <Field label="Desde" htmlFor="desde">
          <Input id="desde" type="date" value={desde} onChange={(e) => setRange((r) => ({ ...r, desde: e.target.value }))} />
        </Field>
        <Field label="Hasta" htmlFor="hasta">
          <Input id="hasta" type="date" value={hasta} onChange={(e) => setRange((r) => ({ ...r, hasta: e.target.value }))} />
        </Field>
        <Button type="submit" disabled={loading}>
          {loading ? "Cargando..." : "Filtrar"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || !data || data.filas.length === 0}
          onClick={() => data && descargarExcel(titulo, contraparte, desde, hasta, data)}
        >
          Exportar a Excel
        </Button>
      </form>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : !data || data.filas.length === 0 ? (
        <p className="text-slate-400">No hay comprobantes en el periodo seleccionado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3 font-medium">Fecha</th>
                <th className="px-3 py-3 font-medium">Tipo</th>
                <th className="px-3 py-3 font-medium">Comprobante</th>
                <th className="px-3 py-3 font-medium">RUC</th>
                <th className="px-3 py-3 font-medium">{contraparte}</th>
                <th className="px-3 py-3 text-right font-medium">Grav. 10%</th>
                <th className="px-3 py-3 text-right font-medium">Grav. 5%</th>
                <th className="px-3 py-3 text-right font-medium">Exenta</th>
                <th className="px-3 py-3 text-right font-medium">IVA 10%</th>
                <th className="px-3 py-3 text-right font-medium">IVA 5%</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.filas.map((f, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDate(f.fecha)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        f.tipoDoc === "NOTA_CREDITO" ? "bg-red-50 text-destructive" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {f.tipoDoc === "NOTA_CREDITO" ? "NC" : "FAC"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{f.comprobante}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{f.ruc}</td>
                  <td className="px-3 py-2 text-foreground">{f.razonSocial}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{money(f.gravada10)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{money(f.gravada5)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{money(f.exenta)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{money(f.iva10)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{money(f.iva5)}</td>
                  <td className="px-3 py-2 text-right font-mono text-foreground">{money(f.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 text-sm font-semibold text-foreground">
                <td className="px-3 py-2" colSpan={5}>
                  Totales ({data.filas.length})
                </td>
                <td className="px-3 py-2 text-right font-mono">{formatGs(t!.gravada10)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatGs(t!.gravada5)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatGs(t!.exenta)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatGs(t!.iva10)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatGs(t!.iva5)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatGs(t!.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
