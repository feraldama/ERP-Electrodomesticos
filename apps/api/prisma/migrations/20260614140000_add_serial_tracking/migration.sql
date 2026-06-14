-- Trazabilidad de series/IMEI: de que compra entro, a que venta salio y cuando.
ALTER TABLE "article_serials" ADD COLUMN "purchaseInvoiceId" INTEGER;
ALTER TABLE "article_serials" ADD COLUMN "saleInvoiceId" INTEGER;
ALTER TABLE "article_serials" ADD COLUMN "soldAt" TIMESTAMP(3);

-- Indice para listar/consultar series por articulo y estado.
CREATE INDEX "article_serials_articleId_estado_idx" ON "article_serials"("articleId", "estado");
