-- Detalle de compra: importe por tasa de IVA (una linea puede ser parte gravada y parte exenta).
ALTER TABLE "purchase_invoice_items" ADD COLUMN "importe10" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoice_items" ADD COLUMN "importe5" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_invoice_items" ADD COLUMN "importeExenta" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- Lineas existentes: todo el total en su unica tasa.
UPDATE "purchase_invoice_items" SET
  "importe10"     = CASE WHEN "ivaTipo" = 'IVA10'  THEN "total" ELSE 0 END,
  "importe5"      = CASE WHEN "ivaTipo" = 'IVA5'   THEN "total" ELSE 0 END,
  "importeExenta" = CASE WHEN "ivaTipo" = 'EXENTA' THEN "total" ELSE 0 END;
