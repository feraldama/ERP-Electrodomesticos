import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authRequired } from "../middleware/auth.js";

export const catalogRouter = Router();

// Modulos con sus programas (para construir el dashboard - imagen 1 y 2)
catalogRouter.get(
  "/modules",
  authRequired,
  asyncHandler(async (_req, res) => {
    const modules = await prisma.module.findMany({
      where: { activo: true },
      orderBy: { orden: "asc" },
      include: {
        programs: {
          where: { activo: true },
          orderBy: { orden: "asc" },
        },
      },
    });
    res.json(modules);
  })
);

// Programas de un modulo por su codigo (ej STK)
catalogRouter.get(
  "/modules/:codigo/programs",
  authRequired,
  asyncHandler(async (req, res) => {
    const mod = await prisma.module.findUnique({
      where: { codigo: req.params.codigo.toUpperCase() },
      include: {
        programs: { where: { activo: true }, orderBy: { orden: "asc" } },
      },
    });
    if (!mod) {
      res.status(404).json({ error: "Modulo no encontrado" });
      return;
    }
    res.json(mod);
  })
);
