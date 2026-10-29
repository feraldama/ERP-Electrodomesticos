-- CreateTable
CREATE TABLE "supplier_account_config" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,

    CONSTRAINT "supplier_account_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_account_config_companyId_supplierId_key" ON "supplier_account_config"("companyId", "supplierId");

-- AddForeignKey
ALTER TABLE "supplier_account_config" ADD CONSTRAINT "supplier_account_config_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_config" ADD CONSTRAINT "supplier_account_config_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
