import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { processPendingEvents, getAccountBalances, cerrarEjercicio, CLAVES } from "../services/accounting.js";

// =====================================================================
// CONTABILIDAD: plan de cuentas, libro diario y procesamiento de eventos
// =====================================================================
export const contabilidadRouter = Router();
contabilidadRouter.use(authRequired, companyRequired);

// Plan de cuentas (CONM001) - vista
contabilidadRouter.get(
  "/plan-cuentas",
  asyncHandler(async (req, res) => {
    const cuentas = await prisma.chartOfAccount.findMany({
      where: { companyId: req.companyId },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, nombre: true, tipo: true, imputable: true, parentId: true, activo: true },
    });
    res.json(cuentas);
  })
);

// ABM de cuentas (CONM001)
const accountSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  tipo: z.enum(["ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "EGRESO", "ORDEN"]),
  imputable: z.boolean().optional(),
  parentId: z.number().int().nullable().optional(),
  activo: z.boolean().optional(),
});

async function validarParent(companyId: number, parentId: number | null | undefined, selfId?: number) {
  if (!parentId) return;
  if (selfId && parentId === selfId) throw new HttpError(400, "Una cuenta no puede ser su propio padre");
  const parent = await prisma.chartOfAccount.findFirst({ where: { id: parentId, companyId } });
  if (!parent) throw new HttpError(400, "Cuenta padre invalida");
}

contabilidadRouter.post(
  "/plan-cuentas",
  requirePermission("CONM001"),
  asyncHandler(async (req, res) => {
    const d = accountSchema.parse(req.body);
    await validarParent(req.companyId!, d.parentId ?? null);
    const cuenta = await prisma.chartOfAccount.create({
      data: {
        companyId: req.companyId!,
        codigo: d.codigo.trim(),
        nombre: d.nombre.trim(),
        tipo: d.tipo,
        imputable: d.imputable ?? true,
        parentId: d.parentId ?? null,
        activo: d.activo ?? true,
      },
    });
    res.status(201).json(cuenta);
  })
);

contabilidadRouter.put(
  "/plan-cuentas/:id",
  requirePermission("CONM001"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, "Cuenta no encontrada");
    const d = accountSchema.partial().parse(req.body);
    await validarParent(req.companyId!, d.parentId ?? null, id);
    const result = await prisma.chartOfAccount.updateMany({
      where: { id, companyId: req.companyId },
      data: {
        ...(d.codigo ? { codigo: d.codigo.trim() } : {}),
        ...(d.nombre ? { nombre: d.nombre.trim() } : {}),
        ...(d.tipo ? { tipo: d.tipo } : {}),
        ...(d.imputable !== undefined ? { imputable: d.imputable } : {}),
        ...(d.parentId !== undefined ? { parentId: d.parentId } : {}),
        ...(d.activo !== undefined ? { activo: d.activo } : {}),
      },
    });
    if (result.count === 0) throw new HttpError(404, "Cuenta no encontrada");
    res.json(await prisma.chartOfAccount.findUnique({ where: { id } }));
  })
);

contabilidadRouter.delete(
  "/plan-cuentas/:id",
  requirePermission("CONM001"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, "Cuenta no encontrada");
    const cuenta = await prisma.chartOfAccount.findFirst({ where: { id, companyId: req.companyId } });
    if (!cuenta) throw new HttpError(404, "Cuenta no encontrada");
    // No permitir borrar cuentas con movimientos o subcuentas
    const [conMovimientos, conHijos] = await Promise.all([
      prisma.accountingEntryLine.count({ where: { accountId: cuenta.id } }),
      prisma.chartOfAccount.count({ where: { parentId: cuenta.id } }),
    ]);
    if (conMovimientos > 0) throw new HttpError(409, "No se puede eliminar: la cuenta tiene movimientos");
    if (conHijos > 0) throw new HttpError(409, "No se puede eliminar: la cuenta tiene subcuentas");
    await prisma.chartOfAccount.delete({ where: { id: cuenta.id } });
    res.json({ ok: true });
  })
);

