-- CreateTable
CREATE TABLE "motivos_anulacion" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motivos_anulacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "motivos_anulacion_codigo_key" ON "motivos_anulacion"("codigo");

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "anuladoAt" TIMESTAMP(3),
ADD COLUMN     "anuladoEnLibroIva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anuladoPorId" INTEGER,
ADD COLUMN     "motivoAnulacionId" INTEGER,
ADD COLUMN     "observacionAnulacion" TEXT;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "anuladoAt" TIMESTAMP(3),
ADD COLUMN     "anuladoEnLibroIva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anuladoPorId" INTEGER,
ADD COLUMN     "motivoAnulacionId" INTEGER,
ADD COLUMN     "observacionAnulacion" TEXT;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_motivoAnulacionId_fkey" FOREIGN KEY ("motivoAnulacionId") REFERENCES "motivos_anulacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_motivoAnulacionId_fkey" FOREIGN KEY ("motivoAnulacionId") REFERENCES "motivos_anulacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Motivos iniciales
INSERT INTO "motivos_anulacion" ("codigo", "descripcion") VALUES
  ('2301', 'OPERACION CANCELADA'),
  ('2302', 'DATOS DEL CLIENTE / PROVEEDOR INCORRECTOS'),
  ('2303', 'ERROR EN LA CARGA'),
  ('2304', 'DOCUMENTO DUPLICADO'),
  ('2305', 'ERROR EN PRECIOS O CANTIDADES'),
  ('2306', 'DEVOLUCION TOTAL DE LA MERCADERIA')
ON CONFLICT ("codigo") DO NOTHING;
