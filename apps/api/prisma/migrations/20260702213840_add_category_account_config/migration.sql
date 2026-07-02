-- CreateTable
CREATE TABLE "category_account_config" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "cuentaCompraId" INTEGER,
    "cuentaVentaId" INTEGER,
    "cuentaDevolucionId" INTEGER,

    CONSTRAINT "category_account_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_account_config_companyId_idx" ON "category_account_config"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "category_account_config_companyId_categoryId_key" ON "category_account_config"("companyId", "categoryId");

-- AddForeignKey
ALTER TABLE "category_account_config" ADD CONSTRAINT "category_account_config_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_account_config" ADD CONSTRAINT "category_account_config_cuentaCompraId_fkey" FOREIGN KEY ("cuentaCompraId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_account_config" ADD CONSTRAINT "category_account_config_cuentaVentaId_fkey" FOREIGN KEY ("cuentaVentaId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_account_config" ADD CONSTRAINT "category_account_config_cuentaDevolucionId_fkey" FOREIGN KEY ("cuentaDevolucionId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