// =====================================================================
// CONFIGURACION DE CUENTAS OPERATIVAS (CONM010)
// Mapea cada clave del posting (CAJA, CLIENTES, IVA_DEBITO_10...) a una cuenta
// imputable del plan. Editable; el motor de asientos resuelve por aqui.
// =====================================================================
contabilidadRouter.get(
  "/config",
  asyncHandler(async (req, res) => {
    const filas = await prisma.accountingConfig.findMany({
      where: { companyId: req.companyId },
      include: { account: { select: { id: true, codigo: true, nombre: true } } },
    });
    const byClave = new Map(filas.map((f) => [f.clave, f]));
    // Devuelve todas las claves conocidas, asignadas o no
    res.json(
      CLAVES.map((clave) => {
        const f = byClave.get(clave);
        return {
          clave,
          accountId: f?.accountId ?? null,
          codigo: f?.account.codigo ?? null,
          nombre: f?.account.nombre ?? null,
        };
      })
    );
  })
);

const configSchema = z.object({
  clave: z.enum(CLAVES),
  accountId: z.number().int(),
});

contabilidadRouter.put(
  "/config",
  requirePermission("CONM010"),
  asyncHandler(async (req, res) => {
    const d = configSchema.parse(req.body);
    const account = await prisma.chartOfAccount.findFirst({
      where: { id: d.accountId, companyId: req.companyId },
      select: { id: true, imputable: true, activo: true },
    });
    if (!account) throw new HttpError(400, "Cuenta invalida");
    if (!account.imputable) throw new HttpError(400, "La cuenta debe ser imputable (admite movimientos)");
    if (!account.activo) throw new HttpError(400, "La cuenta esta inactiva");
    const row = await prisma.accountingConfig.upsert({
      where: { companyId_clave: { companyId: req.companyId!, clave: d.clave } },
      update: { accountId: d.accountId },
      create: { companyId: req.companyId!, clave: d.clave, accountId: d.accountId },
    });
    res.json(row);
  })
);

// =====================================================================
// EJERCICIOS / PERIODOS FISCALES (CONM011)
// Definen el rango de cada ejercicio y su estado (abierto/cerrado). El motor de
// asientos asigna cada asiento a su periodo por fecha y rechaza postear sobre uno
// cerrado (ver services/accounting.ts).
// =====================================================================

// Fecha YYYY-MM-DD -> Date al inicio (00:00) o fin (23:59:59.999) del dia local.
function ymdToDate(s: string, end: boolean): Date {
  const d = new Date(`${s}T${end ? "23:59:59.999" : "00:00:00"}`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Fecha invalida (use YYYY-MM-DD)");
  return d;
}

const periodSchema = z.object({
  nombre: z.string().min(1),
  fechaInicio: z.string().min(8),
  fechaFin: z.string().min(8),
});

// Valida que [inicio, fin] no se superponga con otro periodo de la empresa.
async function validarSolape(companyId: number, inicio: Date, fin: Date, selfId?: number) {
  if (inicio > fin) throw new HttpError(400, "La fecha de inicio no puede ser posterior a la de fin");
  const solapado = await prisma.fiscalPeriod.findFirst({
    where: {
      companyId,
      ...(selfId ? { id: { not: selfId } } : {}),
      fechaInicio: { lte: fin },
      fechaFin: { gte: inicio },
    },
    select: { nombre: true },
  });
  if (solapado) throw new HttpError(409, `El rango se superpone con el ejercicio "${solapado.nombre}"`);
}

contabilidadRouter.get(
  "/periodos",
  asyncHandler(async (req, res) => {
    const periodos = await prisma.fiscalPeriod.findMany({
      where: { companyId: req.companyId },
      orderBy: { fechaInicio: "desc" },
      include: { _count: { select: { entries: true } } },
    });
    res.json(
      periodos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        fechaInicio: p.fechaInicio,
        fechaFin: p.fechaFin,
        cerrado: p.cerrado,
        asientos: p._count.entries,
      }))
    );
  })
);

