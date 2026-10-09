-- Detalle de compra: cantidad bonificada (sin cargo) y descuento de la linea.
ALTER TABLE "purchase_invoice_items" ADD COLUMN "cantidadBonificada" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoice_items" ADD COLUMN "descuento" DECIMAL(18,4) NOT NULL DEFAULT 0;
