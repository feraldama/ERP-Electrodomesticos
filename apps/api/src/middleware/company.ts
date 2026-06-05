import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { HttpError } from "../http.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      companyId?: number;
    }
  }
}

// Requiere y valida el header X-Company-Id (empresa activa del frontend)
// y que el usuario autenticado tenga acceso a esa empresa (salvo superadmin).
// Se envuelve en una promesa con .catch(next) porque Express 4 no captura
// el rechazo de un middleware async automaticamente.
export function companyRequired(req: Request, _res: Response, next: NextFunction) {
  resolveCompany(req)
    .then(() => next())
    .catch(next);
}

async function resolveCompany(req: Request) {
  const raw = req.header("X-Company-Id");
  const id = Number(raw);
  if (!raw || Number.isNaN(id)) {
    throw new HttpError(400, "Empresa no especificada (X-Company-Id)");
  }
  if (!req.auth) {
    throw new HttpError(401, "No autenticado");
  }
  if (!req.auth.isSuperadmin) {
    const acceso = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: req.auth.userId, companyId: id } },
    });
    if (!acceso) {
      throw new HttpError(403, "No tiene acceso a esta empresa");
    }
  }
  req.companyId = id;
}