contabilidadRouter.post(
  "/periodos",
  requirePermission("CONM011"),
  asyncHandler(async (req, res) => {
    const d = periodSchema.parse(req.body);
    const inicio = ymdToDate(d.fechaInicio, false);
    const fin = ymdToDate(d.fechaFin, true);
    await validarSolape(req.companyId!, inicio, fin);
    const periodo = await prisma.fiscalPeriod.create({
      data: { companyId: req.companyId!, nombre: d.nombre.trim(), fechaInicio: inicio, fechaFin: fin },
    });
    // Backfill: asignar este periodo a los asientos existentes que caen en el rango y aun no tienen periodo.
    const { count } = await prisma.accountingEntry.updateMany({
      where: { companyId: req.companyId, periodId: null, fecha: { gte: inicio, lte: fin } },
      data: { periodId: periodo.id },
    });
    res.status(201).json({ ...periodo, asientosAsignados: count });
  })
);

const periodUpdateSchema = periodSchema.partial().extend({ cerrado: z.boolean().optional() });

contabilidadRouter.put(
  "/periodos/:id",
  requirePermission("CONM011"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, "Ejercicio no encontrado");
    const periodo = await prisma.fiscalPeriod.findFirst({
      where: { id, companyId: req.companyId },
      include: { _count: { select: { entries: true } } },
    });
    if (!periodo) throw new HttpError(404, "Ejercicio no encontrado");
    const d = periodUpdateSchema.parse(req.body);

    // Solo se pueden cambiar las fechas si el ejercicio aun no tiene asientos asignados.
    const cambiaFechas = d.fechaInicio !== undefined || d.fechaFin !== undefined;
    if (cambiaFechas && periodo._count.entries > 0)
      throw new HttpError(409, "No se pueden cambiar las fechas: el ejercicio ya tiene asientos asignados");

    const inicio = d.fechaInicio ? ymdToDate(d.fechaInicio, false) : periodo.fechaInicio;
    const fin = d.fechaFin ? ymdToDate(d.fechaFin, true) : periodo.fechaFin;
    if (cambiaFechas) await validarSolape(req.companyId!, inicio, fin, id);

    const updated = await prisma.fiscalPeriod.update({
      where: { id },
      data: {
        ...(d.nombre ? { nombre: d.nombre.trim() } : {}),
        ...(cambiaFechas ? { fechaInicio: inicio, fechaFin: fin } : {}),
        ...(d.cerrado !== undefined ? { cerrado: d.cerrado } : {}),
      },
    });
    res.json(updated);
  })
);

contabilidadRouter.delete(
  "/periodos/:id",
  requirePermission("CONM011"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, "Ejercicio no encontrado");
    const periodo = await prisma.fiscalPeriod.findFirst({
      where: { id, companyId: req.companyId },
      include: { _count: { select: { entries: true } } },
    });
    if (!periodo) throw new HttpError(404, "Ejercicio no encontrado");
    if (periodo._count.entries > 0)
      throw new HttpError(409, "No se puede eliminar: el ejercicio tiene asientos asignados");
    await prisma.fiscalPeriod.delete({ where: { id } });
    res.json({ ok: true });
  })
);

// Cierre de ejercicio: genera el asiento de cierre y marca el periodo cerrado.
contabilidadRouter.post(
  "/periodos/:id/cierre",
  requirePermission("CONM011"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, "Ejercicio no encontrado");
    const result = await cerrarEjercicio(req.companyId!, id);
    res.json(result);
  })
);

// Eventos contables pendientes (resumen por tipo)
contabilidadRouter.get(
  "/pendientes",
  asyncHandler(async (req, res) => {
    const grupos = await prisma.accountingEvent.groupBy({
      by: ["tipo"],
      where: { companyId: req.companyId, procesado: false },
      _count: true,
    });
    const conError = await prisma.accountingEvent.count({
      where: { companyId: req.companyId, procesado: false, error: { not: null } },
    });
    const total = grupos.reduce((s, g) => s + g._count, 0);
    res.json({ total, conError, porTipo: grupos.map((g) => ({ tipo: g.tipo, cantidad: g._count })) });
  })
);

// Procesar pendientes (CONP003)
contabilidadRouter.post(
  "/procesar",
  requirePermission("CONP003"),
  asyncHandler(async (req, res) => {
    const result = await processPendingEvents(req.companyId!);
    res.json(result);
  })
);

