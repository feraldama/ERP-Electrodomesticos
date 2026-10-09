import { Router } from "express";
import { Prisma, type IvaTipo } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { z } from "zod";
import { buildWordSearchSql, paginated, parseListParams } from "../lib/listQuery.js";
import { parseRange } from "../lib/fechas.js";
import { contabilizar } from "../lib/contabilizar.js";
import { userCan } from "../services/permissions.js";
import { anularSale } from "../services/sales.js";
import { anularPurchase, partesIvaItem } from "../services/purchases.js";
import { desglosarIvaIncluido } from "../services/iva.js";

// =====================================================================
// TRANSACCIONES REGISTRADAS Y SU IMPACTO (FINC009)
// Vista unificada de todos los comprobantes de la empresa (ventas, compras,
// notas de credito, cobros y pagos) con sus montos y saldo, y el subdiario de
// control: las lineas de asiento contable que genero cada transaccion.
// =====================================================================
export const transaccionesRouter = Router();
transaccionesRouter.use(authRequired, companyRequired);

// Tipo de transaccion -> origenes de asiento que la componen (el documento y su
// eventual reversa). `tipo` coincide con el origenTipo del documento.
const TIPOS = ["VENTA", "COMPRA", "NOTA_CREDITO", "NOTA_CREDITO_COMPRA", "COBRO", "PAGO"] as const;
type TipoTx = (typeof TIPOS)[number];

const ORIGENES_REVERSA: Partial<Record<TipoTx, string>> = {
  VENTA: "ANULACION_VENTA",
  COMPRA: "ANULACION_COMPRA",
};

// Saldo de cada compra a credito vigente. Los pagos a proveedores no se imputan a
// facturas concretas, asi que se reparten FIFO: lo pagado al proveedor (pagos menos
// cheques rechazados/anulados, mas las NC que no rebajan una compra a credito
// puntual) cancela primero sus compras mas antiguas. Las NC sobre una compra a
// credito rebajan esa misma compra. Coincide con el saldo de su cuenta corriente.
function saldosCompraSql(companyId: number): Prisma.Sql {
  return Prisma.sql`
    SELECT b.id,
      GREATEST(b.pendiente - GREATEST(COALESCE(pool.monto, 0) - COALESCE(b."acumPrevio", 0), 0), 0) AS saldo
    FROM (
      SELECT a.id, a."supplierId", a.pendiente,
        SUM(a.pendiente) OVER (PARTITION BY a."supplierId" ORDER BY a.fecha, a.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS "acumPrevio"
      FROM (
        SELECT p2.id, p2."supplierId", p2.fecha,
          GREATEST(p2.total - COALESCE((SELECT SUM(n.total) FROM purchase_credit_notes n WHERE n."invoiceId" = p2.id), 0), 0) AS pendiente
        FROM purchase_invoices p2
        WHERE p2."companyId" = ${companyId} AND p2.condicion = 'CREDITO' AND p2.estado <> 'ANULADO'
      ) a
    ) b
    LEFT JOIN (
      SELECT m.sid, SUM(m.monto) AS monto FROM (
        SELECT pm."supplierId" AS sid, pm."montoTotal" AS monto
        FROM payments_made pm WHERE pm."companyId" = ${companyId}
        UNION ALL
        SELECT pm."supplierId", -ch.monto
        FROM checks ch JOIN payments_made pm ON pm.id = ch."paymentMadeId"
        WHERE ch."companyId" = ${companyId} AND ch.estado IN ('RECHAZADO', 'ANULADO')
        UNION ALL
        SELECT n."supplierId", n.total
        FROM purchase_credit_notes n LEFT JOIN purchase_invoices pi2 ON pi2.id = n."invoiceId"
        WHERE n."companyId" = ${companyId}
          AND (pi2.id IS NULL OR pi2.condicion <> 'CREDITO' OR pi2.estado = 'ANULADO')
      ) m GROUP BY m.sid
    ) pool ON pool.sid = b."supplierId"
  `;
}

