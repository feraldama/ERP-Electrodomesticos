import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../http.js";
import { userCan } from "../services/permissions.js";

/**
 * Exige que el usuario tenga permiso sobre el programa `codigo` (el superadmin
 * pasa siempre). Se usa despues de authRequired. Pensado para los endpoints de
 * accion (movimientos) y la administracion.
 */
export function requirePermission(codigo: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth) throw new HttpError(401, "No autenticado");
      const ok = await userCan(req.auth.userId, codigo);
      if (!ok) throw new HttpError(403, "No tenes permiso para esta accion");
      next();
    } catch (err) {
      next(err);
    }
  };
}
