import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { processPendingEvents, getAccountBalances } from "../services/accounting.js";

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
    const grupos = await prisma.accountingEntryLine.groupBy({
      by: ["accountId"],
      where: { entry: { companyId: req.companyId } },
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
    const bals = await getAccountBalances(req.companyId!);
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
    const bals = await getAccountBalances(req.companyId!);
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

    const lines = await prisma.accountingEntryLine.findMany({
      where: { accountId, entry: { companyId: req.companyId } },
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