// Union de todos los comprobantes con columnas homogeneas. Montos en moneda del
// documento (el front convierte a moneda local con tipoCambio).
function txSql(companyId: number): Prisma.Sql {
  const pad = (col: string) => Prisma.raw(`lpad(${col}::text, 7, '0')`);
  // Estado contable de la transaccion segun sus eventos: OK (asentado), PENDIENTE,
  // ERROR (fallo el posteo, con su motivo) o SIN_ASIENTO (no genera eventos).
  // `extra`: condicion adicional sobre e (ej. reversas de cheques de un pago).
  const contable = (pares: Array<[string, string]>, extra?: string) => {
    const cond = [...pares.map(([t, c]) => `(e."origenTipo" = '${t}' AND e."origenId" = ${c})`), ...(extra ? [extra] : [])].join(" OR ");
    return Prisma.raw(`(SELECT CASE WHEN COUNT(*) = 0 THEN 'SIN_ASIENTO'
        WHEN bool_or(NOT e.procesado AND e.error IS NOT NULL) THEN 'ERROR'
        WHEN bool_or(NOT e.procesado) THEN 'PENDIENTE' ELSE 'OK' END
      FROM accounting_events e WHERE e."companyId" = ${companyId} AND (${cond})) AS contable,
      (SELECT MIN(e.error) FROM accounting_events e
      WHERE e."companyId" = ${companyId} AND NOT e.procesado AND (${cond})) AS "errorContable"`);
  };
  // Cobros y pagos no guardan cuando se cargaron: se toma el alta de su evento
  // contable (mismo momento), y si no existe, la fecha del documento.
  const altaEvento = (origenTipo: string, col: string) =>
    Prisma.raw(`COALESCE((SELECT MIN(e."createdAt") FROM accounting_events e
      WHERE e."companyId" = ${companyId} AND e."origenTipo" = '${origenTipo}' AND e."origenId" = ${col}), ${col.split(".")[0]}.fecha)`);
  return Prisma.sql`
    SELECT 'VENTA'::text AS tipo, si.id, 'VTA-' || si.id AS clave,
      COALESCE(b1.nombre, b2.nombre) || ' - ' || si.establecimiento AS sucursal,
      si.establecimiento || '-' || si."puntoExpedicion" || '-' || si.numero AS numero,
      CASE WHEN si.condicion = 'CREDITO' THEN 'FACT.CRED.EMIT.' ELSE 'FACT.CONT.EMIT.' END AS "tipoMov",
      si.fecha, si."createdAt", upper(u.username) AS usuario, 'FAC'::text AS "creadoDesde",
      si.moneda, si."tipoCambio"::float8 AS "tipoCambio", si.estado::text AS estado,
      p."razonSocial" AS tercero, COALESCE(p.ruc, p."nroDoc") AS documento,
      si."subtotalExenta"::float8 AS exento, (si.subtotal5 + si.subtotal10)::float8 AS gravado,
      (si.iva5 + si.iva10)::float8 AS iva, si.total::float8 AS total,
      (CASE WHEN si.estado = 'ANULADO' OR si.condicion <> 'CREDITO' THEN 0
        ELSE COALESCE((SELECT SUM(i."montoCuota" - i."montoPagado") FROM installments i WHERE i."invoiceId" = si.id), 0)
      END)::float8 AS saldo,
      NULLIF(btrim(si.observacion), '') AS observacion,
      ${contable([["VENTA", "si.id"], ["ANULACION_VENTA", "si.id"]])}
    FROM sales_invoices si
    JOIN customers c ON c.id = si."customerId"
    JOIN persons p ON p.id = c."personId"
    LEFT JOIN branches b1 ON b1.id = si."branchId"
    LEFT JOIN branches b2 ON b2."companyId" = si."companyId" AND b2.codigo = si.establecimiento
    LEFT JOIN users u ON u.id = si."usuarioId"
    WHERE si."companyId" = ${companyId}

    UNION ALL
    SELECT 'COMPRA', pi.id, 'COM-' || pi.id, NULL, pi."nroComprobante",
      CASE WHEN pi.condicion = 'CREDITO' THEN 'FACT.CRED.REC.' ELSE 'FACT.CONT.REC.' END,
      pi.fecha, pi."createdAt", upper(u.username), 'COM',
      pi.moneda, pi."tipoCambio"::float8, pi.estado::text,
      p."razonSocial", COALESCE(p.ruc, p."nroDoc"),
      pi."subtotalExenta"::float8, (pi.subtotal5 + pi.subtotal10)::float8,
      (pi.iva5 + pi.iva10)::float8, pi.total::float8,
      COALESCE(sc.saldo, 0)::float8,
      NULLIF(btrim(pi.observacion), ''),
      ${contable([["COMPRA", "pi.id"], ["ANULACION_COMPRA", "pi.id"]])}
    FROM purchase_invoices pi
    LEFT JOIN (${saldosCompraSql(companyId)}) sc ON sc.id = pi.id
    JOIN suppliers s ON s.id = pi."supplierId"
    JOIN persons p ON p.id = s."personId"
    LEFT JOIN users u ON u.id = pi."usuarioId"
    WHERE pi."companyId" = ${companyId}

    UNION ALL
    SELECT 'NOTA_CREDITO', nc.id, 'NCV-' || nc.id, NULL, nc.numero, 'N.CRED.EMIT.',
      nc.fecha, nc."createdAt", upper(u.username), 'NCV',
      COALESCE(si.moneda, 'PYG'), COALESCE(si."tipoCambio", 1)::float8, 'CONFIRMADO',
      p."razonSocial", COALESCE(p.ruc, p."nroDoc"),
      nc."subtotalExenta"::float8, (nc.subtotal5 + nc.subtotal10)::float8,
      (nc.iva5 + nc.iva10)::float8, nc.total::float8, 0::float8,
      NULLIF(btrim(nc.motivo), ''),
      ${contable([["NOTA_CREDITO", "nc.id"]])}
    FROM sales_credit_notes nc
    LEFT JOIN sales_invoices si ON si.id = nc."invoiceId"
    LEFT JOIN customers c ON c.id = si."customerId"
    LEFT JOIN persons p ON p.id = c."personId"
    LEFT JOIN users u ON u.id = nc."usuarioId"
    WHERE nc."companyId" = ${companyId}

    UNION ALL
    SELECT 'NOTA_CREDITO_COMPRA', nc.id, 'NCC-' || nc.id, NULL, nc."nroComprobante", 'N.CRED.REC.',
      nc.fecha, nc."createdAt", upper(u.username), 'NCC',
      'PYG', 1::float8, 'CONFIRMADO',
      p."razonSocial", COALESCE(p.ruc, p."nroDoc"),
      nc."subtotalExenta"::float8, (nc.subtotal5 + nc.subtotal10)::float8,
      (nc.iva5 + nc.iva10)::float8, nc.total::float8, 0::float8,
      NULLIF(btrim(nc.motivo), ''),
      ${contable([["NOTA_CREDITO_COMPRA", "nc.id"]])}
    FROM purchase_credit_notes nc
    JOIN suppliers s ON s.id = nc."supplierId"
    JOIN persons p ON p.id = s."personId"
    LEFT JOIN users u ON u.id = nc."usuarioId"
    WHERE nc."companyId" = ${companyId}

    UNION ALL
    SELECT 'COBRO', pr.id, 'COB-' || pr.id, NULL, ${pad("pr.id")}, 'RECIBO EMIT.',
      pr.fecha, ${altaEvento("COBRO", "pr.id")}, upper(u.username), 'COB',
      'PYG', 1::float8, 'CONFIRMADO',
      p."razonSocial", COALESCE(p.ruc, p."nroDoc"),
      0::float8, 0::float8, 0::float8, pr."montoTotal"::float8, 0::float8,
      NULLIF(btrim(pr.observacion), ''),
      ${contable([["COBRO", "pr.id"]])}
    FROM payments_received pr
    JOIN customers c ON c.id = pr."customerId"
    JOIN persons p ON p.id = c."personId"
    LEFT JOIN users u ON u.id = pr."usuarioId"
    WHERE pr."companyId" = ${companyId}

    UNION ALL
    SELECT 'PAGO', pm.id, 'PAG-' || pm.id, NULL, ${pad("pm.id")}, 'PAGO PROV.',
      pm.fecha, ${altaEvento("PAGO", "pm.id")}, upper(u.username), 'PAG',
      'PYG', 1::float8, 'CONFIRMADO',
      p."razonSocial", COALESCE(p.ruc, p."nroDoc"),
      0::float8, 0::float8, 0::float8, pm."montoTotal"::float8, 0::float8,
      NULLIF(btrim(pm.observacion), ''),
      ${contable([["PAGO", "pm.id"]], `(e."origenTipo" = 'CHEQUE_REVERSA' AND e."origenId" IN (SELECT ch.id FROM checks ch WHERE ch."paymentMadeId" = pm.id))`)}
    FROM payments_made pm
    JOIN suppliers s ON s.id = pm."supplierId"
    JOIN persons p ON p.id = s."personId"
    LEFT JOIN users u ON u.id = pm."usuarioId"
    WHERE pm."companyId" = ${companyId}
  `;
}

