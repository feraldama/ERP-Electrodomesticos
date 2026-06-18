import { PrismaClient, ProgramCategoria } from "@prisma/client";

// Registro idempotente y ADITIVO de los programas nuevos de Contabilidad y sus
// permisos. No toca el plan de cuentas, ni la empresa, ni ningun otro dato: solo
// hace upsert de estas filas de menu. Uso: tsx prisma/register-conta-programs.ts
const prisma = new PrismaClient();

const NUEVOS: Array<{ codigo: string; nombre: string; categoria: ProgramCategoria; ruta: string }> = [
  { codigo: "CONC008", nombre: "Libro IVA Compras", categoria: "LISTADOS", ruta: "/contabilidad/libro-compras" },
  { codigo: "CONC009", nombre: "Libro IVA Ventas", categoria: "LISTADOS", ruta: "/contabilidad/libro-ventas" },
  { codigo: "CONM010", nombre: "Configuracion de cuentas", categoria: "MANTENIMIENTOS", ruta: "/contabilidad/config" },
  { codigo: "CONM011", nombre: "Ejercicios fiscales", categoria: "MANTENIMIENTOS", ruta: "/contabilidad/ejercicios" },
];

async function main() {
  const mod = await prisma.module.findUnique({ where: { codigo: "CON" }, select: { id: true } });
  if (!mod) throw new Error('No existe el modulo "CON". Corre el seed base primero.');

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
  console.log("Programas de Contabilidad registrados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
