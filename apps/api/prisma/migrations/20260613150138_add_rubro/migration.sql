-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "rubroId" INTEGER;

-- CreateTable
CREATE TABLE "rubros" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rubros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubros_nombre_key" ON "rubros"("nombre");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_rubroId_fkey" FOREIGN KEY ("rubroId") REFERENCES "rubros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
