// Backfill de `loteId` para movimientos de stock creados antes de existir la columna.
// Ejecutar una sola vez tras la migracion `add_stock_movement_lote`:
//     pnpm --filter @erp/api exec tsx prisma/backfillLoteId.ts
//
// Reglas de agrupacion (reconstruyen la "operacion" que genero cada linea):
//  - Lineas con origenId (COMPRA, VENTA, notas, anulaciones): un lote por documento,
//    key = companyId|origenTipo|origenId (exacto).
//  - Lineas sin origenId (AJUSTE, TRANSFERENCIA historicos): gaps-and-islands por
//    (companyId, tipo, deposito origen/destino, usuario, observacion) dentro de una
//    ventana corta de tiempo (Prisma generaba now() por fila, ~ms de diferencia).
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const WINDOW_MS = 5000;

async function main() {
  const rows = await prisma.stockMovement.findMany({
    where: { loteId: null },
    orderBy: [{ companyId: "asc" }, { fecha: "asc" }, { id: "asc" }],
    select: {
      id: true,
      companyId: true,
      tipo: true,
      warehouseId: true,
      warehouseDestId: true,
      usuarioId: true,
      observacion: true,
      origenTipo: true,
      origenId: true,
      fecha: true,
    },
  });

  const docLote = new Map<string, string>(); // companyId|origenTipo|origenId -> loteId
  const updates: { id: number; loteId: string }[] = [];

  // Estado para el agrupamiento por ventana (solo lineas sin origenId).
  let lastSig = "";
  let lastFecha = 0;
  let windowLote = "";

  for (const r of rows) {
    let loteId: string;
    if (r.origenId != null) {
      const key = `${r.companyId}|${r.origenTipo ?? ""}|${r.origenId}`;
      loteId = docLote.get(key) ?? randomUUID();
      docLote.set(key, loteId);
    } else {
      const sig = `${r.companyId}|${r.tipo}|${r.warehouseId}|${r.warehouseDestId ?? ""}|${r.usuarioId ?? ""}|${r.observacion ?? ""}`;
      const t = r.fecha.getTime();
      if (sig === lastSig && t - lastFecha <= WINDOW_MS) {
        loteId = windowLote;
      } else {
        loteId = randomUUID();
        windowLote = loteId;
      }
      lastSig = sig;
      lastFecha = t;
    }
    updates.push({ id: r.id, loteId });
  }

  for (const u of updates) {
    await prisma.stockMovement.update({ where: { id: u.id }, data: { loteId: u.loteId } });
  }

  const lotes = new Set(updates.map((u) => u.loteId)).size;
  console.log(`Backfill listo: ${updates.length} lineas -> ${lotes} lotes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
