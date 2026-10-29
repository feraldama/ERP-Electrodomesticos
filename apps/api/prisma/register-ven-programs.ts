import { PrismaClient, ProgramCategoria } from "@prisma/client";

// Registro idempotente y ADITIVO de los programas nuevos de Ventas y sus permisos.
// Solo hace upsert de estas filas de menu. Uso: tsx prisma/register-ven-programs.ts
const prisma = new PrismaClient();

const NUEVOS: Array<{ codigo: string; nombre: string; categoria: ProgramCategoria; ruta: string }> = [
  { codigo: "VENC012", nombre: "Historial de ventas por articulo", categoria: "CONSULTAS", ruta: "/ventas/historial" },
];

async function main() {
  const mod = await prisma.module.findUnique({ where: { codigo: "VEN" }, select: { id: true } });
  if (!mod) throw new Error('No existe el modulo "VEN". Corre el seed base primero.');

  const base = await prisma.program.count({ where: { moduleId: mod.id } });
  let orden = base;
  for (const p of NUEVOS) {
    orden += 1;
    await prisma.program.upsert({
      where: { codigo: p.codigo },
      update: { nombre: p.nombre, categoria: p.categoria, ruta: p.ruta, moduleId: mod.id },
      create: { codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, ruta: p.ruta, orden, moduleId: mod.id },
    });
    await prisma.permission.upsert({
      where: { clave: p.codigo },
      update: { descripcion: p.nombre },
      create: { clave: p.codigo, descripcion: p.nombre },
    });
    console.log(`  ok ${p.codigo} - ${p.nombre}`);
  }
  console.log("Programas de Ventas registrados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
