import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";
import { listOrPaginate, buildWordSearch } from "../lib/listQuery.js";

// =====================================================================
// MOTIVOS DE ANULACION (FINM010) — catalogo global que usa "Anular el documento"
// =====================================================================
export const motivosAnulacionRouter = Router();
motivosAnulacionRouter.use(authRequired);

const sortable = { codigo: "codigo", descripcion: "descripcion", estado: "activo" } as const;

const motivoSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  descripcion: z.string().trim().min(1).max(150),
  activo: z.boolean().optional(),
});

// Codigo unico: traduce el error de Prisma a un mensaje claro.
function codigoDuplicado(err: unknown): never {
  if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
    throw new HttpError(400, "Ya existe un motivo con ese codigo");
  }
  throw err;
}

motivosAnulacionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = buildWordSearch(q, ["codigo", "descripcion"]);
    res.json(
      await listOrPaginate(
        req.query,
        { sortable, defaultSort: "descripcion" },
        ({ orderBy, skip, take }) => prisma.motivoAnulacion.findMany({ where, orderBy, skip, take }),
        () => prisma.motivoAnulacion.count({ where }),
        300
      )
    );
  })
);

motivosAnulacionRouter.post(
  "/",
  requirePermission("FINM010"),
  asyncHandler(async (req, res) => {
    const data = motivoSchema.parse(req.body);
    const motivo = await prisma.motivoAnulacion
      .create({ data: { ...data, descripcion: data.descripcion.toUpperCase() } })
      .catch(codigoDuplicado);
    res.status(201).json(motivo);
  })
);

motivosAnulacionRouter.put(
  "/:id",
  requirePermission("FINM010"),
  asyncHandler(async (req, res) => {
    const data = motivoSchema.partial().parse(req.body);
    const motivo = await prisma.motivoAnulacion
      .update({
        where: { id: Number(req.params.id) },
        data: { ...data, descripcion: data.descripcion?.toUpperCase() },
      })
      .catch(codigoDuplicado);
    res.json(motivo);
  })
);

// Solo se elimina si ningun documento anulado lo usa; si no, se desactiva.
motivosAnulacionRouter.delete(
  "/:id",
  requirePermission("FINM010"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [ventas, compras] = await Promise.all([
      prisma.salesInvoice.count({ where: { motivoAnulacionId: id } }),
      prisma.purchaseInvoice.count({ where: { motivoAnulacionId: id } }),
    ]);
    if (ventas + compras > 0) {
      throw new HttpError(400, "El motivo ya se uso en documentos anulados; desactivalo en lugar de eliminarlo");
    }
    await prisma.motivoAnulacion.delete({ where: { id } });
    res.json({ ok: true });
  })
);
