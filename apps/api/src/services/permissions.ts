import { prisma } from "../db.js";

export interface UserPermisos {
  isSuperadmin: boolean;
  codigos: string[]; // claves de permiso = codigos de programa (ej "VENI001")
}

/**
 * Permisos efectivos de un usuario: la union de las claves de permiso de todos
 * sus roles. La clave de cada permiso es el codigo del programa (pantalla).
 * El superadmin no necesita permisos: puede todo (codigos vacio + flag).
 */
export async function getUserPermisos(userId: number): Promise<UserPermisos> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperadmin: true,
      roles: {
        select: {
          role: { select: { permissions: { select: { permission: { select: { clave: true } } } } } },
        },
      },
    },
  });
  if (!user) return { isSuperadmin: false, codigos: [] };
  if (user.isSuperadmin) return { isSuperadmin: true, codigos: [] };

  const codigos = new Set<string>();
  for (const ur of user.roles)
    for (const rp of ur.role.permissions) codigos.add(rp.permission.clave);
  return { isSuperadmin: false, codigos: [...codigos] };
}

/** True si el usuario puede acceder al programa indicado (superadmin siempre). */
export async function userCan(userId: number, codigo: string): Promise<boolean> {
  const { isSuperadmin, codigos } = await getUserPermisos(userId);
  return isSuperadmin || codigos.includes(codigo);
}
