-- AlterTable
ALTER TABLE "sales_invoice_items" ADD COLUMN     "costoUnitario" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "sales_credit_note_items_creditNoteId_idx" ON "sales_credit_note_items"("creditNoteId");

-- CreateIndex
CREATE INDEX "sales_credit_note_items_articleId_idx" ON "sales_credit_note_items"("articleId");

-- CreateIndex
CREATE INDEX "sales_invoice_items_invoiceId_idx" ON "sales_invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "sales_invoice_items_articleId_idx" ON "sales_invoice_items"("articleId");

-- CreateIndex
CREATE INDEX "sales_invoices_companyId_fecha_idx" ON "sales_invoices"("companyId", "fecha");

-- Backfill del costo de las ventas existentes: el costo con que salio la mercaderia
-- (movimiento de stock de la venta). Los articulos sin movimiento (servicios) toman
-- el costo actual del articulo.
UPDATE "sales_invoice_items" it
SET "costoUnitario" = COALESCE(
  (SELECT m."costoUnitario"
     FROM "stock_movements" m
     JOIN "sales_invoices" i ON i."id" = it."invoiceId"
    WHERE m."origenTipo" = 'VENTA' AND m."origenId" = it."invoiceId" AND m."articleId" = it."articleId"
      AND m."companyId" = i."companyId" AND m."costoUnitario" IS NOT NULL
    ORDER BY m."id"
    LIMIT 1),
  (SELECT a."costoActual" FROM "articles" a WHERE a."id" = it."articleId"),
  0
);
