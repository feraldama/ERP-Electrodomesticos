import { PrismaClient, ProgramCategoria } from "@prisma/client";

// Registro idempotente y ADITIVO de los programas nuevos de Finanzas y sus
// permisos. No toca el plan de cuentas, ni la empresa, ni ningun otro dato: solo
// hace upsert de estas filas de menu. Uso: tsx prisma/register-fin-programs.ts
const prisma = new PrismaClient();

const NUEVOS: Array<{ codigo: string; nombre: string; categoria: ProgramCategoria; ruta: string }> = [
  { codigo: "FINC009", nombre: "Transacciones registradas y su impacto", categoria: "CONSULTAS", ruta: "/finanzas/transacciones" },
  { codigo: "FINM010", nombre: "Motivos de anulacion", categoria: "MANTENIMIENTOS", ruta: "/finanzas/motivos-anulacion" },
];

async function main() {
  const mod = await prisma.module.findUnique({ where: { codigo: "FIN" }, select: { id: true } });
  if (!mod) throw new Error('No existe el modulo "FIN". Corre el seed base primero.');

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
  console.log("Programas de Finanzas registrados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
