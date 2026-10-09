-- Timbrados de proveedores: se registran una vez y se eligen al cargar compras.
CREATE TYPE "TipoTimbrado" AS ENUM ('PREIMPRESO', 'AUTOIMPRESOR', 'ELECTRONICO');

CREATE TABLE "supplier_timbrados" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "tipoDocumento" "TipoDocElectronico" NOT NULL DEFAULT 'FACTURA',
    "establecimiento" TEXT NOT NULL,
    "puntoExpedicion" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "numeroInicial" INTEGER,
    "numeroFinal" INTEGER,
    "tipo" "TipoTimbrado",
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_timbrados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_timbrados_numero_key"
  ON "supplier_timbrados"("supplierId", "numero", "tipoDocumento", "establecimiento", "puntoExpedicion");
CREATE INDEX "supplier_timbrados_supplierId_fechaVencimiento_idx"
  ON "supplier_timbrados"("supplierId", "fechaVencimiento");

ALTER TABLE "supplier_timbrados" ADD CONSTRAINT "supplier_timbrados_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
