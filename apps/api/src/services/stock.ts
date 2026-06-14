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

export interface TransferInput {
  companyId: number;
  articleId: number;
  fromWarehouseId: number;
  toWarehouseId: number;
  cantidad: number; // positivo
  observacion?: string | null;
  usuarioId?: number | null;
}

/**
 * Transfiere stock de un deposito a otro dentro de una transaccion:
 *  - valida que haya stock suficiente en el origen,
 *  - descuenta del origen e ingresa al destino (StockByWarehouse),
 *  - registra un unico movimiento TRANSFERENCIA (warehouseId origen + warehouseDestId destino).
 */
export async function applyTransfer(tx: Prisma.TransactionClient, input: TransferInput) {
  const { companyId, articleId, fromWarehouseId, toWarehouseId, cantidad } = input;
  if (fromWarehouseId === toWarehouseId) throw new Error("El deposito de origen y destino deben ser distintos");
  if (cantidad <= 0) throw new Error("La cantidad debe ser mayor a cero");

  const origen = await tx.stockByWarehouse.findUnique({
    where: { articleId_warehouseId: { articleId, warehouseId: fromWarehouseId } },
  });
  const disponible = origen ? Number(origen.cantidad) : 0;
  if (disponible < cantidad) {
    throw new Error(`Stock insuficiente en el deposito de origen (disponible ${disponible})`);
  }

  await tx.stockByWarehouse.update({
    where: { articleId_warehouseId: { articleId, warehouseId: fromWarehouseId } },
    data: { cantidad: { decrement: cantidad } },
  });
  await tx.stockByWarehouse.upsert({
    where: { articleId_warehouseId: { articleId, warehouseId: toWarehouseId } },
    create: { articleId, warehouseId: toWarehouseId, cantidad },
    update: { cantidad: { increment: cantidad } },
  });

  await tx.stockMovement.create({
    data: {
      companyId,
      articleId,
      warehouseId: fromWarehouseId,
      warehouseDestId: toWarehouseId,
      tipo: "TRANSFERENCIA",
      cantidad,
      origenTipo: "TRANSFERENCIA",
      observacion: input.observacion ?? null,
      usuarioId: input.usuarioId ?? null,
    },
  });
}
