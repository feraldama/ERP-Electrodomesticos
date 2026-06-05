import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired, signToken } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        roles: { include: { role: true } },
        userCompanies: { include: { company: true } },
      },
    });

    if (!user || !user.activo) {
      throw new HttpError(401, "Usuario o contrasena incorrectos");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, "Usuario o contrasena incorrectos");
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      isSuperadmin: user.isSuperadmin,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        isSuperadmin: user.isSuperadmin,
        roles: user.roles.map((r) => r.role.nombre),
        companies: user.userCompanies.map((uc) => ({
          id: uc.company.id,
          razonSocial: uc.company.razonSocial,
          nombreFantasia: uc.company.nombreFantasia,
        })),
      },
    });
  })
);

authRouter.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      include: {
        roles: { include: { role: true } },
        userCompanies: { include: { company: true } },
      },
    });
    if (!user) throw new HttpError(404, "Usuario no encontrado");
    res.json({
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      isSuperadmin: user.isSuperadmin,
      roles: user.roles.map((r) => r.role.nombre),
      companies: user.userCompanies.map((uc) => ({
        id: uc.company.id,
        razonSocial: uc.company.razonSocial,
        nombreFantasia: uc.company.nombreFantasia,
      })),
    });
  })
);
