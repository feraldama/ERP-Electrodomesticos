import type { Prisma } from "@prisma/client";

// Libro de series/IMEI por unidad. Para articulos con controlaSerie, cada unidad
// EN_STOCK = una serie EN_STOCK. Estas funciones corren dentro de la transaccion
// de compra/venta/NC/anulacion para mantener todo consistente.

function limpiar(series: string[]): string[] {
  return series.map((s) => s.trim()).filter(Boolean);
}

/** Compra: crea una serie EN_STOCK por unidad ingresada. Valida unicidad. */
export async function crearSeriesCompra(
  tx: Prisma.TransactionClient,
  input: { articleId: number; warehouseId: number; purchaseInvoiceId: number; series: string[] }
) {
  const series = limpiar(input.series);
  if (new Set(series).size !== series.length) throw new Error("Hay series repetidas en la carga");
  for (const serie of series) {
    try {
      await tx.articleSerial.create({
        data: {
          articleId: input.articleId,
          serie,
          warehouseId: input.warehouseId,
          estado: "EN_STOCK",
          purchaseInvoiceId: input.purchaseInvoiceId,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new Error(`La serie/IMEI "${serie}" ya esta cargada para este articulo`);
      }
      throw err;
    }
  }
}

/** Venta: marca VENDIDO las series elegidas. Valida existencia, estado, articulo y deposito. */
export async function consumirSeriesVenta(
  tx: Prisma.TransactionClient,
  input: { articleId: number; warehouseId: number; saleInvoiceId: number; soldAt: Date; series: string[] }
) {
  const series = limpiar(input.series);
  if (new Set(series).size !== series.length) throw new Error("Hay series repetidas en la venta");
  for (const serie of series) {
    const row = await tx.articleSerial.findUnique({
      where: { articleId_serie: { articleId: input.articleId, serie } },
    });
    if (!row) throw new Error(`La serie/IMEI "${serie}" no existe para el articulo`);
    if (row.estado !== "EN_STOCK") throw new Error(`La serie/IMEI "${serie}" no esta disponible (estado ${row.estado})`);
    if (row.warehouseId !== input.warehouseId) throw new Error(`La serie/IMEI "${serie}" no esta en el deposito seleccionado`);
    await tx.articleSerial.update({
      where: { id: row.id },
      data: { estado: "VENDIDO", saleInvoiceId: input.saleInvoiceId, soldAt: input.soldAt },
    });
  }
}

/** NC de venta: las series devueltas pasan a DEVUELTO (apartadas, no revendibles). */
export async function devolverSeriesVenta(
  tx: Prisma.TransactionClient,
  input: { saleInvoiceId: number; articleId: number; series: string[] }
) {
  for (const serie of limpiar(input.series)) {
    const row = await tx.articleSerial.findUnique({
      where: { articleId_serie: { articleId: input.articleId, serie } },
    });
    if (!row || row.saleInvoiceId !== input.saleInvoiceId) {
      throw new Error(`La serie/IMEI "${serie}" no pertenece a esta venta`);
    }
    if (row.estado !== "VENDIDO") throw new Error(`La serie/IMEI "${serie}" no esta vendida (estado ${row.estado})`);
    await tx.articleSerial.update({ where: { id: row.id }, data: { estado: "DEVUELTO" } });
  }
}

/** Anular venta: todas las series vendidas en esa venta vuelven a EN_STOCK. */
export async function revertirSeriesVenta(tx: Prisma.TransactionClient, saleInvoiceId: number) {
  await tx.articleSerial.updateMany({
    where: { saleInvoiceId, estado: "VENDIDO" },
    data: { estado: "EN_STOCK", saleInvoiceId: null, soldAt: null },
  });
}

/** Anular compra: bloquea si alguna serie ya salio; si todas EN_STOCK, las elimina. */
export async function eliminarSeriesCompra(tx: Prisma.TransactionClient, purchaseInvoiceId: number) {
  const series = await tx.articleSerial.findMany({ where: { purchaseInvoiceId } });
  const usada = series.find((s) => s.estado !== "EN_STOCK");
  if (usada) {
    throw new Error(`No se puede anular: la serie/IMEI "${usada.serie}" ya tiene movimiento (estado ${usada.estado})`);
  }
  await tx.articleSerial.deleteMany({ where: { purchaseInvoiceId, estado: "EN_STOCK" } });
}
