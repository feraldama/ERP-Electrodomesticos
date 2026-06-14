import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";
import { listOrPaginate } from "../lib/listQuery.js";

// Categorias
export const categoriesRouter = Router();
categoriesRouter.use(authRequired);
categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = q ? { nombre: { contains: q, mode: "insensitive" as const } } : {};
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: { nombre: "nombre" }, defaultSort: "nombre" },
        ({ orderBy, skip, take }) => prisma.category.findMany({ where, orderBy, skip, take }),
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
    const { nombre, parentId } = z
      .object({ nombre: z.string().min(1), parentId: z.number().int().optional().nullable() })
      .parse(req.body);
    res.status(201).json(await prisma.category.create({ data: { nombre, parentId: parentId ?? null } }));
  })
);
categoriesRouter.put(
  "/:id",
  requirePermission("STKM003"),
  asyncHandler(async (req, res) => {
    const { nombre } = z.object({ nombre: z.string().min(1) }).parse(req.body);
    res.json(await prisma.category.update({ where: { id: Number(req.params.id) }, data: { nombre } }));
  })
);

// Unidades de medida
export const unitsRouter = Router();
unitsRouter.use(authRequired);
unitsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = q
      ? {
          OR: [
            { codigo: { contains: q, mode: "insensitive" as const } },
            { nombre: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
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
