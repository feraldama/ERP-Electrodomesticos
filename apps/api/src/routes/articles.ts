import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { UPLOADS_DIR } from "../uploads.js";
import { parseListParams, paginated, wantsPagination, listOrPaginate } from "../lib/listQuery.js";

// Catalogos simples {id, nombre, activo}: buscables por nombre y ordenables por nombre/estado.
const simpleCatalogSortable = { nombre: "nombre", estado: "activo" } as const;

export const articlesRouter = Router();
articlesRouter.use(authRequired);

const articleSchema = z.object({
  codigo: z.string().min(1),
  descripcion: z.string().min(1),
  brandId: z.number().int().optional().nullable(),
  categoryId: z.number().int().optional().nullable(),
  unitId: z.number().int().optional().nullable(),
  rubroId: z.number().int().optional().nullable(),
  tipo: z.enum(["PRODUCTO", "SERVICIO"]).default("PRODUCTO"),
  ivaTipo: z.enum(["IVA10", "IVA5", "EXENTA"]).default("IVA10"),
  controlaSerie: z.boolean().default(false),
  costoActual: z.number().nonnegative().default(0),
  precioVenta: z.number().nonnegative().default(0),
  stockMinimo: z.number().nonnegative().default(0),
  imagenUrl: z.string().optional().nullable(),
  activo: z.boolean().optional(),
});

// --- Carga de imagenes de articulos ---
const articleImagesDir = path.join(UPLOADS_DIR, "articles");
fs.mkdirSync(articleImagesDir, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, articleImagesDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      const name = `art-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, "Formato de imagen no permitido (usa JPG, PNG, WEBP o GIF)"));
  },
});

articlesRouter.post(
  "/upload-imagen",
  upload.single("imagen"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No se recibio ninguna imagen");
    res.status(201).json({ url: `/uploads/articles/${req.file.filename}` });
  })
);

// Columnas ordenables: clave publica -> ruta Prisma
const articlesSortable = {
  codigo: "codigo",
  descripcion: "descripcion",
  marca: "brand.nombre",
  categoria: "category.nombre",
  rubro: "rubro.nombre",
  estado: "activo",
} as const;

// Listar (con busqueda simple). Paginacion opt-in (ver lib/listQuery).
articlesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const soloActivos = req.query.activo === "true";
    const where = {
      ...(soloActivos ? { activo: true } : {}),
      ...(q
        ? {
            OR: [
              { codigo: { contains: q, mode: "insensitive" as const } },
              { descripcion: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const include = { brand: true, category: true, unit: true, rubro: true };
    const { skip, take, orderBy, page, pageSize } = parseListParams(req.query, {
      sortable: articlesSortable,
      defaultSort: "descripcion",
    });

    if (!wantsPagination(req.query)) {
      const articles = await prisma.article.findMany({ where, include, orderBy, take: 200 });
      return res.json(articles);
    }

    const [items, total] = await prisma.$transaction([
      prisma.article.findMany({ where, include, orderBy, skip, take }),
      prisma.article.count({ where }),
    ]);
    res.json(paginated(items, total, page, pageSize));
  })
);

articlesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const article = await prisma.article.findUnique({
      where: { id: Number(req.params.id) },
      include: { brand: true, category: true, unit: true, rubro: true, barcodes: true },
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
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = q ? { nombre: { contains: q, mode: "insensitive" as const } } : {};
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: simpleCatalogSortable, defaultSort: "nombre" },
        ({ orderBy, skip, take }) => prisma.brand.findMany({ where, orderBy, skip, take }),
        () => prisma.brand.count({ where }),
        300
      )
    );
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

// Rubros de facturacion (agrupan articulos por timbrado)
export const rubrosRouter = Router();
rubrosRouter.use(authRequired);
rubrosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = q ? { nombre: { contains: q, mode: "insensitive" as const } } : {};
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: simpleCatalogSortable, defaultSort: "nombre" },
        ({ orderBy, skip, take }) => prisma.rubro.findMany({ where, orderBy, skip, take }),
        () => prisma.rubro.count({ where }),
        300
      )
    );
  })
);
rubrosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { nombre } = z.object({ nombre: z.string().min(1) }).parse(req.body);
    res.status(201).json(await prisma.rubro.create({ data: { nombre } }));
  })
);
rubrosRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { nombre, activo } = z
      .object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() })
      .parse(req.body);
    res.json(
      await prisma.rubro.update({ where: { id: Number(req.params.id) }, data: { nombre, activo } })
    );
  })
);
