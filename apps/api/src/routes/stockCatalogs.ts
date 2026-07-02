import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { listOrPaginate, buildWordSearch } from "../lib/listQuery.js";

// Categorias. Aunque el catalogo es global, la configuracion contable
// (que cuenta mueve cada categoria en compra/venta/devolucion) es por empresa,
// por eso el router exige empresa activa (X-Company-Id).
export const categoriesRouter = Router();
categoriesRouter.use(authRequired, companyRequired);

// Aplana la config contable de la empresa activa sobre la categoria.
type CategoryWithConfig = {
  id: number;
  nombre: string;
  parentId: number | null;
  accountConfigs: { cuentaCompraId: number | null; cuentaVentaId: number | null; cuentaDevolucionId: number | null }[];
};
function flattenCategory(c: CategoryWithConfig) {
  const cfg = c.accountConfigs[0];
  return {
    id: c.id,
    nombre: c.nombre,
    parentId: c.parentId,
    cuentaCompraId: cfg?.cuentaCompraId ?? null,
    cuentaVentaId: cfg?.cuentaVentaId ?? null,
    cuentaDevolucionId: cfg?.cuentaDevolucionId ?? null,
  };
}

// Valida que la cuenta pertenezca a la empresa, sea imputable y este activa.
async function validarCuenta(companyId: number, accountId: number | null | undefined, etiqueta: string) {
  if (accountId == null) return;
  const acc = await prisma.chartOfAccount.findFirst({
    where: { id: accountId, companyId },
    select: { imputable: true, activo: true },
  });
  if (!acc) throw new HttpError(400, `Cuenta de ${etiqueta} invalida`);
  if (!acc.imputable) throw new HttpError(400, `La cuenta de ${etiqueta} debe ser imputable (admite movimientos)`);
  if (!acc.activo) throw new HttpError(400, `La cuenta de ${etiqueta} esta inactiva`);
}

const categorySchema = z.object({
  nombre: z.string().min(1),
  parentId: z.number().int().optional().nullable(),
  cuentaCompraId: z.number().int().optional().nullable(),
  cuentaVentaId: z.number().int().optional().nullable(),
  cuentaDevolucionId: z.number().int().optional().nullable(),
});

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = buildWordSearch(q, ["nombre"]);
    const configSel = {
      accountConfigs: {
        where: { companyId: req.companyId },
        select: { cuentaCompraId: true, cuentaVentaId: true, cuentaDevolucionId: true },
      },
    };
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: { nombre: "nombre" }, defaultSort: "nombre" },
        async ({ orderBy, skip, take }) =>
          (await prisma.category.findMany({ where, orderBy, skip, take, include: configSel })).map(flattenCategory),
        () => prisma.category.count({ where }),
        300
      )
    );
  })
);

categoriesRouter.post(
  "/",
  requirePermission("STKM003"),
  asyncHandler(async (req, res) => {
    const d = categorySchema.parse(req.body);
    const companyId = req.companyId!;
    await Promise.all([
      validarCuenta(companyId, d.cuentaCompraId, "compra"),
      validarCuenta(companyId, d.cuentaVentaId, "venta"),
      validarCuenta(companyId, d.cuentaDevolucionId, "devolucion"),
    ]);
    const tieneConfig = d.cuentaCompraId != null || d.cuentaVentaId != null || d.cuentaDevolucionId != null;
    const category = await prisma.category.create({
      data: {
        nombre: d.nombre,
        parentId: d.parentId ?? null,
        ...(tieneConfig
          ? {
              accountConfigs: {
                create: {
                  companyId,
                  cuentaCompraId: d.cuentaCompraId ?? null,
                  cuentaVentaId: d.cuentaVentaId ?? null,
                  cuentaDevolucionId: d.cuentaDevolucionId ?? null,
                },
              },
            }
          : {}),
      },
      include: {
        accountConfigs: {
          where: { companyId },
          select: { cuentaCompraId: true, cuentaVentaId: true, cuentaDevolucionId: true },
        },
      },
    });
    res.status(201).json(flattenCategory(category));
  })
);

categoriesRouter.put(
  "/:id",
  requirePermission("STKM003"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(404, "Categoria no encontrada");
    const d = categorySchema.parse(req.body);
    const companyId = req.companyId!;
    await Promise.all([
      validarCuenta(companyId, d.cuentaCompraId, "compra"),
      validarCuenta(companyId, d.cuentaVentaId, "venta"),
      validarCuenta(companyId, d.cuentaDevolucionId, "devolucion"),
    ]);
    await prisma.category.update({ where: { id }, data: { nombre: d.nombre } });
    await prisma.categoryAccountConfig.upsert({
      where: { companyId_categoryId: { companyId, categoryId: id } },
      update: {
        cuentaCompraId: d.cuentaCompraId ?? null,
        cuentaVentaId: d.cuentaVentaId ?? null,
        cuentaDevolucionId: d.cuentaDevolucionId ?? null,
      },
      create: {
        companyId,
        categoryId: id,
        cuentaCompraId: d.cuentaCompraId ?? null,
        cuentaVentaId: d.cuentaVentaId ?? null,
        cuentaDevolucionId: d.cuentaDevolucionId ?? null,
      },
    });
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        accountConfigs: {
          where: { companyId },
          select: { cuentaCompraId: true, cuentaVentaId: true, cuentaDevolucionId: true },
        },
      },
    });
    res.json(category ? flattenCategory(category) : null);
  })
);

// Unidades de medida
export const unitsRouter = Router();
unitsRouter.use(authRequired);
unitsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = buildWordSearch(q, ["codigo", "nombre"]);
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: { codigo: "codigo", nombre: "nombre" }, defaultSort: "codigo" },
        ({ orderBy, skip, take }) => prisma.unitOfMeasure.findMany({ where, orderBy, skip, take }),
        () => prisma.unitOfMeasure.count({ where }),
        300
      )
    );
  })
);
unitsRouter.post(
  "/",
  requirePermission("STKM001"),
  asyncHandler(async (req, res) => {
    const { codigo, nombre } = z
      .object({ codigo: z.string().min(1), nombre: z.string().min(1) })
      .parse(req.body);
    res.status(201).json(await prisma.unitOfMeasure.create({ data: { codigo, nombre } }));
  })
);
unitsRouter.put(
  "/:id",
  requirePermission("STKM001"),
  asyncHandler(async (req, res) => {
    const { codigo, nombre } = z
      .object({ codigo: z.string().min(1).optional(), nombre: z.string().min(1).optional() })
      .parse(req.body);
    res.json(await prisma.unitOfMeasure.update({ where: { id: Number(req.params.id) }, data: { codigo, nombre } }));
  })
);
