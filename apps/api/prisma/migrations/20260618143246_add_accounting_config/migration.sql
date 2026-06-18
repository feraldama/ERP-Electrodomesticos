-- CreateTable
CREATE TABLE "accounting_config" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,

    CONSTRAINT "accounting_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_config_companyId_idx" ON "accounting_config"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_config_companyId_clave_key" ON "accounting_config"("companyId", "clave");

-- AddForeignKey
ALTER TABLE "accounting_config" ADD CONSTRAINT "accounting_config_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
