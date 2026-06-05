import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authRequired } from "../middleware/auth.js";

// Categorias
export const categoriesRouter = Router();
categoriesRouter.use(authRequired);
categoriesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.category.findMany({ orderBy: { nombre: "asc" } }));
  })
);
categoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { nombre, parentId } = z
      .object({ nombre: z.string().min(1), parentId: z.number().int().optional().nullable() })
      .parse(req.body);
    res.status(201).json(await prisma.category.create({ data: { nombre, parentId: parentId ?? null } }));
  })
);
categoriesRouter.put(
  "/:id",
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
  asyncHandler(async (_req, res) => {
    res.json(await prisma.unitOfMeasure.findMany({ orderBy: { codigo: "asc" } }));
  })
);
unitsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { codigo, nombre } = z
      .object({ codigo: z.string().min(1), nombre: z.string().min(1) })
      .parse(req.body);
    res.status(201).json(await prisma.unitOfMeasure.create({ data: { codigo, nombre } }));
  })
);
unitsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { codigo, nombre } = z
      .object({ codigo: z.string().min(1).optional(), nombre: z.string().min(1).optional() })
      .parse(req.body);
    res.json(await prisma.unitOfMeasure.update({ where: { id: Number(req.params.id) }, data: { codigo, nombre } }));
  })
);
