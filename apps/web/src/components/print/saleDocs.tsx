// Componentes de presentacion de los documentos imprimibles de una venta.
// Se usan tanto en las paginas sueltas (/print/venta, /print/pagare, etc.) como en
// la pagina combinada (/print/completo), para no duplicar el markup.
//
// Cada Doc renderiza SOLO el contenido del documento (sin barra de botones ni
// auto-impresion; eso lo maneja quien lo usa). El contenedor de pagina (ancho,
// padding, fondo) tambien lo pone quien lo usa.

import { formatGs, numeroALetras, IVA_LABEL } from "@/lib/format";
import { MEDIO_PAGO_LABEL, type MedioPago } from "@/lib/types";

// ---------- Tipos ----------

export interface Empresa {
  razonSocial?: string;
  nombreFantasia?: string | null;
}

interface Persona {
  razonSocial: string;
  ruc: string | null;
  nroDoc: string;
  direccion: string | null;
  telefono: string | null;
}

// Forma de GET /sales/:id
export interface SaleFull {
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
  customer: { person: Persona };
  priceList: { nombre: string } | null;
  items: Array<{ id: number; cantidad: string; precioUnitario: string; ivaTipo: string; total: string; article?: { codigo: string; descripcion: string } }>;
  payments?: Array<{ id: number; medio: MedioPago; monto: string }>;
  installments?: Array<{ id: number; nroCuota: number; fechaVencimiento: string; montoCuota: string; montoPagado?: string }>;
}

// Forma de GET /sales/:id/garantia
export interface GarantiaFull {
  establecimiento: string;
  puntoExpedicion: string;
  numero: string;
  fecha: string;
  estado: string;
  customer: { person: Persona };
  items: Array<{ id: number; cantidad: string; article?: { id: number; codigo: string; descripcion: string; garantiaMeses: number; controlaSerie: boolean } }>;
  serialsByArticle: Record<string, string[]>;
}

// ---------- Helpers de fecha ----------

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

export function fmtFechaLarga(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} de ${MESES[(m || 1) - 1]} de ${y}`;
}

// Suma `meses` a una fecha ISO y devuelve dd/mm/yyyy (ajusta fin de mes).
function fechaVencimientoGarantia(iso: string, meses: number) {
  const base = new Date(iso.slice(0, 10) + "T00:00:00");
  const d = base.getDate();
  base.setMonth(base.getMonth() + meses);
  if (base.getDate() < d) base.setDate(0);
  const dd = String(base.getDate()).padStart(2, "0");
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${base.getFullYear()}`;
}

function AnuladoBanner() {
  return (
    <div className="mb-4 rounded-lg border-2 border-destructive bg-red-50 py-2 text-center text-base font-bold uppercase tracking-widest text-destructive">
      Comprobante anulado
    </div>
  );
}

// ---------- Predicados: que documentos aplican a una venta ----------

export const aplicaPagare = (v: SaleFull) => v.condicion === "CREDITO";
export const aplicaRecibo = (v: SaleFull) => Number(v.entregaInicial) > 0;
export const aplicaGarantia = (g: GarantiaFull | null) =>
  !!g && g.items.some((it) => (it.article?.garantiaMeses ?? 0) > 0);

