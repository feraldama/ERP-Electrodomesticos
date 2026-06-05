import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { HttpError } from "../http.js";

export interface AuthPayload {
  userId: number;
  username: string;
  isSuperadmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Token no provisto");
  }
  const token = header.slice("Bearer ".length);
  try {
    req.auth = jwt.verify(token, env.jwtSecret) as AuthPayload;
    next();
  } catch {
    throw new HttpError(401, "Token invalido o expirado");
  }
}
