"use client";

import { useEffect, useState } from "react";
import { Calculator, RefreshCw, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatGs } from "@/lib/format";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useListQuery } from "@/lib/useListQuery";

type TipoTx = "VENTA" | "COMPRA" | "NOTA_CREDITO" | "NOTA_CREDITO_COMPRA" | "COBRO" | "PAGO";

interface Transaccion {
  tipo: TipoTx;
  id: number;
  clave: string;
  sucursal: string | null;
  numero: string;
  tipoMov: string;
  fecha: string;
  createdAt: string;
  usuario: string | null;
  creadoDesde: string;
  moneda: string;
  tipoCambio: number;
  estado: string;
  tercero: string | null;
  documento: string | null;
  exento: number;
  gravado: number;
  iva: number;
  total: number;
  saldo: number;
  observacion: string | null;
  contable: EstadoContable;
  errorContable: string | null;
}

type EstadoContable = "OK" | "PENDIENTE" | "ERROR" | "SIN_ASIENTO";

const CONTABLE_BADGE: Record<EstadoContable, { label: string; className: string }> = {
  OK: { label: "Si", className: "bg-accent/10 text-accent" },
  PENDIENTE: { label: "Pendiente", className: "bg-amber-50 text-amber-700" },
  ERROR: { label: "Error", className: "bg-red-50 text-red-600" },
  SIN_ASIENTO: { label: "-", className: "text-slate-400" },
};

interface Subdiario {
  transaccion: Transaccion;
  filas: Array<{
    id: number;
    asiento: number | null;
    fecha: string;
    tipoMov: string;
    numero: string;
    observacion: string | null;
    glosa: string;
    cuenta: string;
    debe: number;
    haber: number;
  }>;
  totales: { debe: number; haber: number };
  pendientes: Array<{ tipo: string; error: string | null }>;
}

const TIPO_LABEL: Record<TipoTx, string> = {
  VENTA: "Facturas emitidas",
  COMPRA: "Facturas recibidas",
  NOTA_CREDITO: "Notas de credito emitidas",
  NOTA_CREDITO_COMPRA: "Notas de credito recibidas",
  COBRO: "Cobros",
  PAGO: "Pagos a proveedores",
};

const MONEDA_LABEL: Record<string, string> = { PYG: "GUARANI", USD: "DOLAR" };

