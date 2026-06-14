-- AlterTable
ALTER TABLE "sales_credit_notes" ADD COLUMN     "conStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iva10" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "iva5" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal10" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal5" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalExenta" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "usuarioId" INTEGER,
ADD COLUMN     "warehouseId" INTEGER;

-- CreateTable
CREATE TABLE "sales_credit_note_items" (
    "id" SERIAL NOT NULL,
    "creditNoteId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precioUnitario" DECIMAL(18,4) NOT NULL,
    "ivaTipo" "IvaTipo" NOT NULL DEFAULT 'IVA10',
    "total" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "sales_credit_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_credit_notes_companyId_invoiceId_idx" ON "sales_credit_notes"("companyId", "invoiceId");

-- AddForeignKey
ALTER TABLE "sales_credit_note_items" ADD CONSTRAINT "sales_credit_note_items_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "sales_credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_credit_note_items" ADD CONSTRAINT "sales_credit_note_items_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