// =====================================================================
// COMPROBANTE DE VENTA
// =====================================================================
export function ComprobanteDoc({ v, empresa }: { v: SaleFull; empresa?: Empresa }) {
  const nro = `${v.establecimiento}-${v.puntoExpedicion}-${v.numero}`;
  const cuotasPendientes = (v.installments ?? [])
    .map((c) => ({ ...c, saldo: Number(c.montoCuota) - Number(c.montoPagado ?? 0) }))
    .filter((c) => c.saldo > 0);

  return (
    <>
      {v.estado === "ANULADO" && <AnuladoBanner />}

      <div className="flex items-start justify-between border-b-2 border-slate-300 pb-4">
        <div>
          <div className="text-lg font-bold text-slate-900">{empresa?.razonSocial ?? "Empresa"}</div>
          {empresa?.nombreFantasia && <div className="text-slate-500">{empresa.nombreFantasia}</div>}
        </div>
        <div className="text-right">
          <div className="text-base font-bold uppercase tracking-wide text-slate-900">Comprobante de venta</div>
          <div className="font-mono text-slate-600">N {nro}</div>
          {v.timbrado && <div className="text-slate-500">Timbrado: {v.timbrado}</div>}
          <div className="text-slate-500">Fecha: {fmtFecha(v.fecha)}</div>
          <div className="text-slate-500">{v.condicion === "CREDITO" ? "Credito" : "Contado"}</div>
        </div>
      </div>

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

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1">
          {Number(v.subtotalExenta) > 0 && <TotalRow label="Exentas" value={v.subtotalExenta} />}
          {Number(v.subtotal5) > 0 && <TotalRow label="Gravadas 5%" value={v.subtotal5} />}
          {Number(v.iva5) > 0 && <TotalRow label="IVA 5%" value={v.iva5} />}
          {Number(v.subtotal10) > 0 && <TotalRow label="Gravadas 10%" value={v.subtotal10} />}
          {Number(v.iva10) > 0 && <TotalRow label="IVA 10%" value={v.iva10} />}
          <div className="flex justify-between border-t-2 border-slate-300 pt-1 text-base font-bold text-slate-900">
            <span>Total</span>
            <span className="font-mono">{formatGs(v.total)} Gs</span>
          </div>
        </div>
      </div>

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

      {v.condicion === "CREDITO" && cuotasPendientes.length > 0 && (
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
              {cuotasPendientes.map((c) => (
                <tr key={c.id} className="border-b border-slate-200">
                  <td className="py-1 font-mono">{c.nroCuota}</td>
                  <td className="py-1">{fmtFecha(c.fechaVencimiento)}</td>
                  <td className="py-1 text-right font-mono">{formatGs(c.saldo)}</td>
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
    </>
  );
}

// =====================================================================
// PAGARE (formato clasico) — por el TOTAL de la venta
// =====================================================================
export function PagareDoc({ v, empresa }: { v: SaleFull; empresa?: Empresa }) {
  const nro = `${v.establecimiento}-${v.puntoExpedicion}-${v.numero}`;
  const total = Number(v.total);
  const cuotas = (v.installments ?? []).slice().sort((a, b) => a.nroCuota - b.nroCuota);
  const ultVenc = cuotas.length > 0 ? cuotas[cuotas.length - 1].fechaVencimiento : v.fecha;
  const enLetras = `Guaranies ${numeroALetras(total)}`.toUpperCase();
  const cli = v.customer.person;

  return (
    <>
      {v.estado === "ANULADO" && <AnuladoBanner />}

      <div className="rounded-lg border-2 border-slate-500 p-6 leading-8 text-slate-800">
        {/* Nº y monto en cifras */}
        <div className="flex items-center justify-between font-mono text-base">
          <span>
            N&deg; <span className="font-semibold underline">{nro}</span>
          </span>
          <span>
            Por Gs. <span className="font-semibold underline">{formatGs(total)}</span>
          </span>
        </div>

        <div className="mt-5">{fmtFechaLarga(v.fecha)}</div>
        <div>
          Pagar&eacute;(emos) incondicionalmente a la orden de{" "}
          <span className="font-semibold underline">{empresa?.razonSocial ?? "la empresa"}</span>
        </div>

        <div className="my-5 text-center text-4xl font-bold tracking-[0.4em] text-slate-900">PAGAR&Eacute;</div>

        <div>
          la cantidad de <span className="font-semibold underline">{enLetras}</span>{" "}
          (<span className="font-mono">{formatGs(total)} Gs</span>)
        </div>
        <div>
          por <span className="font-semibold underline">saldo de la venta a cr&eacute;dito N&deg; {nro}</span>
          {cuotas.length > 0 && (
            <>
              , pagadera en {cuotas.length} cuota(s) seg&uacute;n el detalle al pie, quedando saldada la deuda
              el <span className="font-semibold underline">{fmtFecha(ultVenc)}</span>
            </>
          )}
          .
        </div>
        <div>
          Domicilio del deudor: <span className="font-semibold underline">{cli.direccion ?? "—"}</span>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          La falta de pago de cualquier cuota a su vencimiento producir&aacute; la caducidad de los plazos y
          har&aacute; exigible la totalidad de la deuda, devengando el inter&eacute;s moratorio de plaza desde
          la mora hasta su efectiva cancelaci&oacute;n, sin necesidad de protesto ni interpelaci&oacute;n previa.
        </p>

        <div className="mt-12 flex justify-end">
          <div className="w-72 border-t border-slate-500 pt-1 text-center text-xs text-slate-600">
            Firma del deudor
            <div className="mt-0.5 font-medium text-slate-800">{cli.razonSocial}</div>
            <div className="text-slate-500">C.I. / RUC: {cli.ruc ?? cli.nroDoc}</div>
          </div>
        </div>
      </div>

      {cuotas.length > 0 && (
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
              {cuotas.map((c) => (
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
    </>
  );
}

// =====================================================================
// RECIBO DE DINERO — por la entrega inicial
// =====================================================================
export function ReciboDoc({ v, empresa }: { v: SaleFull; empresa?: Empresa }) {
  const nro = `${v.establecimiento}-${v.puntoExpedicion}-${v.numero}`;
  const entrega = Number(v.entregaInicial);
  const enLetras = `Guaranies ${numeroALetras(entrega)}`.toUpperCase();
  const cli = v.customer.person;
  const medios = (v.payments ?? []).filter((p) => Number(p.monto) > 0);

  return (
    <>
      {v.estado === "ANULADO" && <AnuladoBanner />}

      <div className="rounded-xl border-2 border-slate-300 p-6">
        <div className="flex items-start justify-between border-b border-slate-300 pb-3">
          <div>
            <div className="text-lg font-bold text-slate-900">{empresa?.razonSocial ?? "Empresa"}</div>
            {empresa?.nombreFantasia && <div className="text-slate-500">{empresa.nombreFantasia}</div>}
          </div>
          <div className="text-right">
            <div className="text-base font-bold uppercase tracking-wide text-slate-900">Recibo de dinero</div>
            <div className="text-slate-500">Fecha: {fmtFecha(v.fecha)}</div>
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-400">Recibimos</span>
          <span className="font-mono text-2xl font-bold text-slate-900">{formatGs(entrega)} Gs</span>
        </div>

        <p className="mt-4 leading-relaxed text-slate-700">
          Recib&iacute;(mos) de <strong>{cli.razonSocial}</strong>
          {cli.ruc || cli.nroDoc ? ` (C.I. / RUC ${cli.ruc ?? cli.nroDoc})` : ""} la suma de{" "}
          <strong>{enLetras}</strong> (<span className="font-mono">{formatGs(entrega)} Gs</span>), en concepto
          de <strong>entrega inicial</strong> de la venta a cr&eacute;dito N {nro} por un total de{" "}
          <span className="font-mono">{formatGs(v.total)} Gs</span>.
        </p>

        {medios.length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Forma de pago</div>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
              {medios.map((p) => (
                <span key={p.id}>
                  {MEDIO_PAGO_LABEL[p.medio]}: <span className="font-mono">{formatGs(p.monto)} Gs</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1">
            <div className="flex justify-between text-slate-600">
              <span>Total venta</span>
              <span className="font-mono">{formatGs(v.total)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Entrega recibida</span>
              <span className="font-mono">{formatGs(entrega)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold text-slate-900">
              <span>Saldo a financiar</span>
              <span className="font-mono">{formatGs(Number(v.total) - entrega)} Gs</span>
            </div>
          </div>
        </div>

        <div className="mt-12 flex justify-end">
          <div className="w-64 border-t border-slate-400 pt-1 text-center text-xs text-slate-500">
            Firma y sello
            <div className="mt-0.5 font-medium text-slate-700">{empresa?.razonSocial ?? "Empresa"}</div>
          </div>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// RECIBO DE DINERO — formato TICKET 80mm (impresora termica)
// =====================================================================
// Mismo contenido que ReciboDoc pero maquetado en una columna angosta (~72mm de
// contenido dentro de un rollo de 80mm). Va en un trabajo de impresion separado con
// @page { size: 80mm auto } (ver /print/recibo). Todo en texto chico y monoespaciado.
export function ReciboTicketDoc({ v, empresa }: { v: SaleFull; empresa?: Empresa }) {
  const nro = `${v.establecimiento}-${v.puntoExpedicion}-${v.numero}`;
  const entrega = Number(v.entregaInicial);
  const enLetras = `Guaranies ${numeroALetras(entrega)}`.toUpperCase();
  const cli = v.customer.person;
  const medios = (v.payments ?? []).filter((p) => Number(p.monto) > 0);
  const saldo = Number(v.total) - entrega;

  return (
    <div className="mx-auto w-[72mm] font-mono text-[11px] leading-tight text-black">
      {v.estado === "ANULADO" && (
        <div className="mb-2 border border-black py-1 text-center text-xs font-bold uppercase tracking-widest">
          Anulado
        </div>
      )}

      {/* Encabezado */}
      <div className="text-center">
        <div className="text-sm font-bold uppercase">{empresa?.razonSocial ?? "Empresa"}</div>
        {empresa?.nombreFantasia && <div>{empresa.nombreFantasia}</div>}
        <div className="mt-1 font-bold uppercase tracking-wide">Recibo de dinero</div>
      </div>

      <Dashed />

      <Row2 l="Fecha" r={fmtFecha(v.fecha)} />
      <Row2 l="Venta N" r={nro} />

      <Dashed />

      {/* Cliente */}
      <div>
        <div className="font-bold uppercase">Cliente</div>
        <div>{cli.razonSocial}</div>
        <div>C.I./RUC: {cli.ruc ?? cli.nroDoc}</div>
      </div>

      <Dashed />

      {/* Monto recibido */}
      <div className="text-center">
        <div className="uppercase">Recibimos</div>
        <div className="text-lg font-bold">{formatGs(entrega)} Gs</div>
      </div>
      <div className="mt-1 text-center text-[10px]">{enLetras}</div>

      <Dashed />

      <div className="text-[10px]">
        En concepto de entrega inicial de la venta a credito N {nro}.
      </div>

      {medios.length > 0 && (
        <>
          <Dashed />
          <div className="font-bold uppercase">Forma de pago</div>
          {medios.map((p) => (
            <Row2 key={p.id} l={MEDIO_PAGO_LABEL[p.medio]} r={`${formatGs(p.monto)} Gs`} />
          ))}
        </>
      )}

      <Dashed />

      <Row2 l="Total venta" r={`${formatGs(v.total)} Gs`} />
      <Row2 l="Entrega" r={`${formatGs(entrega)} Gs`} />
      <div className="mt-0.5 flex justify-between border-t border-black pt-0.5 font-bold">
        <span>Saldo</span>
        <span>{formatGs(saldo)} Gs</span>
      </div>

      <div className="mt-10 text-center text-[10px]">
        <div className="mx-auto w-4/5 border-t border-black pt-1">Firma y sello</div>
        <div className="font-bold">{empresa?.razonSocial ?? "Empresa"}</div>
      </div>

      <div className="mt-3 text-center text-[9px]">¡Gracias por su pago!</div>
    </div>
  );
}

// Separador punteado a lo ancho del ticket.
function Dashed() {
  return <div className="my-1 border-t border-dashed border-black" />;
}

// Fila etiqueta izquierda / valor derecha, para el ticket.
function Row2({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0">{l}</span>
      <span className="text-right">{r}</span>
    </div>
  );
}

// =====================================================================
// CERTIFICADO DE GARANTIA
// =====================================================================
export function GarantiaDoc({ g, empresa }: { g: GarantiaFull; empresa?: Empresa }) {
  const nro = `${g.establecimiento}-${g.puntoExpedicion}-${g.numero}`;
  const items = g.items.filter((it) => (it.article?.garantiaMeses ?? 0) > 0);
  if (items.length === 0) return null;

  return (
    <>
      <div className="flex items-start justify-between border-b-2 border-slate-300 pb-4">
        <div>
          <div className="text-lg font-bold text-slate-900">{empresa?.razonSocial ?? "Empresa"}</div>
          {empresa?.nombreFantasia && <div className="text-slate-500">{empresa.nombreFantasia}</div>}
        </div>
        <div className="text-right">
          <div className="text-base font-bold uppercase tracking-wide text-slate-900">Certificado de garantia</div>
          <div className="font-mono text-slate-600">Venta N {nro}</div>
          <div className="text-slate-500">Fecha: {fmtFecha(g.fecha)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Cliente</div>
        <div className="font-medium text-slate-900">{g.customer.person.razonSocial}</div>
        <div className="text-slate-600">
          {g.customer.person.ruc ?? g.customer.person.nroDoc}
          {g.customer.person.telefono ? ` · ${g.customer.person.telefono}` : ""}
        </div>
        {g.customer.person.direccion && <div className="text-slate-600">{g.customer.person.direccion}</div>}
      </div>

      <p className="mt-5 text-slate-600">
        Por el presente se certifica que los siguientes articulos adquiridos gozan de garantia por el periodo
        indicado, contado a partir de la fecha de compra:
      </p>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Articulo</th>
            <th className="py-2 text-right">Cant.</th>
            <th className="py-2 text-center">Garantia</th>
            <th className="py-2 text-center">Vence</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const meses = it.article!.garantiaMeses;
            const series = it.article?.controlaSerie ? g.serialsByArticle[String(it.article.id)] ?? [] : [];
            return (
              <tr key={it.id} className="border-b border-slate-200 align-top">
                <td className="py-2">
                  <div className="text-slate-900">{it.article?.descripcion}</div>
                  <div className="font-mono text-xs text-slate-400">{it.article?.codigo}</div>
                  {series.length > 0 && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      N de serie: <span className="font-mono">{series.join(", ")}</span>
                    </div>
                  )}
                </td>
                <td className="py-2 text-right font-mono">{Number(it.cantidad)}</td>
                <td className="py-2 text-center">{meses} {meses === 1 ? "mes" : "meses"}</td>
                <td className="py-2 text-center font-mono">{fechaVencimientoGarantia(g.fecha, meses)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-6 text-xs leading-relaxed text-slate-500">
        <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Condiciones de la garantia</div>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>La garantia cubre defectos de fabricacion en condiciones normales de uso.</li>
          <li>Presentar este certificado junto con el comprobante de compra para hacer valer la garantia.</li>
          <li>La garantia no cubre danos por mal uso, golpes, humedad, sobretension electrica ni manipulacion por terceros no autorizados.</li>
          <li>El periodo de garantia se cuenta a partir de la fecha de compra indicada en este certificado.</li>
        </ul>
      </div>

      <div className="mt-12 flex justify-between gap-8">
        <div className="flex-1 border-t border-slate-300 pt-1 text-center text-xs text-slate-500">
          Firma y sello del vendedor
        </div>
        <div className="flex-1 border-t border-slate-300 pt-1 text-center text-xs text-slate-500">
          Firma del cliente
        </div>
      </div>
    </>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-mono">{formatGs(value)}</span>
    </div>
  );
}
