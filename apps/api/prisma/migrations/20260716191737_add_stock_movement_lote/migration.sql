-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "loteId" UUID;

-- CreateIndex
CREATE INDEX "stock_movements_companyId_loteId_idx" ON "stock_movements"("companyId", "loteId");
