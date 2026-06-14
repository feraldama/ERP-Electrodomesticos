-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "imagenUrl" TEXT;

-- CreateTable
CREATE TABLE "timbrados" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "tipoDocumento" "TipoDocElectronico" NOT NULL DEFAULT 'FACTURA',
    "establecimiento" TEXT NOT NULL DEFAULT '001',
    "puntoExpedicion" TEXT NOT NULL DEFAULT '001',
    "numeroInicial" INTEGER NOT NULL DEFAULT 1,
    "numeroFinal" INTEGER,
    "numeroActual" INTEGER NOT NULL DEFAULT 0,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timbrados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubro_timbrados" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "rubroId" INTEGER NOT NULL,
    "timbradoId" INTEGER NOT NULL,

    CONSTRAINT "rubro_timbrados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timbrados_companyId_idx" ON "timbrados"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "timbrados_companyId_numero_establecimiento_puntoExpedicion_key" ON "timbrados"("companyId", "numero", "establecimiento", "puntoExpedicion");

-- CreateIndex
CREATE INDEX "rubro_timbrados_companyId_idx" ON "rubro_timbrados"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "rubro_timbrados_companyId_rubroId_key" ON "rubro_timbrados"("companyId", "rubroId");

-- AddForeignKey
ALTER TABLE "timbrados" ADD CONSTRAINT "timbrados_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubro_timbrados" ADD CONSTRAINT "rubro_timbrados_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubro_timbrados" ADD CONSTRAINT "rubro_timbrados_rubroId_fkey" FOREIGN KEY ("rubroId") REFERENCES "rubros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubro_timbrados" ADD CONSTRAINT "rubro_timbrados_timbradoId_fkey" FOREIGN KEY ("timbradoId") REFERENCES "timbrados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