// Libro diario (CONC002): asientos con sus lineas
contabilidadRouter.get(
  "/asientos",
  asyncHandler(async (req, res) => {
    const asientos = await prisma.accountingEntry.findMany({
      where: { companyId: req.companyId },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      take: 200,
      include: {
        lines: { include: { account: { select: { codigo: true, nombre: true } } } },
      },
    });
    res.json(asientos);
  })
);

// Balance de sumas y saldos (CONC004): por cuenta, suma debe/haber y saldo
contabilidadRouter.get(
  "/balance",
  asyncHandler(async (req, res) => {
    const fecha = parseRange(req);
    const grupos = await prisma.accountingEntryLine.groupBy({
      by: ["accountId"],
      where: { entry: { companyId: req.companyId, ...(fecha ? { fecha } : {}) } },
      _sum: { debe: true, haber: true },
    });
    const ids = grupos.map((g) => g.accountId);
    const cuentas = await prisma.chartOfAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, codigo: true, nombre: true, tipo: true },
    });
    const byId = new Map(cuentas.map((c) => [c.id, c]));

    const filas = grupos
      .map((g) => {
        const c = byId.get(g.accountId);
        const debe = Number(g._sum.debe ?? 0);
        const haber = Number(g._sum.haber ?? 0);
        const saldo = debe - haber;
        return {
          accountId: g.accountId,
          codigo: c?.codigo ?? "",
          nombre: c?.nombre ?? "",
          tipo: c?.tipo ?? null,
          debe,
          haber,
          saldoDeudor: saldo > 0 ? saldo : 0,
          saldoAcreedor: saldo < 0 ? -saldo : 0,
        };
      })
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    res.json({
      filas,
      totales: {
        debe: filas.reduce((s, f) => s + f.debe, 0),
        haber: filas.reduce((s, f) => s + f.haber, 0),
        deudor: filas.reduce((s, f) => s + f.saldoDeudor, 0),
        acreedor: filas.reduce((s, f) => s + f.saldoAcreedor, 0),
      },
    });
  })
);

// Estado de resultados (CONC006): ingresos - egresos = resultado del ejercicio
contabilidadRouter.get(
  "/estado-resultados",
  asyncHandler(async (req, res) => {
    const bals = await getAccountBalances(req.companyId!, parseRange(req), { excludeCierre: true });
    const ingresos = bals.filter((b) => b.tipo === "INGRESO").map((b) => ({ codigo: b.codigo, nombre: b.nombre, monto: b.haber - b.debe }));
    const egresos = bals.filter((b) => b.tipo === "EGRESO").map((b) => ({ codigo: b.codigo, nombre: b.nombre, monto: b.debe - b.haber }));
    const totalIngresos = ingresos.reduce((s, x) => s + x.monto, 0);
    const totalEgresos = egresos.reduce((s, x) => s + x.monto, 0);
    res.json({ ingresos, egresos, totalIngresos, totalEgresos, resultado: totalIngresos - totalEgresos });
  })
);

// Balance general (CONC007): activo = pasivo + patrimonio + resultado
contabilidadRouter.get(
  "/balance-general",
  asyncHandler(async (req, res) => {
    const bals = await getAccountBalances(req.companyId!, parseRange(req), { excludeCierre: true });
    const activo = bals.filter((b) => b.tipo === "ACTIVO").map((b) => ({ codigo: b.codigo, nombre: b.nombre, monto: b.debe - b.haber }));
    const pasivo = bals.filter((b) => b.tipo === "PASIVO").map((b) => ({ codigo: b.codigo, nombre: b.nombre, monto: b.haber - b.debe }));
    const patrimonio = bals.filter((b) => b.tipo === "PATRIMONIO").map((b) => ({ codigo: b.codigo, nombre: b.nombre, monto: b.haber - b.debe }));
    const totalIngresos = bals.filter((b) => b.tipo === "INGRESO").reduce((s, b) => s + (b.haber - b.debe), 0);
    const totalEgresos = bals.filter((b) => b.tipo === "EGRESO").reduce((s, b) => s + (b.debe - b.haber), 0);
    const resultado = totalIngresos - totalEgresos;
    const totalActivo = activo.reduce((s, x) => s + x.monto, 0);
    const totalPasivo = pasivo.reduce((s, x) => s + x.monto, 0);
    const totalPatrimonio = patrimonio.reduce((s, x) => s + x.monto, 0);
    res.json({
      activo,
      pasivo,
      patrimonio,
      resultado,
      totalActivo,
      totalPasivo,
      totalPatrimonio,
      totalPasivoPatrimonio: totalPasivo + totalPatrimonio + resultado,
    });
  })
);

