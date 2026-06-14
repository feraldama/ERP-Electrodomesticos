-- DropForeignKey
ALTER TABLE "rubro_timbrados" DROP CONSTRAINT "rubro_timbrados_companyId_fkey";

-- DropForeignKey
ALTER TABLE "rubro_timbrados" DROP CONSTRAINT "rubro_timbrados_rubroId_fkey";

-- DropForeignKey
ALTER TABLE "rubro_timbrados" DROP CONSTRAINT "rubro_timbrados_timbradoId_fkey";

-- DropIndex
DROP INDEX "timbrados_companyId_numero_establecimiento_puntoExpedicion_key";

-- AlterTable
ALTER TABLE "timbrados" DROP COLUMN "numeroActual",
DROP COLUMN "numeroFinal",
DROP COLUMN "numeroInicial",
DROP COLUMN "puntoExpedicion",
DROP COLUMN "tipoDocumento";

-- DropTable
DROP TABLE "rubro_timbrados";

-- CreateTable
CREATE TABLE "puntos_expedicion" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "timbradoId" INTEGER NOT NULL,
    "rubroId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipoDocumento" "TipoDocElectronico" NOT NULL DEFAULT 'FACTURA',
    "numeroInicial" INTEGER NOT NULL DEFAULT 1,
    "numeroFinal" INTEGER,
    "numeroActual" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puntos_expedicion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "puntos_expedicion_companyId_idx" ON "puntos_expedicion"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "puntos_expedicion_companyId_rubroId_key" ON "puntos_expedicion"("companyId", "rubroId");

-- CreateIndex
CREATE UNIQUE INDEX "puntos_expedicion_companyId_codigo_key" ON "puntos_expedicion"("companyId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "timbrados_companyId_numero_key" ON "timbrados"("companyId", "numero");

-- AddForeignKey
ALTER TABLE "puntos_expedicion" ADD CONSTRAINT "puntos_expedicion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puntos_expedicion" ADD CONSTRAINT "puntos_expedicion_timbradoId_fkey" FOREIGN KEY ("timbradoId") REFERENCES "timbrados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puntos_expedicion" ADD CONSTRAINT "puntos_expedicion_rubroId_fkey" FOREIGN KEY ("rubroId") REFERENCES "rubros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