function fmtFecha(iso: string) {
  return iso?.slice(0, 10).split("-").reverse().join("/");
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Solo las facturas emitidas/recibidas vigentes se pueden anular desde aca.
const ANULABLES: TipoTx[] = ["VENTA", "COMPRA"];

function motivoNoAnulable(t: Transaccion): string | null {
  if (!ANULABLES.includes(t.tipo)) return "Este tipo de documento no se anula desde aca";
  if (t.estado === "ANULADO") return "El documento ya esta anulado";
  return null;
}

const accionBtn =
  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-30";

function buildColumns(
  monedaLocal: boolean,
  onDetalle: (t: Transaccion) => void,
  onSubdiario: (t: Transaccion) => void,
  onAnular: (t: Transaccion) => void
): DataColumn<Transaccion>[] {
  // En moneda local los montos se convierten con el tipo de cambio del documento.
  const monto = (t: Transaccion, v: number) => formatGs(monedaLocal ? v * t.tipoCambio : v);
  return [
    {
      header: "",
      align: "center",
      render: (t) => (
        <button
          type="button"
          onClick={() => onDetalle(t)}
          title="Ver datos del documento"
          aria-label={`Ver datos del documento ${t.numero}`}
          className={`${accionBtn} text-primary hover:bg-muted`}
        >
          <Search className="h-4 w-4" />
        </button>
      ),
    },
    { key: "clave", header: "Clave", render: (t) => <span className="font-mono text-xs text-slate-600">{t.clave}</span> },
    { key: "sucursal", header: "Sucursal", render: (t) => <span className="text-slate-600">{t.sucursal ?? "-"}</span> },
    {
      key: "numero",
      header: "Numero de documento",
      render: (t) => <span className="font-mono text-xs font-semibold text-secondary">{t.numero}</span>,
    },
    {
      key: "tipoMov",
      header: "Tipo de Mov.",
      render: (t) => (
        <div className="whitespace-nowrap">
          <span className="text-foreground">{t.tipoMov}</span>
          {t.estado === "ANULADO" && (
            <span className="ml-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">Anulado</span>
          )}
        </div>
      ),
    },
    { key: "fecha", header: "Fecha de documento", render: (t) => <span className="text-slate-600">{fmtFecha(t.fecha)}</span> },
    { header: "Fecha de operacion", render: (t) => <span className="text-slate-600">{fmtFecha(t.fecha)}</span> },
    {
      key: "creadoEl",
      header: "Creado el",
      render: (t) => <span className="whitespace-nowrap text-xs text-slate-600">{fmtFechaHora(t.createdAt)}</span>,
    },
    { key: "usuario", header: "Creado por", render: (t) => <span className="text-slate-600">{t.usuario ?? "-"}</span> },
    { key: "creadoDesde", header: "Creado desde", align: "center", render: (t) => <span className="text-slate-600">{t.creadoDesde}</span> },
    {
      key: "moneda",
      header: "Moneda",
      render: (t) => <span className="text-slate-600">{monedaLocal ? "GUARANI" : MONEDA_LABEL[t.moneda] ?? t.moneda}</span>,
    },
    {
      header: "Acciones",
      align: "center",
      render: (t) => {
        const noAnulable = motivoNoAnulable(t);
        return (
          <div className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onSubdiario(t)}
              title="Listar subdiario de control"
              aria-label={`Subdiario de control de ${t.numero}`}
              className={`${accionBtn} text-secondary hover:bg-muted`}
            >
              <Calculator className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onAnular(t)}
              disabled={!!noAnulable}
              title={noAnulable ?? "Anular el documento"}
              aria-label={`Anular ${t.numero}`}
              className={`${accionBtn} text-secondary hover:bg-red-50 hover:text-red-600`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
    {
      key: "contable",
      header: "Contabilizado",
      align: "center",
      render: (t) => {
        const b = CONTABLE_BADGE[t.contable];
        return (
          <span title={t.errorContable ?? undefined} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}>
            {b.label}
          </span>
        );
      },
    },
    { key: "tercero", header: "Cliente / Proveedor", render: (t) => <span className="text-foreground">{t.tercero ?? "-"}</span> },
    { header: "Exento", align: "right", render: (t) => <span className="font-mono">{monto(t, t.exento)}</span> },
    { header: "Gravado", align: "right", render: (t) => <span className="font-mono">{monto(t, t.gravado)}</span> },
    { header: "IVA", align: "right", render: (t) => <span className="font-mono">{monto(t, t.iva)}</span> },
    { key: "total", header: "Total", align: "right", render: (t) => <span className="font-mono font-medium">{monto(t, t.total)}</span> },
    { key: "saldo", header: "Saldo", align: "right", render: (t) => <span className="font-mono">{monto(t, t.saldo)}</span> },
  ];
}

export default function TransaccionesPage() {
  const { companyId } = useAuth();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState("");
  const [contable, setContable] = useState("");
  const [monedaLocal, setMonedaLocal] = useState(false);
  const [detalleDe, setDetalleDe] = useState<Transaccion | null>(null);
  const [subdiarioDe, setSubdiarioDe] = useState<Transaccion | null>(null);
  const [anularDe, setAnularDe] = useState<Transaccion | null>(null);

  const list = useListQuery<Transaccion>("/transacciones", {
    defaultSort: "creadoEl",
    defaultDir: "desc",
    pageSize: 50,
    reloadKey: companyId,
    extraParams: { desde, hasta, tipo, contable },
  });

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">Ver transacciones registradas y su impacto</h1>
          <span className="font-mono text-xs font-semibold text-slate-400">FINC009</span>
        </div>
        <p className="text-sm text-slate-500">
          Comprobantes de la empresa activa y su impacto contable (subdiario de control).
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Field label="Buscar" htmlFor="tx-q">
            <Input
              id="tx-q"
              placeholder="Numero, cliente/proveedor, tipo..."
              value={list.q}
              onChange={(e) => list.setQ(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Tipo" htmlFor="tx-tipo">
            <Select id="tx-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="Contabilizado" htmlFor="tx-contable">
            <Select id="tx-contable" value={contable} onChange={(e) => setContable(e.target.value)}>
              <option value="">Todos</option>
              <option value="OK">Si</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="ERROR">Con error</option>
            </Select>
          </Field>
        </div>
        <Field label="Fecha desde" htmlFor="tx-desde">
          <Input id="tx-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Fecha hasta" htmlFor="tx-hasta">
          <Input id="tx-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Moneda de los montos">
            <button
              type="button"
              aria-pressed={monedaLocal}
              onClick={() => setMonedaLocal(true)}
              className={`h-10 cursor-pointer px-3 text-sm font-medium transition-colors ${monedaLocal ? "bg-accent text-white" : "bg-white text-secondary hover:bg-muted"}`}
            >
              en Moneda Local
            </button>
            <button
              type="button"
              aria-pressed={!monedaLocal}
              onClick={() => setMonedaLocal(false)}
              className={`h-10 cursor-pointer border-l border-border px-3 text-sm font-medium transition-colors ${!monedaLocal ? "bg-accent text-white" : "bg-white text-secondary hover:bg-muted"}`}
            >
              en Moneda del Documento
            </button>
          </div>
          <Button variant="outline" onClick={list.reload}>
            Actualizar <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DataTable
        columns={buildColumns(monedaLocal, setDetalleDe, setSubdiarioDe, setAnularDe)}
        rows={list.rows}
        loading={list.loading}
        rowKey={(t) => t.clave}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onPage={list.setPage}
        onPageSize={list.setPageSize}
        emptyTitle={list.q || tipo || contable || desde || hasta ? "Sin resultados" : "No hay transacciones registradas"}
        emptyDescription={list.q || tipo || contable || desde || hasta ? "Proba con otros filtros." : undefined}
      />

      <DocumentoModal transaccion={detalleDe} onClose={() => setDetalleDe(null)} />
      <SubdiarioModal transaccion={subdiarioDe} onClose={() => setSubdiarioDe(null)} />
      <AnularModal transaccion={anularDe} onClose={() => setAnularDe(null)} onAnulado={list.reload} />
    </div>
  );
}

interface MotivoAnulacion {
  id: number;
  codigo: string;
  descripcion: string;
}

// Abreviatura del documento para el combo "Documento a anular" (ej FCRR = fact. cred. recibida).
const ABREV_DOC: Record<string, string> = {
  "FACT.CRED.EMIT.": "FCRE",
  "FACT.CONT.EMIT.": "FCOE",
  "FACT.CRED.REC.": "FCRR",
  "FACT.CONT.REC.": "FCOR",
};

// Anular el documento: pide motivo (catalogo), observacion y si figura en el Libro IVA.
function AnularModal({
  transaccion,
  onClose,
  onAnulado,
}: {
  transaccion: Transaccion | null;
  onClose: () => void;
  onAnulado: () => void;
}) {
  const { notify } = useToast();
  const [motivos, setMotivos] = useState<MotivoAnulacion[]>([]);
  const [motivoId, setMotivoId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [enLibroIva, setEnLibroIva] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!transaccion) return;
    setMotivoId("");
    setObservacion("");
    setEnLibroIva(false);
    setResultado(null);
    setTouched(false);
    api<MotivoAnulacion[]>("/transacciones/motivos-anulacion")
      .then(setMotivos)
      .catch(() => setMotivos([]));
  }, [transaccion]);

  const libro = transaccion?.tipo === "COMPRA" ? "Libro IVA Compras" : "Libro IVA Ventas";
  const anulado = resultado?.ok === true;

  async function anular() {
    if (!transaccion) return;
    setTouched(true);
    if (!motivoId) return;
    setSaving(true);
    try {
      await api(`/transacciones/${transaccion.tipo}/${transaccion.id}/anular`, {
        method: "POST",
        body: JSON.stringify({ motivoAnulacionId: Number(motivoId), observacion: observacion.trim() || null, enLibroIva }),
      });
      setResultado({ ok: true, mensaje: `Documento ${transaccion.numero} anulado correctamente.` });
      notify("success", "Documento anulado");
      onAnulado();
    } catch (err) {
      setResultado({ ok: false, mensaje: err instanceof Error ? err.message : "No se pudo anular el documento" });
    } finally {
      setSaving(false);
    }
  }

  const t = transaccion;
  const segBtn = (activo: boolean) =>
    `h-8 cursor-pointer px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${activo ? "bg-destructive text-white" : "bg-white text-secondary hover:bg-muted"}`;

  return (
    <Modal
      open={!!t}
      onClose={onClose}
      title="Anular el documento"
      size="lg"
      confirmClose={!anulado && (!!motivoId || !!observacion)}
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="danger" onClick={onClose}>
            {anulado ? "Cerrar" : "Cancelar"}
          </Button>
          <Button variant="outline" onClick={anular} loading={saving} disabled={anulado}>
            Anular
          </Button>
        </div>
      }
    >
      {t && (
        <div className="space-y-4">
          <Field label="Documento a anular" htmlFor="anul-doc" required>
            <Input
              id="anul-doc"
              readOnly
              value={`${ABREV_DOC[t.tipoMov] ?? t.tipoMov}: ${t.numero} - Fec.Oper.: ${fmtFecha(t.fecha)}${t.tercero ? ` - ${t.tercero}` : ""}`}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              ¿Desea que aparezca en el {libro}?<span className="ml-0.5 text-destructive">*</span>
            </p>
            <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label={`Aparece en el ${libro}`}>
              <button type="button" aria-pressed={enLibroIva} disabled={anulado} onClick={() => setEnLibroIva(true)} className={segBtn(enLibroIva)}>
                Si
              </button>
              <button
                type="button"
                aria-pressed={!enLibroIva}
                disabled={anulado}
                onClick={() => setEnLibroIva(false)}
                className={`border-l border-border ${segBtn(!enLibroIva)}`}
              >
                No
              </button>
            </div>
          </div>

          <Field
            label="Motivo de anulacion"
            htmlFor="anul-motivo"
            required
            error={touched && !motivoId ? "Selecciona el motivo de anulacion" : null}
          >
            <Select id="anul-motivo" value={motivoId} disabled={anulado} onChange={(e) => setMotivoId(e.target.value)}>
              <option value="">Seleccione una opcion de la lista</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.descripcion} - {m.codigo}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Observacion de anulacion" htmlFor="anul-obs">
            <textarea
              id="anul-obs"
              rows={3}
              maxLength={500}
              value={observacion}
              disabled={anulado}
              onChange={(e) => setObservacion(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted"
            />
          </Field>

          <div className="rounded-lg border border-dashed border-border px-3 py-2">
            <p className="text-xs font-medium text-slate-500">Resultado de la anulacion</p>
            {resultado ? (
              <p role="status" className={`mt-1 text-sm ${resultado.ok ? "text-accent" : "text-red-600"}`}>
                {resultado.mensaje}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">-</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// Listar subdiario de control: lineas de asiento que genero la transaccion.
function SubdiarioModal({ transaccion, onClose }: { transaccion: Transaccion | null; onClose: () => void }) {
  const [data, setData] = useState<Subdiario | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transaccion) return;
    setData(null);
    setError(null);
    setLoading(true);
    api<Subdiario>(`/transacciones/${transaccion.tipo}/${transaccion.id}/subdiario`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el subdiario"))
      .finally(() => setLoading(false));
  }, [transaccion]);

  const t = data?.transaccion ?? transaccion;

  return (
    <Modal open={!!transaccion} onClose={onClose} title="Listar subdiario de control" size="xl">
      {t && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <span className="font-semibold text-foreground">
              Razon Social: {t.tercero ?? "-"}
              {t.documento ? ` - ${t.documento}` : ""}
            </span>
            <span className="font-mono text-xs text-slate-500">Clave = {t.clave}</span>
          </div>

          {loading ? (
            <p className="py-8 text-center text-slate-500">Cargando...</p>
          ) : error ? (
            <p className="py-8 text-center text-red-600">{error}</p>
          ) : data && data.filas.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              {data.pendientes.length > 0 ? (
                <>
                  <p>No se pudo generar el asiento automaticamente; el evento contable quedo pendiente.</p>
                  <p>Corregi la causa y se reintenta en la proxima operacion o desde &quot;Procesar eventos contables&quot;.</p>
                  {data.pendientes
                    .filter((p) => p.error)
                    .map((p, i) => (
                      <p key={i} className="mt-2 text-red-600">Error: {p.error}</p>
                    ))}
                </>
              ) : (
                <p>Esta transaccion no tiene asientos contables.</p>
              )}
            </div>
          ) : data ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Tipo Mov.</th>
                    <th className="px-3 py-2 font-medium">Numero</th>
                    <th className="px-3 py-2 font-medium">Observacion</th>
                    <th className="px-3 py-2 font-medium">Cuenta contable</th>
                    <th className="px-3 py-2 text-right font-medium">Debe</th>
                    <th className="px-3 py-2 text-right font-medium">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtFecha(f.fecha)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{f.tipoMov}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-secondary">{f.numero}</td>
                      <td className="px-3 py-2 text-slate-600" title={f.glosa}>{f.observacion ?? "-"}</td>
                      <td className="px-3 py-2 text-foreground">{f.cuenta}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatGs(f.debe)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatGs(f.haber)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td colSpan={5} className="px-3 py-2 text-right text-xs text-slate-500">
                      {data.filas.length > 0 && `1 - ${data.filas.length}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatGs(data.totales.debe)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatGs(data.totales.haber)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

interface LineaDetalle {
  descripcion: string[];
  cantidad: number;
  ivaTipo: string;
  exento: number;
  gravado: number;
  iva: number;
  total: number;
}

interface DatosDocumento {
  transaccion: Transaccion;
  timbrado: string | null;
  medioPago: string | null;
  documentoPadre: string | null;
  articulos: LineaDetalle[];
  conceptos: LineaDetalle[];
  cuentas: LineaDetalle[];
  cheques: Array<{
    id: number;
    tipo: string;
    banco: string | null;
    numero: string;
    fechaEmision: string;
    fechaCobro: string;
    estado: string;
    monto: number;
  }>;
  mediosVenta: Array<{ id: number; medio: string; monto: number }>;
  cuotas: Array<{ id: number; nroCuota: number; vencimiento: string; monto: number; pagado: number; saldo: number; estado: string }>;
  aplicaciones: Array<{ id: number; documento: string; nroCuota: number; vencimiento: string; monto: number }>;
  relacionados: Array<{ tipo: TipoTx; id: number; tipoMov: string; numero: string; fecha: string; total: number }>;
}

type TabDoc = "todo" | "encabezado" | "detalle" | "medios" | "cuotas" | "relacionados";
type VistaDetalle = "articulos" | "conceptos" | "cuentas";

const TABS_DOC: Array<{ key: TabDoc; label: string }> = [
  { key: "todo", label: "Mostrar todo" },
  { key: "encabezado", label: "Encabezado" },
  { key: "detalle", label: "Detalle de documento" },
  { key: "medios", label: "Cheques y Tarjetas" },
  { key: "cuotas", label: "Cuotas y Pagos" },
  { key: "relacionados", label: "Comprobantes Relacionados" },
];

const VISTAS_DETALLE: Array<{ key: VistaDetalle; label: string; columna: string }> = [
  { key: "articulos", label: "Articulos", columna: "Articulo" },
  { key: "conceptos", label: "Conceptos", columna: "Conceptos" },
  { key: "cuentas", label: "Cuentas Contables", columna: "Cuentas contables" },
];

const MEDIO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta de debito",
  TARJETA_CREDITO: "Tarjeta de credito",
  TRANSFERENCIA: "Transferencia",
  CHEQUE: "Cheque",
};

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2";
const theadRow = "border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500";
const bodyRow = "border-b border-border last:border-0";

function Seccion({ titulo, children, acciones }: { titulo: string; children: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        {acciones}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function SinDatos({ texto }: { texto: string }) {
  return <p className="py-4 text-center text-sm text-slate-500">{texto}</p>;
}

// Datos del documento (lupa): encabezado, detalle (articulos / conceptos / cuentas),
// cheques y tarjetas, cuotas y pagos, y comprobantes relacionados.
function DocumentoModal({ transaccion, onClose }: { transaccion: Transaccion | null; onClose: () => void }) {
  const [data, setData] = useState<DatosDocumento | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabDoc>("todo");
  const [vista, setVista] = useState<VistaDetalle>("articulos");

  useEffect(() => {
    if (!transaccion) return;
    setData(null);
    setError(null);
    setTab("todo");
    setVista("articulos");
    setLoading(true);
    api<DatosDocumento>(`/transacciones/${transaccion.tipo}/${transaccion.id}/detalle`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los datos del documento"))
      .finally(() => setLoading(false));
  }, [transaccion]);

  const ver = (k: TabDoc) => tab === "todo" || tab === k;

  return (
    <Modal open={!!transaccion} onClose={onClose} title="Datos del documento" size="xl">
      <div role="tablist" aria-label="Secciones del documento" className="mb-3 flex flex-wrap gap-1 border-b border-border">
        {TABS_DOC.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === x.key ? "border-primary font-semibold text-primary" : "border-transparent text-secondary hover:text-foreground"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-slate-500">Cargando...</p>
      ) : error ? (
        <p className="py-8 text-center text-red-600">{error}</p>
      ) : data ? (
        <div className="space-y-4">
          {ver("encabezado") && <Encabezado data={data} />}
          {ver("detalle") && (
            <Seccion
              titulo="Detalle de documento"
              acciones={
                <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Vista del detalle">
                  {VISTAS_DETALLE.map((v, i) => (
                    <button
                      key={v.key}
                      type="button"
                      aria-pressed={vista === v.key}
                      onClick={() => setVista(v.key)}
                      className={`h-8 cursor-pointer px-3 text-sm font-medium transition-colors ${i > 0 ? "border-l border-border" : ""} ${
                        vista === v.key ? "bg-accent text-white" : "bg-white text-secondary hover:bg-muted"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              }
            >
              <TablaDetalle
                columna={VISTAS_DETALLE.find((v) => v.key === vista)!.columna}
                lineas={vista === "articulos" ? data.articulos : vista === "conceptos" ? data.conceptos : data.cuentas}
              />
            </Seccion>
          )}
          {ver("medios") && <MediosPago data={data} />}
          {ver("cuotas") && <CuotasPagos data={data} />}
          {ver("relacionados") && <Relacionados data={data} />}
        </div>
      ) : null}
    </Modal>
  );
}

function Encabezado({ data }: { data: DatosDocumento }) {
  const t = data.transaccion;
  const filas: Array<[string, React.ReactNode]> = [
    ["Clave", t.clave],
    ["Tipo de Movimiento", t.tipoMov],
    ["Numero de documento", t.numero],
    ["Timbrado", data.timbrado],
    ["Sucursal", t.sucursal],
    ["Cliente/Proveedor", t.tercero ? `${t.tercero}${t.documento ? ` - ${t.documento}` : ""}` : null],
    ["Medio de pago", data.medioPago ? MEDIO_LABEL[data.medioPago] ?? data.medioPago : null],
    ["Moneda", MONEDA_LABEL[t.moneda] ?? t.moneda],
    ["Tasa", formatGs(t.tipoCambio)],
    ["Fecha de Documento", fmtFecha(t.fecha)],
    ["Creado el", fmtFechaHora(t.createdAt)],
    ["Creado por", t.usuario],
    ["Creado desde", t.creadoDesde],
    ["Estado", t.estado === "ANULADO" ? <span className="font-medium text-red-600">Anulado</span> : "Vigente"],
    ["Exento", formatGs(t.exento)],
    ["Gravado", formatGs(t.gravado)],
    ["Iva", formatGs(t.iva)],
    ["Total", formatGs(t.total)],
    ["Saldo", formatGs(t.saldo)],
    ["Observacion", t.observacion],
    ["Documento Padre", data.documentoPadre],
  ];
  return (
    <Seccion titulo="Encabezado">
      <dl className="divide-y divide-border text-sm">
        {filas.map(([k, v]) => (
          <div key={k} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <dt className="text-slate-600">{k}</dt>
            <dd className="text-foreground">{v ?? ""}</dd>
          </div>
        ))}
      </dl>
    </Seccion>
  );
}

function TablaDetalle({ columna, lineas }: { columna: string; lineas: LineaDetalle[] }) {
  if (lineas.length === 0) return <SinDatos texto="Este documento no tiene detalle de articulos." />;
  const sum = (k: "exento" | "gravado" | "iva" | "total") => lineas.reduce((s, l) => s + l[k], 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className={theadRow}>
            <th className={th}>Item</th>
            <th className={th}>{columna}</th>
            <th className={`${th} text-right`}>Cantidad</th>
            <th className={th}>Tipo de Iva</th>
            <th className={`${th} text-right`}>Exento</th>
            <th className={`${th} text-right`}>Gravado</th>
            <th className={`${th} text-right`}>IVA</th>
            <th className={`${th} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} className={bodyRow}>
              <td className={`${td} text-slate-600`}>{i + 1}</td>
              <td className={`${td} text-foreground`}>
                {l.descripcion.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </td>
              <td className={`${td} text-right font-mono`}>{formatGs(l.cantidad)}</td>
              <td className={`${td} text-slate-600`}>{l.ivaTipo}</td>
              <td className={`${td} text-right font-mono`}>{formatGs(l.exento)}</td>
              <td className={`${td} text-right font-mono`}>{formatGs(l.gravado)}</td>
              <td className={`${td} text-right font-mono`}>{formatGs(l.iva)}</td>
              <td className={`${td} text-right font-mono`}>{formatGs(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/40 font-semibold">
            <td colSpan={4} className={`${td} text-xs text-slate-500`}>Total de Informe:</td>
            <td className={`${td} text-right font-mono`}>{formatGs(sum("exento"))}</td>
            <td className={`${td} text-right font-mono`}>{formatGs(sum("gravado"))}</td>
            <td className={`${td} text-right font-mono`}>{formatGs(sum("iva"))}</td>
            <td className={`${td} text-right font-mono`}>{formatGs(sum("total"))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function MediosPago({ data }: { data: DatosDocumento }) {
  return (
    <Seccion titulo="Cheques y Tarjetas">
      {data.cheques.length === 0 && data.mediosVenta.length === 0 ? (
        <SinDatos texto="Este documento no tiene cheques ni tarjetas." />
      ) : (
        <div className="space-y-3">
          {data.cheques.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Cheque</th>
                    <th className={th}>Banco</th>
                    <th className={th}>Emision</th>
                    <th className={th}>Cobro</th>
                    <th className={th}>Estado</th>
                    <th className={`${th} text-right`}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cheques.map((c) => (
                    <tr key={c.id} className={bodyRow}>
                      <td className={`${td} font-mono text-xs`}>{c.numero}</td>
                      <td className={td}>{c.banco ?? "-"}</td>
                      <td className={`${td} text-slate-600`}>{fmtFecha(c.fechaEmision)}</td>
                      <td className={`${td} text-slate-600`}>{fmtFecha(c.fechaCobro)}</td>
                      <td className={td}>{c.estado}</td>
                      <td className={`${td} text-right font-mono`}>{formatGs(c.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.mediosVenta.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className={theadRow}>
                    <th className={th}>Medio de pago</th>
                    <th className={`${th} text-right`}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.mediosVenta.map((m) => (
                    <tr key={m.id} className={bodyRow}>
                      <td className={td}>{MEDIO_LABEL[m.medio] ?? m.medio}</td>
                      <td className={`${td} text-right font-mono`}>{formatGs(m.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Seccion>
  );
}

function CuotasPagos({ data }: { data: DatosDocumento }) {
  return (
    <Seccion titulo="Cuotas y Pagos">
      {data.cuotas.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Cuota</th>
                <th className={th}>Vencimiento</th>
                <th className={th}>Estado</th>
                <th className={`${th} text-right`}>Monto</th>
                <th className={`${th} text-right`}>Pagado</th>
                <th className={`${th} text-right`}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.cuotas.map((c) => (
                <tr key={c.id} className={bodyRow}>
                  <td className={td}>{c.nroCuota}</td>
                  <td className={`${td} text-slate-600`}>{fmtFecha(c.vencimiento)}</td>
                  <td className={td}>{c.estado}</td>
                  <td className={`${td} text-right font-mono`}>{formatGs(c.monto)}</td>
                  <td className={`${td} text-right font-mono`}>{formatGs(c.pagado)}</td>
                  <td className={`${td} text-right font-mono`}>{formatGs(c.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data.aplicaciones.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Factura</th>
                <th className={th}>Cuota</th>
                <th className={th}>Vencimiento</th>
                <th className={`${th} text-right`}>Monto aplicado</th>
              </tr>
            </thead>
            <tbody>
              {data.aplicaciones.map((a) => (
                <tr key={a.id} className={bodyRow}>
                  <td className={`${td} font-mono text-xs text-secondary`}>{a.documento}</td>
                  <td className={td}>{a.nroCuota}</td>
                  <td className={`${td} text-slate-600`}>{fmtFecha(a.vencimiento)}</td>
                  <td className={`${td} text-right font-mono`}>{formatGs(a.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <SinDatos texto="Este documento no tiene cuotas ni pagos aplicados." />
      )}
    </Seccion>
  );
}

function Relacionados({ data }: { data: DatosDocumento }) {
  return (
    <Seccion titulo="Comprobantes Relacionados">
      {data.relacionados.length === 0 ? (
        <SinDatos texto="No hay comprobantes relacionados." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRow}>
                <th className={th}>Tipo de Mov.</th>
                <th className={th}>Numero</th>
                <th className={th}>Fecha</th>
                <th className={`${th} text-right`}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {data.relacionados.map((r) => (
                <tr key={`${r.tipo}-${r.id}`} className={bodyRow}>
                  <td className={td}>{r.tipoMov}</td>
                  <td className={`${td} font-mono text-xs text-secondary`}>{r.numero}</td>
                  <td className={`${td} text-slate-600`}>{fmtFecha(r.fecha)}</td>
                  <td className={`${td} text-right font-mono`}>{formatGs(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}
