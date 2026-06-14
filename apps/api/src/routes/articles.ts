import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";
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
  requirePermission("STKM001"),
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
  requirePermission("STKM001"),
  asyncHandler(async (req, res) => {
    const data = articleSchema.parse(req.body);
    const article = await prisma.article.create({ data });
    res.status(201).json(article);
  })
);

articlesRouter.put(
  "/:id",
  requirePermission("STKM001"),
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
  requirePermission("STKM002"),
  asyncHandler(async (req, res) => {
    const { nombre } = z.object({ nombre: z.string().min(1) }).parse(req.body);
    res.status(201).json(await prisma.brand.create({ data: { nombre } }));
  })
);
brandsRouter.put(
  "/:id",
  requirePermission("STKM002"),
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
  requirePermission("STKM012"),
  asyncHandler(async (req, res) => {
    const { nombre } = z.object({ nombre: z.string().min(1) }).parse(req.body);
    res.status(201).json(await prisma.rubro.create({ data: { nombre } }));
  })
);
rubrosRouter.put(
  "/:id",
  requirePermission("STKM012"),
  asyncHandler(async (req, res) => {
    const { nombre, activo } = z
      .object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() })
      .parse(req.body);
    res.json(
      await prisma.rubro.update({ where: { id: Number(req.params.id) }, data: { nombre, activo } })
    );
  })
);

// =====================================================================
// CODIGOS DE BARRA POR ARTICULO (STKI007)
// =====================================================================
export const barcodesRouter = Router();
barcodesRouter.use(authRequired);

// Listar los codigos de barra de un articulo (principal primero).
barcodesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const articleId = Number(req.query.articleId);
    if (!articleId) throw new HttpError(400, "Falta articleId");
    const barcodes = await prisma.articleBarcode.findMany({
      where: { articleId },
      orderBy: [{ esPrincipal: "desc" }, { id: "asc" }],
    });
    res.json(barcodes);
  })
);

// Agregar un codigo de barra al articulo. Si esPrincipal, desmarca los demas.
barcodesRouter.post(
  "/",
  requirePermission("STKI007"),
  asyncHandler(async (req, res) => {
    const { articleId, codigo, esPrincipal } = z
      .object({ articleId: z.number().int(), codigo: z.string().min(1), esPrincipal: z.boolean().optional() })
      .parse(req.body);
    const code = codigo.trim();

    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new HttpError(400, "Articulo invalido");

    // Si el articulo no tiene ninguno, el primero queda principal por defecto.
    const count = await prisma.articleBarcode.count({ where: { articleId } });
    const principal = esPrincipal ?? count === 0;

    try {
      const created = await prisma.$transaction(async (tx) => {
        if (principal) await tx.articleBarcode.updateMany({ where: { articleId }, data: { esPrincipal: false } });
        return tx.articleBarcode.create({ data: { articleId, codigo: code, esPrincipal: principal } });
      });
      res.status(201).json(created);
    } catch (err) {
      if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
        throw new HttpError(409, `El codigo de barra ${code} ya esta asignado a otro articulo`);
      }
      throw err;
    }
  })
);

// Marcar un codigo como principal (desmarca los demas del mismo articulo).
barcodesRouter.put(
  "/:id/principal",
  requirePermission("STKI007"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const barcode = await prisma.articleBarcode.findUnique({ where: { id } });
    if (!barcode) throw new HttpError(404, "Codigo de barra no encontrado");
    await prisma.$transaction([
      prisma.articleBarcode.updateMany({ where: { articleId: barcode.articleId }, data: { esPrincipal: false } }),
      prisma.articleBarcode.update({ where: { id }, data: { esPrincipal: true } }),
    ]);
    res.json({ ok: true });
  })
);

// Eliminar un codigo de barra.
barcodesRouter.delete(
  "/:id",
  requirePermission("STKI007"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const result = await prisma.articleBarcode.deleteMany({ where: { id } });
    if (result.count === 0) throw new HttpError(404, "Codigo de barra no encontrado");
    res.json({ ok: true });
  })
);

