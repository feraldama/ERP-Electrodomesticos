-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA');

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "entregaInicial" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sales_payments" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_payments_companyId_invoiceId_idx" ON "sales_payments"("companyId", "invoiceId");

-- AddForeignKey
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
