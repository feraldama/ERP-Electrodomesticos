-- Compras: sucursal que registra la compra (opcional).
ALTER TABLE "purchase_invoices" ADD COLUMN "branchId" INTEGER;

ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