// =====================================================================
// SERIES / IMEI POR ARTICULO (gestion + carga inicial / backfill)
// =====================================================================
export const serialsRouter = Router();
serialsRouter.use(authRequired);

serialsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const articleId = Number(req.query.articleId);
    if (!articleId) throw new HttpError(400, "Falta articleId");
    const estado = req.query.estado as string | undefined; // ej EN_STOCK (para el selector de venta)
    const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
    const saleInvoiceId = req.query.saleInvoiceId ? Number(req.query.saleInvoiceId) : undefined; // para devolucion (NC)
    const series = await prisma.articleSerial.findMany({
      where: {
        articleId,
        ...(estado ? { estado: estado as "EN_STOCK" | "VENDIDO" | "DEVUELTO" | "BAJA" } : {}),
        ...(warehouseId ? { warehouseId } : {}),
        ...(saleInvoiceId ? { saleInvoiceId } : {}),
      },
      include: { warehouse: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: [{ estado: "asc" }, { serie: "asc" }],
    });
    res.json(series);
  })
);

// Carga manual de series (stock existente / correcciones): quedan EN_STOCK.
serialsRouter.post(
  "/",
  requirePermission("STKM001"),
  asyncHandler(async (req, res) => {
    const { articleId, warehouseId, series } = z
      .object({ articleId: z.number().int(), warehouseId: z.number().int(), series: z.array(z.string()).min(1) })
      .parse(req.body);

    const article = await prisma.article.findUnique({ where: { id: articleId } });
    if (!article) throw new HttpError(400, "Articulo invalido");
    if (!article.controlaSerie) throw new HttpError(400, "El articulo no controla serie/IMEI");

    const limpias = [...new Set(series.map((s) => s.trim()).filter(Boolean))];
    if (limpias.length === 0) throw new HttpError(400, "No hay series para cargar");

    let creadas = 0;
    for (const serie of limpias) {
      try {
        await prisma.articleSerial.create({
          data: { articleId, serie, warehouseId, estado: "EN_STOCK" },
        });
        creadas++;
      } catch (err) {
        if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
          throw new HttpError(409, `La serie/IMEI "${serie}" ya esta cargada para este articulo`);
        }
        throw err;
      }
    }
    res.status(201).json({ ok: true, creadas });
  })
);

// Cambiar estado (reactivar DEVUELTO->EN_STOCK, dar de BAJA). No toca VENDIDO.
serialsRouter.put(
  "/:id/estado",
  requirePermission("STKM001"),
  asyncHandler(async (req, res) => {
    const { estado } = z.object({ estado: z.enum(["EN_STOCK", "BAJA"]) }).parse(req.body);
    const id = Number(req.params.id);
    const serial = await prisma.articleSerial.findUnique({ where: { id } });
    if (!serial) throw new HttpError(404, "Serie no encontrada");
    if (serial.estado === "VENDIDO") throw new HttpError(400, "No se puede cambiar una serie vendida");
    if (estado === "EN_STOCK" && serial.estado !== "DEVUELTO") {
      throw new HttpError(400, "Solo se puede reactivar una serie devuelta");
    }
    await prisma.articleSerial.update({ where: { id }, data: { estado } });
    res.json({ ok: true });
  })
);

// Eliminar una serie (solo si esta EN_STOCK, ej. carga erronea).
serialsRouter.delete(
  "/:id",
  requirePermission("STKM001"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const serial = await prisma.articleSerial.findUnique({ where: { id } });
    if (!serial) throw new HttpError(404, "Serie no encontrada");
    if (serial.estado !== "EN_STOCK") throw new HttpError(400, "Solo se puede eliminar una serie EN_STOCK");
    await prisma.articleSerial.delete({ where: { id } });
    res.json({ ok: true });
  })
);