// Libro mayor (CONC005): movimientos de una cuenta con saldo corriente
contabilidadRouter.get(
  "/mayor",
  asyncHandler(async (req, res) => {
    const accountId = Number(req.query.accountId);
    if (!accountId) throw new HttpError(400, "Falta accountId");
    const cuenta = await prisma.chartOfAccount.findFirst({
      where: { id: accountId, companyId: req.companyId },
      select: { id: true, codigo: true, nombre: true, tipo: true },
    });
    if (!cuenta) throw new HttpError(404, "Cuenta no encontrada");

    const fecha = parseRange(req);
    const lines = await prisma.accountingEntryLine.findMany({
      where: { accountId, entry: { companyId: req.companyId, ...(fecha ? { fecha } : {}) } },
      include: { entry: { select: { fecha: true, numero: true, glosa: true } } },
      orderBy: [{ entry: { fecha: "asc" } }, { id: "asc" }],
    });

    let saldo = 0;
    const movimientos = lines.map((l) => {
      saldo += Number(l.debe) - Number(l.haber);
      return { id: l.id, fecha: l.entry.fecha, numero: l.entry.numero, glosa: l.entry.glosa, debe: l.debe, haber: l.haber, saldo };
    });
    res.json({ cuenta, movimientos });
  })
);

// =====================================================================
// LIBRO IVA COMPRAS (CONC008) y LIBRO IVA VENTAS (CONC009)
// Reportes fiscales sobre facturas + notas de credito ya registradas. Las NC
// figuran como restas (montos negativos) para que los totales cuadren con el IVA
// del periodo. No genera asientos; solo lee.
// =====================================================================

// Rango de fechas opcional desde/hasta (YYYY-MM-DD), hasta inclusive.
function parseRange(req: { query: Record<string, unknown> }) {
  const toDate = (v: unknown, end: boolean) => {
    if (!v) return undefined;
    const s = String(v);
    const d = new Date(`${s}T${end ? "23:59:59.999" : "00:00:00"}`);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, "Fecha invalida (use YYYY-MM-DD)");
    return d;
  };
  const desde = toDate(req.query.desde, false);
  const hasta = toDate(req.query.hasta, true);
  const fecha: { gte?: Date; lte?: Date } = {};
  if (desde) fecha.gte = desde;
  if (hasta) fecha.lte = hasta;
  return Object.keys(fecha).length ? fecha : undefined;
}

const n = (v: unknown) => Number(v ?? 0);
const neg = (v: unknown) => -Number(v ?? 0);

type LibroAmounts = { gravada10: number; gravada5: number; exenta: number; iva10: number; iva5: number; total: number };

function totalsOf(filas: LibroAmounts[]): LibroAmounts {
  const keys: Array<keyof LibroAmounts> = ["gravada10", "gravada5", "exenta", "iva10", "iva5", "total"];
  const t = { gravada10: 0, gravada5: 0, exenta: 0, iva10: 0, iva5: 0, total: 0 };
  for (const k of keys) t[k] = filas.reduce((s, f) => s + (f[k] ?? 0), 0);
  return t;
}

