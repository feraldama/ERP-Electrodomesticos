-- CreateEnum
CREATE TYPE "QuoteEstado" AS ENUM ('VIGENTE', 'CONVERTIDO', 'ANULADO');

-- CreateTable
CREATE TABLE "sales_quotes" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "priceListId" INTEGER,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "validezDias" INTEGER NOT NULL DEFAULT 15,
    "subtotalExenta" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal5" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal10" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva5" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva10" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" "QuoteEstado" NOT NULL DEFAULT 'VIGENTE',
    "observacion" TEXT,
    "usuarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quote_items" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precioUnitario" DECIMAL(18,4) NOT NULL,
    "ivaTipo" "IvaTipo" NOT NULL DEFAULT 'IVA10',
    "total" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "sales_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_quotes_companyId_customerId_idx" ON "sales_quotes"("companyId", "customerId");

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_items" ADD CONSTRAINT "sales_quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "sales_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quote_items" ADD CONSTRAINT "sales_quote_items_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
