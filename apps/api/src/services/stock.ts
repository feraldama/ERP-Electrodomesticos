import type { Prisma, StockMovTipo } from "@prisma/client";

export interface StockMovementInput {
  companyId: number;
  articleId: number;
  warehouseId: number;
  cantidad: number; // con signo: positivo ingresa, negativo egresa
  tipo: StockMovTipo;
  costoUnitario?: number | null;
  origenTipo?: string | null; // COMPRA, VENTA, AJUSTE, TRANSFERENCIA, DEVOLUCION
  origenId?: number | null;
  observacion?: string | null;
  usuarioId?: number | null;
}

/**
 * Aplica un movimiento de stock dentro de una transaccion:
 *  - ajusta StockByWarehouse (lo crea si no existe)
 *  - registra el StockMovement
 * Es el unico punto por donde se mueve stock; lo reutilizan compras, ventas,
 * ajustes y transferencias para mantener consistencia.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  input: StockMovementInput
) {
  const {
    companyId,
    articleId,
    warehouseId,
    cantidad,
    tipo,
    costoUnitario = null,
    origenTipo = null,
    origenId = null,
    observacion = null,
    usuarioId = null,
  } = input;

  // 1) Saldo por deposito: upsert atomico sobre la clave unica (articleId, warehouseId).
  //    Evita la race de "leer y luego crear/actualizar".
  await tx.stockByWarehouse.upsert({
    where: { articleId_warehouseId: { articleId, warehouseId } },
    create: { articleId, warehouseId, cantidad },
    update: { cantidad: { increment: cantidad } },
  });

  // 2) Registro del movimiento (auditoria / kardex)
  await tx.stockMovement.create({
    data: {
      companyId,
      articleId,
      warehouseId,
      tipo,
      cantidad,
      costoUnitario,
      origenTipo,
      origenId,
      observacion,
      usuarioId,
    },
  });
}