contabilidadRouter.get(
  "/libro-compras",
  asyncHandler(async (req, res) => {
    const fecha = parseRange(req);
    const personSel = { select: { ruc: true, nroDoc: true, razonSocial: true } };

    const facturas = await prisma.purchaseInvoice.findMany({
      where: { companyId: req.companyId, estado: { not: "ANULADO" }, ...(fecha ? { fecha } : {}) },
      include: { supplier: { include: { person: personSel } } },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });
    const notas = await prisma.purchaseCreditNote.findMany({
      where: { companyId: req.companyId, ...(fecha ? { fecha } : {}) },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });
    // proveedor de las NC (no tiene relacion directa al supplier en el include)
    const supIds = [...new Set(notas.map((x) => x.supplierId))];
    const sups = supIds.length
      ? await prisma.supplier.findMany({ where: { id: { in: supIds } }, include: { person: personSel } })
      : [];
    const supById = new Map(sups.map((s) => [s.id, s.person]));

    const filas = [
      ...facturas.map((f) => ({
        fecha: f.fecha,
        tipoDoc: "FACTURA",
        comprobante: f.nroComprobante,
        timbrado: f.timbrado ?? "",
        condicion: f.condicion,
        ruc: f.supplier.person.ruc ?? f.supplier.person.nroDoc,
        razonSocial: f.supplier.person.razonSocial,
        gravada10: n(f.subtotal10),
        gravada5: n(f.subtotal5),
        exenta: n(f.subtotalExenta),
        iva10: n(f.iva10),
        iva5: n(f.iva5),
        total: n(f.total),
      })),
      ...notas.map((c) => {
        const p = supById.get(c.supplierId);
        return {
          fecha: c.fecha,
          tipoDoc: "NOTA_CREDITO",
          comprobante: c.nroComprobante,
          timbrado: "",
          condicion: null,
          ruc: p?.ruc ?? p?.nroDoc ?? "",
          razonSocial: p?.razonSocial ?? "",
          gravada10: neg(c.subtotal10),
          gravada5: neg(c.subtotal5),
          exenta: neg(c.subtotalExenta),
          iva10: neg(c.iva10),
          iva5: neg(c.iva5),
          total: neg(c.total),
        };
      }),
    ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    res.json({ filas, totales: totalsOf(filas) });
  })
);

contabilidadRouter.get(
  "/libro-ventas",
  asyncHandler(async (req, res) => {
    const fecha = parseRange(req);
    const personSel = { select: { ruc: true, nroDoc: true, razonSocial: true } };
    const nroDe = (i: { establecimiento: string; puntoExpedicion: string; numero: string }) =>
      `${i.establecimiento}-${i.puntoExpedicion}-${i.numero}`;

    const facturas = await prisma.salesInvoice.findMany({
      where: { companyId: req.companyId, estado: { not: "ANULADO" }, ...(fecha ? { fecha } : {}) },
      include: { customer: { include: { person: personSel } } },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });
    const notas = await prisma.salesCreditNote.findMany({
      where: { companyId: req.companyId, ...(fecha ? { fecha } : {}) },
      include: { invoice: { include: { customer: { include: { person: personSel } } } } },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    });

    const filas = [
      ...facturas.map((f) => ({
        fecha: f.fecha,
        tipoDoc: "FACTURA",
        comprobante: nroDe(f),
        timbrado: f.timbrado ?? "",
        condicion: f.condicion,
        ruc: f.customer.person.ruc ?? f.customer.person.nroDoc,
        razonSocial: f.customer.person.razonSocial,
        gravada10: n(f.subtotal10),
        gravada5: n(f.subtotal5),
        exenta: n(f.subtotalExenta),
        iva10: n(f.iva10),
        iva5: n(f.iva5),
        total: n(f.total),
      })),
      ...notas.map((c) => {
        const p = c.invoice?.customer.person;
        return {
          fecha: c.fecha,
          tipoDoc: "NOTA_CREDITO",
          comprobante: c.numero,
          timbrado: "",
          condicion: null,
          ruc: p?.ruc ?? p?.nroDoc ?? "",
          razonSocial: p?.razonSocial ?? "",
          gravada10: neg(c.subtotal10),
          gravada5: neg(c.subtotal5),
          exenta: neg(c.subtotalExenta),
          iva10: neg(c.iva10),
          iva5: neg(c.iva5),
          total: neg(c.total),
        };
      }),
    ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    res.json({ filas, totales: totalsOf(filas) });
  })
);