interface TxRow {
  tipo: TipoTx;
  id: number;
  clave: string;
  sucursal: string | null;
  numero: string;
  tipoMov: string;
  fecha: Date;
  createdAt: Date;
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
  contable: "OK" | "PENDIENTE" | "ERROR" | "SIN_ASIENTO";
  errorContable: string | null;
}

// Clave publica de columna -> expresion SQL sobre la union (whitelist).
const SORTABLE: Record<string, string> = {
  clave: "clave",
  sucursal: "sucursal",
  numero: "numero",
  tipoMov: `"tipoMov"`,
  fecha: "fecha",
  creadoEl: `"createdAt"`,
  usuario: "usuario",
  creadoDesde: `"creadoDesde"`,
  moneda: "moneda",
  tercero: "tercero",
  total: "total",
  saldo: "saldo",
  contable: "contable",
};

transaccionesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take, sort, dir } = parseListParams(req.query, {
      sortable: SORTABLE,
      defaultSort: "creadoEl",
      defaultDir: "desc",
      defaultPageSize: 50,
    });
    const fecha = parseRange(req);
    const tipo = TIPOS.find((t) => t === req.query.tipo);
    const estadoContable = ["OK", "PENDIENTE", "ERROR"].find((e) => e === req.query.contable);
    const q = (req.query.q as string | undefined)?.trim();

    const where = Prisma.join(
      [
        fecha?.gte ? Prisma.sql`fecha >= ${fecha.gte}` : Prisma.sql`TRUE`,
        fecha?.lte ? Prisma.sql`fecha <= ${fecha.lte}` : Prisma.sql`TRUE`,
        tipo ? Prisma.sql`tipo = ${tipo}` : Prisma.sql`TRUE`,
        estadoContable ? Prisma.sql`contable = ${estadoContable}` : Prisma.sql`TRUE`,
        buildWordSearchSql(q, ["clave", "numero", `"tipoMov"`, "tercero", "documento", "usuario", "sucursal"]),
      ],
      " AND "
    );
    const tx = txSql(req.companyId!);
    const orderBy = Prisma.raw(`${SORTABLE[sort]} ${dir} NULLS LAST, "createdAt" ${dir}, id ${dir}`);

    const [items, countRows] = await Promise.all([
      prisma.$queryRaw<TxRow[]>`
        SELECT * FROM (${tx}) tx WHERE ${where} ORDER BY ${orderBy} LIMIT ${take} OFFSET ${skip}
      `,
      prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total FROM (${tx}) tx WHERE ${where}
      `,
    ]);
    res.json(paginated(items, countRows[0]?.total ?? 0, page, pageSize));
  })
);

// Catalogo de motivos de anulacion (activos).
transaccionesRouter.get(
  "/motivos-anulacion",
  asyncHandler(async (_req, res) => {
    const motivos = await prisma.motivoAnulacion.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, descripcion: true },
      orderBy: { descripcion: "asc" },
    });
    res.json(motivos);
  })
);

// Anular el documento: solo facturas emitidas (VENTA) y recibidas (COMPRA). Cada
// tipo exige el permiso de su programa de carga, igual que su propio /anular.
const ANULABLES = {
  VENTA: { permiso: "VENI001", origenTipo: "ANULACION_VENTA", anular: anularSale },
  COMPRA: { permiso: "COMI001", origenTipo: "ANULACION_COMPRA", anular: anularPurchase },
} as const;

const anularSchema = z.object({
  motivoAnulacionId: z.number().int().positive(),
  observacion: z.string().trim().max(500).optional().nullable(),
  enLibroIva: z.boolean(),
});

transaccionesRouter.post(
  "/:tipo/:id/anular",
  asyncHandler(async (req, res) => {
    const cfg = ANULABLES[req.params.tipo as keyof typeof ANULABLES];
    const id = Number(req.params.id);
    if (!cfg || !Number.isInteger(id)) throw new HttpError(400, "Este tipo de documento no se puede anular");
    if (!(await userCan(req.auth!.userId, cfg.permiso))) throw new HttpError(403, "No tenes permiso para esta accion");

    const parsed = anularSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Selecciona el motivo de anulacion");
    const motivo = await prisma.motivoAnulacion.findFirst({ where: { id: parsed.data.motivoAnulacionId, activo: true } });
    if (!motivo) throw new HttpError(400, "Motivo de anulacion invalido");

    try {
      const result = await prisma.$transaction((tx) =>
        cfg.anular(tx, {
          companyId: req.companyId!,
          invoiceId: id,
          usuarioId: req.auth?.userId ?? null,
          motivoAnulacionId: motivo.id,
          observacion: parsed.data.observacion ?? null,
          enLibroIva: parsed.data.enLibroIva,
        })
      );
      await contabilizar(res, req.companyId!, [{ origenTipo: cfg.origenTipo, origenId: result.id }]);
      res.json(result);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Error) throw new HttpError(400, err.message);
      throw err;
    }
  })
);

// --- Datos del documento (lupa): encabezado, detalle, medios, cuotas y relacionados ---

// Momento contable y claves de respaldo de cada tipo con items (igual que el posteo).
const DETALLE_CFG: Partial<
  Record<TipoTx, { moments: Array<"compra" | "venta" | "devolucion">; claveGrav: (iva: IvaTipo) => string; claveExenta: string; ivaPrefix: string }>
> = {
  VENTA: { moments: ["venta"], claveGrav: (i) => (i === "IVA5" ? "VENTAS_5" : "VENTAS_10"), claveExenta: "VENTAS_EXENTA", ivaPrefix: "IVA_DEBITO" },
  NOTA_CREDITO: { moments: ["devolucion", "venta"], claveGrav: (i) => (i === "IVA5" ? "VENTAS_5" : "VENTAS_10"), claveExenta: "VENTAS_EXENTA", ivaPrefix: "IVA_DEBITO" },
  COMPRA: { moments: ["compra"], claveGrav: () => "COMPRAS_GRAV", claveExenta: "COMPRAS_EXENTA", ivaPrefix: "IVA_CREDITO" },
  NOTA_CREDITO_COMPRA: { moments: ["devolucion", "compra"], claveGrav: () => "COMPRAS_GRAV", claveExenta: "COMPRAS_EXENTA", ivaPrefix: "IVA_CREDITO" },
};

const IVA_LABEL: Record<IvaTipo, string> = { IVA10: "10%", IVA5: "5%", EXENTA: "Exenta" };

interface ItemDoc {
  articleId: number;
  codigo: string;
  descripcion: string;
  categoryId: number | null;
  categoria: string | null;
  cantidad: number;
  ivaTipo: IvaTipo;
  total: number;
}

async function itemsDe(tipo: TipoTx, id: number): Promise<ItemDoc[]> {
  const article = { select: { codigo: true, descripcion: true, categoryId: true, category: { select: { nombre: true } } } };
  const rows: Array<{ articleId: number; cantidad: Prisma.Decimal; ivaTipo: IvaTipo; total: Prisma.Decimal; article: { codigo: string; descripcion: string; categoryId: number | null; category: { nombre: string } | null } }> =
    tipo === "VENTA"
      ? await prisma.salesInvoiceItem.findMany({ where: { invoiceId: id }, include: { article }, orderBy: { id: "asc" } })
      : tipo === "COMPRA"
        ? await prisma.purchaseInvoiceItem.findMany({ where: { invoiceId: id }, include: { article }, orderBy: { id: "asc" } })
        : tipo === "NOTA_CREDITO"
          ? await prisma.salesCreditNoteItem.findMany({ where: { creditNoteId: id }, include: { article }, orderBy: { id: "asc" } })
          : tipo === "NOTA_CREDITO_COMPRA"
            ? await prisma.purchaseCreditNoteItem.findMany({ where: { creditNoteId: id }, include: { article }, orderBy: { id: "asc" } })
            : [];
  // Compras: una linea puede tener varias tasas -> una fila por tasa (la cantidad va en la primera).
  if (tipo === "COMPRA") {
    const tasas = await prisma.purchaseInvoiceItem.findMany({
      where: { invoiceId: id },
      select: { id: true, ivaTipo: true, total: true, importe10: true, importe5: true, importeExenta: true },
      orderBy: { id: "asc" },
    });
    return rows.flatMap((r, i) =>
      partesIvaItem(tasas[i]).map((p, j) => ({
        articleId: r.articleId,
        codigo: r.article.codigo,
        descripcion: r.article.descripcion,
        categoryId: r.article.categoryId,
        categoria: r.article.category?.nombre ?? null,
        cantidad: j === 0 ? Number(r.cantidad) : 0,
        ivaTipo: p.ivaTipo,
        total: p.total,
      }))
    );
  }
  return rows.map((r) => ({
    articleId: r.articleId,
    codigo: r.article.codigo,
    descripcion: r.article.descripcion,
    categoryId: r.article.categoryId,
    categoria: r.article.category?.nombre ?? null,
    cantidad: Number(r.cantidad),
    ivaTipo: r.ivaTipo,
    total: Number(r.total),
  }));
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

// Agrupa lineas por clave sumando cantidades y montos (orden de primera aparicion).
function agrupar(lineas: Array<LineaDetalle & { key: string }>): LineaDetalle[] {
  const map = new Map<string, LineaDetalle>();
  for (const { key, ...l } of lineas) {
    const acc = map.get(key);
    if (!acc) {
      map.set(key, { ...l });
      continue;
    }
    acc.cantidad += l.cantidad;
    acc.exento += l.exento;
    acc.gravado += l.gravado;
    acc.iva += l.iva;
    acc.total += l.total;
  }
  return [...map.values()];
}

transaccionesRouter.get(
  "/:tipo/:id/detalle",
  asyncHandler(async (req, res) => {
    const tipo = TIPOS.find((t) => t === req.params.tipo);
    const id = Number(req.params.id);
    if (!tipo || !Number.isInteger(id)) throw new HttpError(404, "Transaccion no encontrada");
    const companyId = req.companyId!;

    const [doc] = await prisma.$queryRaw<TxRow[]>`
      SELECT * FROM (${txSql(companyId)}) tx WHERE tipo = ${tipo} AND id = ${id}
    `;
    if (!doc) throw new HttpError(404, "Transaccion no encontrada");

    // Datos propios de cada tipo que no estan en la union.
    let timbrado: string | null = null;
    let medioPago: string | null = null;
    let documentoPadre: string | null = null;
    if (tipo === "VENTA") {
      timbrado = (await prisma.salesInvoice.findUnique({ where: { id }, select: { timbrado: true } }))?.timbrado ?? null;
    } else if (tipo === "COMPRA") {
      timbrado = (await prisma.purchaseInvoice.findUnique({ where: { id }, select: { timbrado: true } }))?.timbrado ?? null;
    } else if (tipo === "NOTA_CREDITO") {
      const nc = await prisma.salesCreditNote.findUnique({
        where: { id },
        select: { invoice: { select: { establecimiento: true, puntoExpedicion: true, numero: true } } },
      });
      if (nc?.invoice) documentoPadre = `FACT. ${nc.invoice.establecimiento}-${nc.invoice.puntoExpedicion}-${nc.invoice.numero}`;
    } else if (tipo === "NOTA_CREDITO_COMPRA") {
      const nc = await prisma.purchaseCreditNote.findUnique({ where: { id }, select: { invoice: { select: { nroComprobante: true } } } });
      if (nc?.invoice) documentoPadre = `FACT. ${nc.invoice.nroComprobante}`;
    } else if (tipo === "COBRO") {
      medioPago = (await prisma.paymentReceived.findUnique({ where: { id }, select: { metodo: true } }))?.metodo ?? null;
    } else if (tipo === "PAGO") {
      medioPago = (await prisma.paymentMade.findUnique({ where: { id }, select: { metodo: true } }))?.metodo ?? null;
    }

    // --- Detalle: articulos, conceptos (categoria + IVA) y cuentas contables ---
    const items = await itemsDe(tipo, id);
    const cfg = DETALLE_CFG[tipo];
    const lineas = items.map((it) => {
      const { neto, iva } = desglosarIvaIncluido(it.total, it.ivaTipo);
      const exenta = it.ivaTipo === "EXENTA";
      return { it, exento: exenta ? neto : 0, gravado: exenta ? 0 : neto, iva, total: neto + iva };
    });

    const articulos: LineaDetalle[] = lineas.map((l) => ({
      descripcion: [`${l.it.descripcion} - Cod ${l.it.codigo}`],
      cantidad: l.it.cantidad,
      ivaTipo: IVA_LABEL[l.it.ivaTipo],
      exento: l.exento,
      gravado: l.gravado,
      iva: l.iva,
      total: l.total,
    }));

    let conceptos: LineaDetalle[] = [];
    let cuentas: LineaDetalle[] = [];
    if (cfg && items.length > 0) {
      const ivaNombre = (i: IvaTipo) => `${cfg.ivaPrefix === "IVA_DEBITO" ? "IVA DEBITO" : "IVA CREDITO"} ${IVA_LABEL[i]}`;
      conceptos = agrupar(
        lineas.map((l) => {
          const cat = l.it.categoria ?? "SIN CATEGORIA";
          const exenta = l.it.ivaTipo === "EXENTA";
          return {
            key: `${l.it.categoryId ?? 0}|${l.it.ivaTipo}`,
            descripcion: exenta ? [`Exento: ${cat}`] : [`Grav: ${cat}`, `IVA: ${ivaNombre(l.it.ivaTipo)}`],
            cantidad: l.it.cantidad,
            ivaTipo: IVA_LABEL[l.it.ivaTipo],
            exento: l.exento,
            gravado: l.gravado,
            iva: l.iva,
            total: l.total,
          };
        })
      );

      // Cuenta de cada linea: la de su categoria para el momento contable o, si no
      // tiene, la clave global de respaldo (mismo criterio que el posteo).
      const [catConfigs, claves] = await Promise.all([
        prisma.categoryAccountConfig.findMany({
          where: { companyId, categoryId: { in: [...new Set(items.map((i) => i.categoryId).filter((c): c is number => c != null))] } },
          select: { categoryId: true, cuentaCompraId: true, cuentaVentaId: true, cuentaDevolucionId: true },
        }),
        prisma.accountingConfig.findMany({ where: { companyId }, select: { clave: true, accountId: true } }),
      ]);
      const catCfg = new Map(catConfigs.map((c) => [c.categoryId, c]));
      const claveCfg = new Map(claves.map((c) => [c.clave, c.accountId]));
      const cuentaDe = (it: ItemDoc): number | null => {
        const c = it.categoryId != null ? catCfg.get(it.categoryId) : undefined;
        if (c) {
          for (const m of cfg.moments) {
            const acc = m === "compra" ? c.cuentaCompraId : m === "venta" ? c.cuentaVentaId : c.cuentaDevolucionId;
            if (acc != null) return acc;
          }
        }
        return claveCfg.get(it.ivaTipo === "EXENTA" ? cfg.claveExenta : cfg.claveGrav(it.ivaTipo)) ?? null;
      };
      const ivaCuentaDe = (i: IvaTipo) => (i === "EXENTA" ? null : claveCfg.get(`${cfg.ivaPrefix}_${i === "IVA5" ? "5" : "10"}`) ?? null);

      const idsCuentas = new Set<number>();
      for (const l of lineas) {
        const a = cuentaDe(l.it);
        const b = ivaCuentaDe(l.it.ivaTipo);
        if (a) idsCuentas.add(a);
        if (b) idsCuentas.add(b);
      }
      const plan = await prisma.chartOfAccount.findMany({ where: { id: { in: [...idsCuentas] } }, select: { id: true, codigo: true, nombre: true } });
      const nombreCuenta = new Map(plan.map((c) => [c.id, `${c.codigo} - ${c.nombre}`]));
      const nom = (accId: number | null) => (accId ? nombreCuenta.get(accId) ?? `Cuenta ${accId}` : "SIN CUENTA CONFIGURADA");

      cuentas = agrupar(
        lineas.map((l) => {
          const acc = cuentaDe(l.it);
          const ivaAcc = ivaCuentaDe(l.it.ivaTipo);
          const exenta = l.it.ivaTipo === "EXENTA";
          return {
            key: `${acc ?? 0}|${ivaAcc ?? 0}|${l.it.ivaTipo}`,
            descripcion: exenta ? [`Exento: ${nom(acc)}`] : [`Grav: ${nom(acc)}`, `IVA: ${nom(ivaAcc)}`],
            cantidad: l.it.cantidad,
            ivaTipo: IVA_LABEL[l.it.ivaTipo],
            exento: l.exento,
            gravado: l.gravado,
            iva: l.iva,
            total: l.total,
          };
        })
      );
    }

    // --- Cheques y tarjetas ---
    const cheques =
      tipo === "COBRO" || tipo === "PAGO"
        ? (
            await prisma.check.findMany({
              where: { companyId, ...(tipo === "COBRO" ? { paymentReceivedId: id } : { paymentMadeId: id }) },
              orderBy: { id: "asc" },
            })
          ).map((c) => ({
            id: c.id,
            tipo: c.tipo,
            banco: c.banco,
            numero: c.numero,
            fechaEmision: c.fechaEmision,
            fechaCobro: c.fechaCobro,
            estado: c.estado,
            monto: Number(c.monto),
          }))
        : [];
    const mediosVenta =
      tipo === "VENTA"
        ? (await prisma.salesPayment.findMany({ where: { companyId, invoiceId: id }, orderBy: { id: "asc" } })).map((p) => ({
            id: p.id,
            medio: p.medio as string,
            monto: Number(p.monto),
          }))
        : [];

    // --- Cuotas y pagos ---
    let cuotas: Array<{ id: number; nroCuota: number; vencimiento: Date; monto: number; pagado: number; saldo: number; estado: string }> = [];
    let aplicaciones: Array<{ id: number; documento: string; nroCuota: number; vencimiento: Date; monto: number }> = [];
    if (tipo === "VENTA") {
      cuotas = (await prisma.installment.findMany({ where: { invoiceId: id }, orderBy: { nroCuota: "asc" } })).map((c) => ({
        id: c.id,
        nroCuota: c.nroCuota,
        vencimiento: c.fechaVencimiento,
        monto: Number(c.montoCuota),
        pagado: Number(c.montoPagado),
        saldo: Number(c.montoCuota) - Number(c.montoPagado),
        estado: c.estado,
      }));
    } else if (tipo === "COBRO") {
      const apps = await prisma.installmentPayment.findMany({
        where: { paymentId: id },
        include: { installment: { include: { invoice: { select: { establecimiento: true, puntoExpedicion: true, numero: true } } } } },
        orderBy: { id: "asc" },
      });
      aplicaciones = apps.map((a) => ({
        id: a.id,
        documento: `${a.installment.invoice.establecimiento}-${a.installment.invoice.puntoExpedicion}-${a.installment.invoice.numero}`,
        nroCuota: a.installment.nroCuota,
        vencimiento: a.installment.fechaVencimiento,
        monto: Number(a.monto),
      }));
    }

    // --- Comprobantes relacionados ---
    const relacionados: Array<{ tipo: TipoTx; id: number; tipoMov: string; numero: string; fecha: Date; total: number }> = [];
    if (tipo === "VENTA") {
      const [ncs, cobros] = await Promise.all([
        prisma.salesCreditNote.findMany({ where: { companyId, invoiceId: id }, orderBy: { fecha: "asc" } }),
        prisma.paymentReceived.findMany({
          where: { companyId, allocations: { some: { installment: { invoiceId: id } } } },
          include: { allocations: { where: { installment: { invoiceId: id } }, select: { monto: true } } },
          orderBy: { fecha: "asc" },
        }),
      ]);
      for (const n of ncs) relacionados.push({ tipo: "NOTA_CREDITO", id: n.id, tipoMov: "N.CRED.EMIT.", numero: n.numero, fecha: n.fecha, total: Number(n.total) });
      for (const c of cobros)
        relacionados.push({
          tipo: "COBRO",
          id: c.id,
          tipoMov: "RECIBO EMIT.",
          numero: String(c.id).padStart(7, "0"),
          fecha: c.fecha,
          total: c.allocations.reduce((s, a) => s + Number(a.monto), 0),
        });
    } else if (tipo === "COMPRA") {
      const ncs = await prisma.purchaseCreditNote.findMany({ where: { companyId, invoiceId: id }, orderBy: { fecha: "asc" } });
      for (const n of ncs)
        relacionados.push({ tipo: "NOTA_CREDITO_COMPRA", id: n.id, tipoMov: "N.CRED.REC.", numero: n.nroComprobante, fecha: n.fecha, total: Number(n.total) });
    } else if (tipo === "NOTA_CREDITO") {
      const nc = await prisma.salesCreditNote.findUnique({ where: { id }, select: { invoice: true } });
      const f = nc?.invoice;
      if (f)
        relacionados.push({
          tipo: "VENTA",
          id: f.id,
          tipoMov: f.condicion === "CREDITO" ? "FACT.CRED.EMIT." : "FACT.CONT.EMIT.",
          numero: `${f.establecimiento}-${f.puntoExpedicion}-${f.numero}`,
          fecha: f.fecha,
          total: Number(f.total),
        });
    } else if (tipo === "NOTA_CREDITO_COMPRA") {
      const nc = await prisma.purchaseCreditNote.findUnique({ where: { id }, select: { invoice: true } });
      const f = nc?.invoice;
      if (f)
        relacionados.push({
          tipo: "COMPRA",
          id: f.id,
          tipoMov: f.condicion === "CREDITO" ? "FACT.CRED.REC." : "FACT.CONT.REC.",
          numero: f.nroComprobante,
          fecha: f.fecha,
          total: Number(f.total),
        });
    } else if (tipo === "COBRO") {
      const porFactura = new Map<number, number>();
      const apps = await prisma.installmentPayment.findMany({ where: { paymentId: id }, select: { monto: true, installment: { select: { invoiceId: true } } } });
      for (const a of apps) porFactura.set(a.installment.invoiceId, (porFactura.get(a.installment.invoiceId) ?? 0) + Number(a.monto));
      const facturas = await prisma.salesInvoice.findMany({ where: { id: { in: [...porFactura.keys()] } }, orderBy: { fecha: "asc" } });
      for (const f of facturas)
        relacionados.push({
          tipo: "VENTA",
          id: f.id,
          tipoMov: f.condicion === "CREDITO" ? "FACT.CRED.EMIT." : "FACT.CONT.EMIT.",
          numero: `${f.establecimiento}-${f.puntoExpedicion}-${f.numero}`,
          fecha: f.fecha,
          total: porFactura.get(f.id) ?? 0,
        });
    }

    res.json({
      transaccion: doc,
      timbrado,
      medioPago,
      documentoPadre,
      articulos,
      conceptos,
      cuentas,
      cheques,
      mediosVenta,
      cuotas,
      aplicaciones,
      relacionados,
    });
  })
);

// Nivel de una cuenta en el arbol del plan (raiz = 1).
function niveles(cuentas: Array<{ id: number; parentId: number | null }>) {
  const parentOf = new Map(cuentas.map((c) => [c.id, c.parentId]));
  const memo = new Map<number, number>();
  const nivel = (id: number, guard = 0): number => {
    const hit = memo.get(id);
    if (hit) return hit;
    const parent = parentOf.get(id);
    const n = parent && guard < 50 ? nivel(parent, guard + 1) + 1 : 1;
    memo.set(id, n);
    return n;
  };
  return nivel;
}

// Subdiario de control: lineas de asiento generadas por una transaccion.
transaccionesRouter.get(
  "/:tipo/:id/subdiario",
  asyncHandler(async (req, res) => {
    const tipo = TIPOS.find((t) => t === req.params.tipo);
    const id = Number(req.params.id);
    if (!tipo || !Number.isInteger(id)) throw new HttpError(404, "Transaccion no encontrada");
    const companyId = req.companyId!;

    const [doc] = await prisma.$queryRaw<TxRow[]>`
      SELECT * FROM (${txSql(companyId)}) tx WHERE tipo = ${tipo} AND id = ${id}
    `;
    if (!doc) throw new HttpError(404, "Transaccion no encontrada");

    // Origenes de asiento de esta transaccion: el documento, su reversa y, para
    // pagos, la reposicion de cheques anulados/rechazados.
    const origenes: Array<{ origenTipo: string; origenId: number }> = [{ origenTipo: tipo, origenId: id }];
    const reversa = ORIGENES_REVERSA[tipo];
    if (reversa) origenes.push({ origenTipo: reversa, origenId: id });
    if (tipo === "PAGO") {
      const cheques = await prisma.check.findMany({ where: { companyId, paymentMadeId: id }, select: { id: true } });
      for (const c of cheques) origenes.push({ origenTipo: "CHEQUE_REVERSA", origenId: c.id });
    }

    const [lines, pendientes, cuentas] = await Promise.all([
      prisma.accountingEntryLine.findMany({
        where: { entry: { companyId, OR: origenes } },
        include: {
          entry: { select: { id: true, numero: true, fecha: true, glosa: true, origenTipo: true } },
          account: { select: { id: true, codigo: true, nombre: true } },
        },
        orderBy: [{ entry: { fecha: "asc" } }, { entryId: "asc" }, { id: "asc" }],
      }),
      prisma.accountingEvent.findMany({
        where: { companyId, procesado: false, OR: origenes },
        select: { tipo: true, error: true },
      }),
      prisma.chartOfAccount.findMany({ where: { companyId }, select: { id: true, parentId: true } }),
    ]);
    const nivel = niveles(cuentas);

    const filas = lines.map((l) => ({
      id: l.id,
      asiento: l.entry.numero,
      fecha: l.entry.fecha,
      tipoMov: l.entry.origenTipo === tipo ? doc.tipoMov : `ANUL. ${doc.tipoMov}`,
      numero: doc.numero,
      // Detalle de la linea si lo hubiera; si no, la observacion del comprobante y,
      // en su defecto, la glosa del asiento (distingue el original de su anulacion).
      observacion: l.detalle || doc.observacion || l.entry.glosa,
      glosa: l.entry.glosa,
      cuenta: `${l.account.codigo} - ${l.account.nombre} - Nivel: ${nivel(l.account.id)} - ${l.account.id}`,
      debe: Number(l.debe),
      haber: Number(l.haber),
    }));

    res.json({
      transaccion: doc,
      filas,
      totales: {
        debe: filas.reduce((s, f) => s + f.debe, 0),
        haber: filas.reduce((s, f) => s + f.haber, 0),
      },
      pendientes,
    });
  })
);
