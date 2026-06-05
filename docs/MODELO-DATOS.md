# Modelo de datos

Definicion completa en [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).
Resumen por modulo.

## Nucleo

| Modelo | Para que |
|--------|----------|
| `Company` | Empresa (RUC, razon social, datos SIFEN, timbrado) |
| `Branch` | Sucursal / establecimiento (codigo SIFEN, ej "001") |
| `User`, `UserCompany` | Usuarios y a que empresas acceden |
| `Role`, `Permission`, `UserRole`, `RolePermission` | Roles y permisos |
| `Module`, `Program` | Catalogo de modulos y programas (dashboard) |

## Personas (tabla central + roles)

`Person` es la entidad central. Un mismo registro puede ser a la vez:

- `Customer` (cliente: limite y dias de credito)
- `Supplier` (proveedor)
- `Employee` (trabajador: cargo, salario)

Asi evitamos duplicar datos cuando alguien es, p.ej., cliente y proveedor.

## Modulo 1 — Control de Stock

| Modelo | Para que |
|--------|----------|
| `Article` | Articulo (codigo, costo, precio, tipo IVA, controla serie) |
| `Brand`, `Category`, `UnitOfMeasure` | Catalogos |
| `ArticleBarcode` | Codigos de barra (uno principal + alternativos) |
| `Warehouse` | Deposito (por empresa) |
| `StockByWarehouse` | Existencia por articulo/deposito |
| `StockMovement` | Ingresos, egresos, transferencias, ajustes |
| `ArticleCostHistory` | Historial de costos (ultimas compras) |
| `ArticleSerial` | Numero de serie / IMEI por unidad (electronicos) |

## Modulo 2 — Compras

| Modelo | Para que |
|--------|----------|
| `PurchaseInvoice`, `PurchaseInvoiceItem` | Compra y su detalle (con IVA 5/10/exenta) |
| `PurchaseCreditNote` | Nota de credito recibida |
| `PurchaseReturn` | Devolucion de compra |
| `SupplierAccountEntry` | Cuenta corriente del proveedor (debe/haber) |

La compra confirmada deberia: subir stock, actualizar costo, generar cuenta a pagar y
encolar evento contable.

## Modulo 3 — Ventas (SIFEN)

| Modelo | Para que |
|--------|----------|
| `SalesInvoice`, `SalesInvoiceItem` | Factura y detalle. Numeracion `establecimiento-puntoExpedicion-numero`, `cdc`, `estadoSifen`, `condicion` (contado/credito) |
| `SalesCreditNote`, `SalesReturn` | Nota de credito / devolucion |
| `PromissoryNote` | Pagare (ventas a credito) |
| `Installment`, `InstallmentPayment` | Cuotas y su cobro |
| `CustomerAccountEntry` | Cuenta corriente del cliente |

Campos SIFEN listos para integrar facturacion electronica: timbrado, CDC (44 digitos),
estado (PENDIENTE/ENVIADO/APROBADO/RECHAZADO), tipo de documento electronico.

## Modulo 4 — Finanzas

| Modelo | Para que |
|--------|----------|
| `CashRegister`, `CashMovement` | Caja diaria (ingresos/egresos) |
| `PaymentMethod` | Formas de pago |
| `PaymentReceived` | Cobro de cliente (se aplica a cuotas via `InstallmentPayment`) |
| `PaymentMade` | Pago a proveedor |
| `Check` | Cheques recibidos/emitidos, con estado (pendiente/cobrado/rechazado) |

## Modulo 5 — Contabilidad (background)

| Modelo | Para que |
|--------|----------|
| `ChartOfAccount` | Plan de cuentas (arbol, por empresa) |
| `FiscalPeriod` | Periodos / ejercicios |
| `AccountingEntry`, `AccountingEntryLine` | Asientos y lineas debe/haber |
| `AccountingEvent` | Cola de eventos que generan asientos automaticos |

### Ejemplo de asiento (venta contado)

```
Debito : Caja
Credito: Ventas
Credito: IVA debito fiscal
Debito : Costo de mercaderia vendida
Credito: Inventario
```

## Enums clave

- `IvaTipo`: IVA10 | IVA5 | EXENTA
- `CondicionPago`: CONTADO | CREDITO
- `SifenEstado`: PENDIENTE | ENVIADO | APROBADO | RECHAZADO | CANCELADO | NO_APLICA
- `CuotaEstado`: PENDIENTE | PARCIAL | PAGADA | VENCIDA
- `CheckEstado`: PENDIENTE | DEPOSITADO | COBRADO | RECHAZADO | ANULADO
