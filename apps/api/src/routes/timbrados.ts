import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { listOrPaginate } from "../lib/listQuery.js";

// =====================================================================
// TIMBRADOS (compartidos por empresa)
// =====================================================================
export const timbradosRouter = Router();
timbradosRouter.use(authRequired, companyRequired);

const timbradoSchema = z.object({
  numero: z.string().min(1),
  establecimiento: z.string().min(1).default("001"),
  fechaInicio: z.coerce.date(),
  fechaFin: z.coerce.date().optional().nullable(),
  activo: z.boolean().optional(),
});

timbradosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = {
      companyId: req.companyId,
      ...(q ? { numero: { contains: q, mode: "insensitive" as const } } : {}),
    };
    const include = { _count: { select: { puntos: true } } };
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: { numero: "numero", establecimiento: "establecimiento", estado: "activo" }, defaultSort: "numero" },
        ({ orderBy, skip, take }) => prisma.timbrado.findMany({ where, include, orderBy, skip, take }),
        () => prisma.timbrado.count({ where }),
        300
      )
    );
  })
);

timbradosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = timbradoSchema.parse(req.body);
    const timbrado = await prisma.timbrado.create({
      data: { ...data, companyId: req.companyId! },
    });
    res.status(201).json(timbrado);
  })
);

timbradosRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = timbradoSchema.partial().parse(req.body);
    const result = await prisma.timbrado.updateMany({
      where: { id: Number(req.params.id), companyId: req.companyId },
      data,
    });
    if (result.count === 0) throw new HttpError(404, "Timbrado no encontrado");
    const timbrado = await prisma.timbrado.findUnique({ where: { id: Number(req.params.id) } });
    res.json(timbrado);
  })
);

// =====================================================================
// PUNTOS DE EXPEDICION POR RUBRO
// =====================================================================
export const puntosExpedicionRouter = Router();
puntosExpedicionRouter.use(authRequired, companyRequired);

const puntoSchema = z.object({
  timbradoId: z.number().int(),
  rubroId: z.number().int(),
  codigo: z.string().min(1),
  tipoDocumento: z.enum(["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "REMISION"]).default("FACTURA"),
  numeroInicial: z.number().int().positive().default(1),
  numeroFinal: z.number().int().positive().optional().nullable(),
  numeroActual: z.number().int().nonnegative().optional(),
  activo: z.boolean().optional(),
});

// Valida que timbrado y rubro sean coherentes con la empresa activa
async function validarRefs(companyId: number, timbradoId: number, rubroId: number) {
  const timbrado = await prisma.timbrado.findFirst({ where: { id: timbradoId, companyId } });
  if (!timbrado) throw new HttpError(400, "Timbrado invalido para la empresa");
  const rubro = await prisma.rubro.findUnique({ where: { id: rubroId } });
  if (!rubro) throw new HttpError(400, "Rubro inexistente");
}

puntosExpedicionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = {
      companyId: req.companyId,
      ...(q ? { codigo: { contains: q, mode: "insensitive" as const } } : {}),
    };
    const include = {
      rubro: { select: { id: true, nombre: true } },
      timbrado: { select: { id: true, numero: true, establecimiento: true, activo: true } },
    };
    res.json(
      await listOrPaginate(
        req.query,
        { sortable: { codigo: "codigo", rubro: "rubro.nombre" }, defaultSort: "codigo" },
        ({ orderBy, skip, take }) => prisma.puntoExpedicion.findMany({ where, include, orderBy, skip, take }),
        () => prisma.puntoExpedicion.count({ where }),
        300
      )
    );
  })
);

puntosExpedicionRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = puntoSchema.parse(req.body);
    await validarRefs(req.companyId!, data.timbradoId, data.rubroId);
    const punto = await prisma.puntoExpedicion.create({
      data: { ...data, companyId: req.companyId! },
    });
    res.status(201).json(punto);
  })
);

puntosExpedicionRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = puntoSchema.partial().parse(req.body);
    if (data.timbradoId && data.rubroId) {
      await validarRefs(req.companyId!, data.timbradoId, data.rubroId);
    } else if (data.timbradoId) {
      const t = await prisma.timbrado.findFirst({ where: { id: data.timbradoId, companyId: req.companyId } });
      if (!t) throw new HttpError(400, "Timbrado invalido para la empresa");
    }
    const result = await prisma.puntoExpedicion.updateMany({
      where: { id: Number(req.params.id), companyId: req.companyId },
      data,
    });
    if (result.count === 0) throw new HttpError(404, "Punto de expedicion no encontrado");
    const punto = await prisma.puntoExpedicion.findUnique({ where: { id: Number(req.params.id) } });
    res.json(punto);
  })
);

// --- Resolver: que punto de expedicion (y timbrado) corresponde a un rubro / articulo ---

async function puntoForRubro(companyId: number, rubroId: number) {
  return prisma.puntoExpedicion.findUnique({
    where: { companyId_rubroId: { companyId, rubroId } },
    include: { timbrado: true, rubro: { select: { id: true, nombre: true } } },
  });
}

puntosExpedicionRouter.get(
  "/for-rubro/:rubroId",
  asyncHandler(async (req, res) => {
    const punto = await puntoForRubro(req.companyId!, Number(req.params.rubroId));
    res.json({
      punto: punto ?? null,
      motivo: punto ? null : "El rubro no tiene punto de expedicion asignado en esta empresa",
    });
  })
);

puntosExpedicionRouter.get(
  "/for-article/:articleId",
  asyncHandler(async (req, res) => {
    const article = await prisma.article.findUnique({ where: { id: Number(req.params.articleId) } });
    if (!article) throw new HttpError(404, "Articulo no encontrado");
    if (!article.rubroId) {
      res.json({ punto: null, motivo: "El articulo no tiene rubro asignado" });
      return;
    }
    const punto = await puntoForRubro(req.companyId!, article.rubroId);
    res.json({
      punto: punto ?? null,
      motivo: punto ? null : "El rubro del articulo no tiene punto de expedicion asignado en esta empresa",
    });
  })
);
