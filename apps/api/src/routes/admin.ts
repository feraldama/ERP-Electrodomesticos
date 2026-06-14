import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permission.js";

// =====================================================================
// ADMINISTRACION: ROLES Y PERMISOS (ADMM001)
// =====================================================================
export const rolesRouter = Router();
rolesRouter.use(authRequired, requirePermission("ADMM001"));

rolesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: { nombre: "asc" },
      include: { permissions: { select: { permission: { select: { clave: true } } } }, _count: { select: { users: true } } },
    });
    res.json(
      roles.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        usuarios: r._count.users,
        permisos: r.permissions.map((p) => p.permission.clave),
      }))
    );
  })
);

const roleSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional().nullable(),
  permisos: z.array(z.string()).optional(), // codigos de programa
});

// Reemplaza el set de permisos de un rol por las claves dadas
async function setRolePermisos(roleId: number, claves: string[]) {
  const perms = await prisma.permission.findMany({ where: { clave: { in: claves } }, select: { id: true } });
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) }),
  ]);
}

rolesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = roleSchema.parse(req.body);
    const role = await prisma.role.create({ data: { nombre: d.nombre, descripcion: d.descripcion ?? null } });
    if (d.permisos) await setRolePermisos(role.id, d.permisos);
    res.status(201).json(role);
  })
);

rolesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const d = roleSchema.partial().parse(req.body);
    const exists = await prisma.role.findUnique({ where: { id } });
    if (!exists) throw new HttpError(404, "Rol no encontrado");
    if (d.nombre !== undefined || d.descripcion !== undefined) {
      await prisma.role.update({ where: { id }, data: { nombre: d.nombre, descripcion: d.descripcion } });
    }
    if (d.permisos) await setRolePermisos(id, d.permisos);
    res.json({ ok: true });
  })
);

rolesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.role.delete({ where: { id } });
    res.json({ ok: true });
  })
);

// =====================================================================
// ADMINISTRACION: USUARIOS (ADMM002)
// =====================================================================
export const usersRouter = Router();
usersRouter.use(authRequired, requirePermission("ADMM002"));

usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { nombre: "asc" },
      include: { roles: { select: { roleId: true } }, userCompanies: { select: { companyId: true } } },
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        nombre: u.nombre,
        activo: u.activo,
        isSuperadmin: u.isSuperadmin,
        roleIds: u.roles.map((r) => r.roleId),
        companyIds: u.userCompanies.map((c) => c.companyId),
      }))
    );
  })
);

const userCreateSchema = z.object({
  username: z.string().min(1),
  nombre: z.string().min(1),
  password: z.string().min(4),
  activo: z.boolean().optional(),
  roleIds: z.array(z.number().int()).optional(),
  companyIds: z.array(z.number().int()).optional(),
});

const userUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  activo: z.boolean().optional(),
  password: z.string().min(4).optional(),
  roleIds: z.array(z.number().int()).optional(),
  companyIds: z.array(z.number().int()).optional(),
});

async function setUserRoles(userId: number, roleIds: number[]) {
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) }),
  ]);
}

async function setUserCompanies(userId: number, companyIds: number[]) {
  await prisma.$transaction([
    prisma.userCompany.deleteMany({ where: { userId } }),
    prisma.userCompany.createMany({ data: companyIds.map((companyId) => ({ userId, companyId })) }),
  ]);
}

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = userCreateSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(d.password, 10);
    const user = await prisma.user.create({
      data: { username: d.username.trim(), nombre: d.nombre, passwordHash, activo: d.activo ?? true },
    });
    if (d.roleIds) await setUserRoles(user.id, d.roleIds);
    if (d.companyIds) await setUserCompanies(user.id, d.companyIds);
    res.status(201).json({ id: user.id });
  })
);

usersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const d = userUpdateSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { id } });
    if (!exists) throw new HttpError(404, "Usuario no encontrado");

    const data: Record<string, unknown> = {};
    if (d.nombre !== undefined) data.nombre = d.nombre;
    if (d.activo !== undefined) data.activo = d.activo;
    if (d.password) data.passwordHash = await bcrypt.hash(d.password, 10);
    if (Object.keys(data).length) await prisma.user.update({ where: { id }, data });
    if (d.roleIds) await setUserRoles(id, d.roleIds);
    if (d.companyIds) await setUserCompanies(id, d.companyIds);
    res.json({ ok: true });
  })
);

// Empresas (para asignar a usuarios)
export const companiesRouter = Router();
companiesRouter.use(authRequired, requirePermission("ADMM002"));
companiesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const companies = await prisma.company.findMany({
      where: { activo: true },
      orderBy: { razonSocial: "asc" },
      select: { id: true, razonSocial: true, nombreFantasia: true },
    });
    res.json(companies);
  })
);
