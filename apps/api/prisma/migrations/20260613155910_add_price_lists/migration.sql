-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "priceListId" INTEGER;

-- CreateTable
CREATE TABLE "price_lists" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "condicion" "CondicionPago" NOT NULL DEFAULT 'CONTADO',
    "cuotas" INTEGER NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "esDefault" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_prices" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "priceListId" INTEGER NOT NULL,
    "precio" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_codigo_key" ON "price_lists"("codigo");

-- CreateIndex
CREATE INDEX "article_prices_priceListId_idx" ON "article_prices"("priceListId");

-- CreateIndex
CREATE UNIQUE INDEX "article_prices_articleId_priceListId_key" ON "article_prices"("articleId", "priceListId");

-- AddForeignKey
ALTER TABLE "article_prices" ADD CONSTRAINT "article_prices_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_prices" ADD CONSTRAINT "article_prices_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
