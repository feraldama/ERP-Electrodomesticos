import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";

export const articlesRouter = Router();
articlesRouter.use(authRequired);

const articleSchema = z.object({
  codigo: z.string().min(1),
  descripcion: z.string().min(1),
  brandId: z.number().int().optional().nullable(),
  categoryId: z.number().int().optional().nullable(),
  unitId: z.number().int().optional().nullable(),
  tipo: z.enum(["PRODUCTO", "SERVICIO"]).default("PRODUCTO"),
  ivaTipo: z.enum(["IVA10", "IVA5", "EXENTA"]).default("IVA10"),
  controlaSerie: z.boolean().default(false),
  costoActual: z.number().nonnegative().default(0),
  precioVenta: z.number().nonnegative().default(0),
  stockMinimo: z.number().nonnegative().default(0),
  activo: z.boolean().optional(),
});

// Listar (con busqueda simple)
articlesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const soloActivos = req.query.activo === "true";
    const articles = await prisma.article.findMany({
      where: {
        ...(soloActivos ? { activo: true } : {}),
        ...(q
          ? {
              OR: [
                { codigo: { contains: q, mode: "insensitive" } },
                { descripcion: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { brand: true, category: true, unit: true },
      orderBy: { descripcion: "asc" },
      take: 200,
    });
    res.json(articles);
  })
);

articlesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const article = await prisma.article.findUnique({
      where: { id: Number(req.params.id) },
      include: { brand: true, category: true, unit: true, barcodes: true },
    });
    if (!article) throw new HttpError(404, "Articulo no encontrado");
    res.json(article);
  })
);

articlesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = articleSchema.parse(req.body);
    const article = await prisma.article.create({ data });
    res.status(201).json(article);
  })
);

articlesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = articleSchema.partial().parse(req.body);
    const article = await prisma.article.update({
      where: { id: Number(req.params.id) },
      data,
    });
    res.json(article);
  })
);

export const brandsRouter = Router();
brandsRouter.use(authRequired);
brandsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.brand.findMany({ orderBy: { nombre: "asc" } }));
  })
);
brandsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { nombre } = z.object({ nombre: z.string().min(1) }).parse(req.body);
    res.status(201).json(await prisma.brand.create({ data: { nombre } }));
  })
);
brandsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { nombre, activo } = z
      .object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() })
      .parse(req.body);
    res.json(
      await prisma.brand.update({ where: { id: Number(req.params.id) }, data: { nombre, activo } })
    );
  })
);
