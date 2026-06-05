-- CreateEnum
CREATE TYPE "ProgramCategoria" AS ENUM ('MANTENIMIENTOS', 'MOVIMIENTOS', 'CONSULTAS', 'LISTADOS', 'PROCESOS');

-- CreateEnum
CREATE TYPE "SifenAmbiente" AS ENUM ('TEST', 'PROD');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CI', 'RUC', 'PASAPORTE', 'OTRO');

-- CreateEnum
CREATE TYPE "ArticleTipo" AS ENUM ('PRODUCTO', 'SERVICIO');

-- CreateEnum
CREATE TYPE "IvaTipo" AS ENUM ('IVA10', 'IVA5', 'EXENTA');

-- CreateEnum
CREATE TYPE "StockMovTipo" AS ENUM ('INGRESO', 'EGRESO', 'TRANSFERENCIA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "SerialEstado" AS ENUM ('EN_STOCK', 'VENDIDO', 'DEVUELTO', 'BAJA');

-- CreateEnum
CREATE TYPE "CondicionPago" AS ENUM ('CONTADO', 'CREDITO');

-- CreateEnum
CREATE TYPE "DocEstado" AS ENUM ('BORRADOR', 'CONFIRMADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "PagareEstado" AS ENUM ('VIGENTE', 'CANCELADO', 'PROTESTADO');

-- CreateEnum
CREATE TYPE "CuotaEstado" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "TipoDocElectronico" AS ENUM ('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'REMISION');

-- CreateEnum
CREATE TYPE "SifenEstado" AS ENUM ('PENDIENTE', 'ENVIADO', 'APROBADO', 'RECHAZADO', 'CANCELADO', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "CashMovTipo" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "CheckTipo" AS ENUM ('RECIBIDO', 'EMITIDO');

-- CreateEnum
CREATE TYPE "CheckEstado" AS ENUM ('PENDIENTE', 'DEPOSITADO', 'COBRADO', 'RECHAZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "CuentaTipo" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'EGRESO', 'ORDEN');

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "ruc" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreFantasia" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "sifenAmbiente" "SifenAmbiente" NOT NULL DEFAULT 'TEST',
    "timbradoNro" TEXT,
    "timbradoInicio" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "isSuperadmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_companies" (
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "user_companies_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "icono" TEXT,
    "color" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" SERIAL NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "ProgramCategoria" NOT NULL DEFAULT 'MANTENIMIENTOS',
    "ruta" TEXT,
    "icono" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" SERIAL NOT NULL,
    "tipoDoc" "TipoDocumento" NOT NULL DEFAULT 'CI',
    "nroDoc" TEXT NOT NULL,
    "ruc" TEXT,
    "razonSocial" TEXT NOT NULL,
    "nombreFantasia" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "fechaNac" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "limiteCredito" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "diasCredito" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "cargo" TEXT,
    "fechaIngreso" TIMESTAMP(3),
    "salario" DECIMAL(18,4),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "parentId" INTEGER,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "brandId" INTEGER,
    "categoryId" INTEGER,
    "unitId" INTEGER,
    "tipo" "ArticleTipo" NOT NULL DEFAULT 'PRODUCTO',
    "ivaTipo" "IvaTipo" NOT NULL DEFAULT 'IVA10',
    "controlaSerie" BOOLEAN NOT NULL DEFAULT false,
    "costoActual" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "precioVenta" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "stockMinimo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_barcodes" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "article_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_by_warehouse" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_by_warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "warehouseDestId" INTEGER,
    "tipo" "StockMovTipo" NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "costoUnitario" DECIMAL(18,4),
    "origenTipo" TEXT,
    "origenId" INTEGER,
    "observacion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_cost_history" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "costo" DECIMAL(18,4) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "origenTipo" TEXT,
    "origenId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_serials" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "serie" TEXT NOT NULL,
    "warehouseId" INTEGER,
    "estado" "SerialEstado" NOT NULL DEFAULT 'EN_STOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "timbrado" TEXT,
    "nroComprobante" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "condicion" "CondicionPago" NOT NULL DEFAULT 'CONTADO',
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "tipoCambio" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "subtotalExenta" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal5" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal10" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva5" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva10" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" "DocEstado" NOT NULL DEFAULT 'CONFIRMADO',
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_items" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "costoUnitario" DECIMAL(18,4) NOT NULL,
    "ivaTipo" "IvaTipo" NOT NULL DEFAULT 'IVA10',
    "total" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_credit_notes" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "nroComprobante" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "total" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "total" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "establecimiento" TEXT NOT NULL DEFAULT '001',
    "puntoExpedicion" TEXT NOT NULL DEFAULT '001',
    "numero" TEXT NOT NULL,
    "timbrado" TEXT,
    "tipoDocumento" "TipoDocElectronico" NOT NULL DEFAULT 'FACTURA',
    "cdc" TEXT,
    "estadoSifen" "SifenEstado" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMP(3) NOT NULL,
    "condicion" "CondicionPago" NOT NULL DEFAULT 'CONTADO',
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "tipoCambio" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "subtotalExenta" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal5" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal10" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva5" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iva10" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" "DocEstado" NOT NULL DEFAULT 'CONFIRMADO',
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_items" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "precioUnitario" DECIMAL(18,4) NOT NULL,
    "descuento" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ivaTipo" "IvaTipo" NOT NULL DEFAULT 'IVA10',
    "total" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "sales_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_credit_notes" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "numero" TEXT NOT NULL,
    "cdc" TEXT,
    "estadoSifen" "SifenEstado" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "total" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "total" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promissory_notes" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "montoTotal" DECIMAL(18,4) NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "estado" "PagareEstado" NOT NULL DEFAULT 'VIGENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promissory_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "nroCuota" INTEGER NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "montoCuota" DECIMAL(18,4) NOT NULL,
    "montoPagado" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" "CuotaEstado" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "cashRegisterId" INTEGER NOT NULL,
    "tipo" "CashMovTipo" NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PYG',
    "concepto" TEXT,
    "origenTipo" TEXT,
    "origenId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments_received" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montoTotal" DECIMAL(18,4) NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "observacion" TEXT,
    "usuarioId" INTEGER,

    CONSTRAINT "payments_received_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_payments" (
    "id" SERIAL NOT NULL,
    "installmentId" INTEGER NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "installment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments_made" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montoTotal" DECIMAL(18,4) NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "observacion" TEXT,
    "usuarioId" INTEGER,

    CONSTRAINT "payments_made_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" "CheckTipo" NOT NULL,
    "banco" TEXT,
    "numero" TEXT NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "fechaCobro" TIMESTAMP(3) NOT NULL,
    "estado" "CheckEstado" NOT NULL DEFAULT 'PENDIENTE',
    "paymentReceivedId" INTEGER,
    "paymentMadeId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_account_entries" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concepto" TEXT NOT NULL,
    "debe" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "haber" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "origenTipo" TEXT,
    "origenId" INTEGER,

    CONSTRAINT "customer_account_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_account_entries" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concepto" TEXT NOT NULL,
    "debe" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "haber" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "origenTipo" TEXT,
    "origenId" INTEGER,

    CONSTRAINT "supplier_account_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "CuentaTipo" NOT NULL,
    "imputable" BOOLEAN NOT NULL DEFAULT true,
    "parentId" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "cerrado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_entries" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "periodId" INTEGER,
    "numero" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL,
    "glosa" TEXT NOT NULL,
    "origenTipo" TEXT,
    "origenId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_entry_lines" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "debe" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "haber" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "detalle" TEXT,

    CONSTRAINT "accounting_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_events" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "origenTipo" TEXT NOT NULL,
    "origenId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "procesado" BOOLEAN NOT NULL DEFAULT false,
    "entryId" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "accounting_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_ruc_key" ON "companies"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_codigo_key" ON "branches"("companyId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_clave_key" ON "permissions"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "modules_codigo_key" ON "modules"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "programs_codigo_key" ON "programs"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "persons_tipoDoc_nroDoc_key" ON "persons"("tipoDoc", "nroDoc");

-- CreateIndex
CREATE UNIQUE INDEX "customers_personId_key" ON "customers"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_personId_key" ON "suppliers"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_personId_key" ON "employees"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_nombre_key" ON "brands"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "categories_nombre_key" ON "categories"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_codigo_key" ON "units_of_measure"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "articles_codigo_key" ON "articles"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "article_barcodes_codigo_key" ON "article_barcodes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_companyId_codigo_key" ON "warehouses"("companyId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "stock_by_warehouse_articleId_warehouseId_key" ON "stock_by_warehouse"("articleId", "warehouseId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_articleId_idx" ON "stock_movements"("companyId", "articleId");

-- CreateIndex
CREATE INDEX "article_cost_history_articleId_fecha_idx" ON "article_cost_history"("articleId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "article_serials_articleId_serie_key" ON "article_serials"("articleId", "serie");

-- CreateIndex
CREATE INDEX "purchase_invoices_companyId_supplierId_idx" ON "purchase_invoices"("companyId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_cdc_key" ON "sales_invoices"("cdc");

-- CreateIndex
CREATE INDEX "sales_invoices_companyId_customerId_idx" ON "sales_invoices"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_companyId_establecimiento_puntoExpedicion_nu_key" ON "sales_invoices"("companyId", "establecimiento", "puntoExpedicion", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "sales_credit_notes_cdc_key" ON "sales_credit_notes"("cdc");

-- CreateIndex
CREATE INDEX "installments_companyId_estado_idx" ON "installments"("companyId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_companyId_codigo_key" ON "cash_registers"("companyId", "codigo");

-- CreateIndex
CREATE INDEX "cash_movements_companyId_cashRegisterId_idx" ON "cash_movements"("companyId", "cashRegisterId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_codigo_key" ON "payment_methods"("codigo");

-- CreateIndex
CREATE INDEX "payments_received_companyId_customerId_idx" ON "payments_received"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "payments_made_companyId_supplierId_idx" ON "payments_made"("companyId", "supplierId");

-- CreateIndex
CREATE INDEX "checks_companyId_estado_idx" ON "checks"("companyId", "estado");

-- CreateIndex
CREATE INDEX "customer_account_entries_companyId_customerId_idx" ON "customer_account_entries"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "supplier_account_entries_companyId_supplierId_idx" ON "supplier_account_entries"("companyId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_companyId_codigo_key" ON "chart_of_accounts"("companyId", "codigo");

-- CreateIndex
CREATE INDEX "accounting_entries_companyId_fecha_idx" ON "accounting_entries"("companyId", "fecha");

-- CreateIndex
CREATE INDEX "accounting_events_companyId_procesado_idx" ON "accounting_events"("companyId", "procesado");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units_of_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_barcodes" ADD CONSTRAINT "article_barcodes_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_by_warehouse" ADD CONSTRAINT "stock_by_warehouse_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_by_warehouse" ADD CONSTRAINT "stock_by_warehouse_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_cost_history" ADD CONSTRAINT "article_cost_history_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_serials" ADD CONSTRAINT "article_serials_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_serials" ADD CONSTRAINT "article_serials_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_notes" ADD CONSTRAINT "purchase_credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_items" ADD CONSTRAINT "sales_invoice_items_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_credit_notes" ADD CONSTRAINT "sales_credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promissory_notes" ADD CONSTRAINT "promissory_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments_received"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_paymentReceivedId_fkey" FOREIGN KEY ("paymentReceivedId") REFERENCES "payments_received"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_paymentMadeId_fkey" FOREIGN KEY ("paymentMadeId") REFERENCES "payments_made"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "fiscal_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entry_lines" ADD CONSTRAINT "accounting_entry_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "accounting_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_entry_lines" ADD CONSTRAINT "accounting_entry_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
