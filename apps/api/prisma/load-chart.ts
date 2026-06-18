import { PrismaClient } from "@prisma/client";
import { loadChartOfAccounts } from "./chart-data.js";

// Carga el plan de cuentas del cliente (CNTL100) y la config contable para una empresa.
// Uso:  tsx prisma/load-chart.ts <companyId>
//   ej: tsx prisma/load-chart.ts 1
// Idempotente: se puede correr varias veces. NO toca asientos existentes.
const prisma = new PrismaClient();

async function main() {
  const companyId = Number(process.argv[2]);
  if (!Number.isInteger(companyId)) {
    console.error("Uso: tsx prisma/load-chart.ts <companyId>");
    process.exit(1);
  }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, razonSocial: true } });
  if (!company) {
    console.error(`No existe la empresa con id ${companyId}`);
    process.exit(1);
  }

  console.log(`Cargando plan de cuentas para: ${company.razonSocial} (id ${company.id})...`);
  const r = await loadChartOfAccounts(prisma, companyId);
  console.log("Listo.");
  console.log(`  Cuentas creadas:      ${r.creadas}`);
  console.log(`  Cuentas actualizadas: ${r.actualizadas}`);
  console.log(`  Cuentas desactivadas: ${r.desactivadas}`);
  console.log(`  Cuentas borradas:     ${r.borradas}`);
  console.log(`  Config creada:        ${r.configCreadas}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
