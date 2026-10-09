import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";

// Sucursales (por empresa) — solo lectura, para selects
export const branchesRouter = Router();
branchesRouter.use(authRequired, companyRequired);

branchesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.branch.findMany({
        where: { companyId: req.companyId, activo: true },
        orderBy: { codigo: "asc" },
      })
    );
  })
);
