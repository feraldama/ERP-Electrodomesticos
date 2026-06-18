export interface Company {
  id: number;
  razonSocial: string;
  nombreFantasia?: string | null;
}

// Respuesta uniforme de los listados paginados del backend (ver lib/listQuery del API).
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardStats {
  articulos: number;
  unidadesStock: number;
  valorStock: number;
  comprasCount: number;
  comprasTotal: number;
  clientes: number;
  proveedores: number;
}

export interface AuthUser {
  id: number;
  username: string;
  nombre: string;
  isSuperadmin: boolean;
  roles: string[];
  permisos: string[]; // codigos de programa permitidos (vacio si superadmin: ve todo)
  companies: Company[];
}

export type ProgramCategoria =
  | "MANTENIMIENTOS"
  | "MOVIMIENTOS"
  | "CONSULTAS"
  | "LISTADOS"
  | "PROCESOS";

export interface Program {
  id: number;
  moduleId: number;
  codigo: string;
  nombre: string;
  categoria: ProgramCategoria;
  ruta: string | null;
  orden: number;
}

export interface Module {
  id: number;
  codigo: string;
  nombre: string;
  icono: string | null;
  color: string | null;
  orden: number;
  programs: Program[];
}

// --- Stock ---
export type IvaTipo = "IVA10" | "IVA5" | "EXENTA";
export type ArticleTipo = "PRODUCTO" | "SERVICIO";

export interface ArticleBarcode {
  id: number;
  articleId: number;
  codigo: string;
  esPrincipal: boolean;
}

export type SerialEstado = "EN_STOCK" | "VENDIDO" | "DEVUELTO" | "BAJA";

export interface ArticleSerial {
  id: number;
  articleId: number;
  serie: string;
  warehouseId: number | null;
  estado: SerialEstado;
  warehouse?: { id: number; codigo: string; nombre: string } | null;
}

export interface Brand {
  id: number;
  nombre: string;
  activo?: boolean;
}

export interface Category {
  id: number;
  nombre: string;
  parentId: number | null;
}

export interface Rubro {
  id: number;
  nombre: string;
  activo?: boolean;
}

export type TipoDocElectronico = "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO" | "REMISION";

// Timbrado compartido por empresa
export interface Timbrado {
  id: number;
  companyId: number;
  numero: string;
  establecimiento: string;
  fechaInicio: string;
  fechaFin: string | null;
  activo: boolean;
  _count?: { puntos: number };
}

// Punto de expedicion por rubro (bajo un timbrado)
export interface PuntoExpedicion {
  id: number;
  companyId: number;
  timbradoId: number;
  rubroId: number;
  codigo: string;
  tipoDocumento: TipoDocElectronico;
  numeroInicial: number;
  numeroFinal: number | null;
  numeroActual: number;
  activo: boolean;
  rubro?: { id: number; nombre: string };
  timbrado?: { id: number; numero: string; establecimiento: string; activo: boolean };
}

export interface Warehouse {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface StockRow {
  id: number;
  cantidad: string;
  article: { id: number; codigo: string; descripcion: string; stockMinimo: string };
  warehouse: { id: number; codigo: string; nombre: string };
}

// --- Consultas de compras/costos ---
export interface PurchaseHistoryRow {
  fecha: string;
  nroComprobante: string;
  proveedorId: number;
  proveedor: string;
  cantidad: string;
  costoUnitario: string;
}

export interface PurchaseHistory {
  article: { id: number; codigo: string; descripcion: string; costoActual: string };
  resumen: { compras: number; ultimoCosto: number; costoPromedio: number; costoMin: number; costoMax: number };
  compras: PurchaseHistoryRow[];
  porProveedor: Array<{ proveedor: string; ultimoCosto: number; fecha: string; compras: number }>;
}

export interface CostHistory {
  article: { id: number; codigo: string; descripcion: string; costoActual: string };
  historial: Array<{
    id: number;
    costo: string;
    moneda: string;
    origenTipo: string | null;
    proveedor: string | null;
    nroComprobante: string | null;
    cantidad: string | null;
    fecha: string;
  }>;
}

export interface LastCostRow {
  articleId: number;
  codigo: string;
  descripcion: string;
  fecha: string;
  nroComprobante: string;
  costoUnitario: string;
}

// --- Personas ---
export type TipoDoc = "CI" | "RUC" | "PASAPORTE" | "OTRO";

export interface Person {
  id: number;
  tipoDoc: TipoDoc;
  nroDoc: string;
  ruc: string | null;
  razonSocial: string;
  nombreFantasia: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  esCliente: boolean;
  esProveedor: boolean;
  esEmpleado: boolean;
  customer?: { limiteCredito: string; diasCredito: number; activo: boolean } | null;
  employee?: { cargo: string | null; salario: string | null; activo: boolean } | null;
}

export type PersonRole = "customer" | "supplier" | "employee" | null;

// --- Compras ---
export interface Supplier {
  id: number;
  activo: boolean;
  person: Person;
}

export interface PurchaseItem {
  id: number;
  cantidad: string;
  costoUnitario: string;
  ivaTipo: IvaTipo;
  total: string;
  article?: { codigo: string; descripcion: string };
}

export interface PurchaseInvoice {
  id: number;
  nroComprobante: string;
  fecha: string;
  condicion: "CONTADO" | "CREDITO";
  moneda: string;
  subtotalExenta: string;
  subtotal5: string;
  subtotal10: string;
  iva5: string;
  iva10: string;
  total: string;
  estado: string;
  observacion: string | null;
  supplier?: { person: { razonSocial: string } };
  items?: PurchaseItem[];
}

export interface Unit {
  id: number;
  codigo: string;
  nombre: string;
}

// --- Ventas: listas de precios ---
export type CondicionPago = "CONTADO" | "CREDITO";

export interface PriceList {
  id: number;
  codigo: string;
  nombre: string;
  condicion: CondicionPago;
  cuotas: number;
  orden: number;
  esDefault: boolean;
  activo: boolean;
  _count?: { prices: number };
}

// Fila de la grilla de precios por articulo y lista
export interface ArticlePriceRow {
  id: number;
  codigo: string;
  descripcion: string;
  ivaTipo: IvaTipo;
  precioVenta: string;
  rubro: { id: number; nombre: string } | null;
  precio: string | null; // precio en la lista seleccionada (null si no cargado)
}

// Precio de un articulo en una lista puntual (vista inversa: por articulo)
export interface ArticlePriceByList {
  priceListId: number;
  codigo: string;
  nombre: string;
  condicion: CondicionPago;
  cuotas: number;
  esDefault: boolean;
  precio: string | null;
}

export interface ArticlePricesByArticle {
  article: {
    id: number;
    codigo: string;
    descripcion: string;
    ivaTipo: IvaTipo;
    rubro: { id: number; nombre: string } | null;
  };
  lists: ArticlePriceByList[];
}

export interface Customer {
  id: number;
  activo: boolean;
  limiteCredito: string;
  diasCredito: number;
  person: Person;
}

export interface Installment {
  id: number;
  nroCuota: number;
  fechaVencimiento: string;
  montoCuota: string;
  montoPagado: string;
  estado: string;
}

// Cuota pendiente de cobro (incluye el comprobante de la venta)
export interface PendingInstallment {
  id: number;
  nroCuota: number;
  fechaVencimiento: string;
  montoCuota: string;
  montoPagado: string;
  estado: string;
  invoice: { id: number; establecimiento: string; puntoExpedicion: string; numero: string };
}

// Estado de cuenta del cliente (cuenta corriente)
export interface AccountMovement {
  id: number;
  fecha: string;
  concepto: string;
  origenTipo: string | null;
  origenId: number | null;
  debe: string;
  haber: string;
  saldo: number; // saldo corriente acumulado
}

export interface CustomerAccount {
  customer: {
    id: number;
    razonSocial: string;
    documento: string | null;
    limiteCredito: string;
    diasCredito: number;
  };
  resumen: {
    totalDebe: number;
    totalHaber: number;
    saldo: number;
    cuotasPendientes: number;
    montoPendiente: number;
  };
  movimientos: AccountMovement[];
  cuotas: PendingInstallment[];
}

// Nota de credito de venta: info acreditable de una factura
export interface CreditableItem {
  articleId: number;
  codigo: string;
  descripcion: string;
  controlaSerie: boolean;
  ivaTipo: IvaTipo;
  precioUnitario: string;
  vendido: number;
  acreditado: number;
  restante: number;
}

export interface CreditableInvoice {
  invoice: {
    id: number;
    nroComprobante: string;
    fecha: string;
    condicion: CondicionPago;
    total: string;
    cliente: string;
  };
  items: CreditableItem[];
  creditadoTotal: number;
  creditableRestante: number;
}

// Nota de credito de compra: info acreditable de una compra
export interface CreditablePurchaseItem {
  articleId: number;
  codigo: string;
  descripcion: string;
  ivaTipo: IvaTipo;
  costoUnitario: string;
  comprado: number;
  acreditado: number;
  restante: number;
}

export interface CreditablePurchase {
  invoice: {
    id: number;
    nroComprobante: string;
    fecha: string;
    condicion: CondicionPago;
    total: string;
    proveedor: string;
  };
  items: CreditablePurchaseItem[];
  creditadoTotal: number;
  creditableRestante: number;
}

// --- Contabilidad ---
export type CuentaTipo = "ACTIVO" | "PASIVO" | "PATRIMONIO" | "INGRESO" | "EGRESO" | "ORDEN";

export interface ChartAccount {
  id: number;
  codigo: string;
  nombre: string;
  tipo: CuentaTipo;
  imputable: boolean;
  parentId: number | null;
  activo: boolean;
}

export interface AccountingLine {
  id: number;
  debe: string;
  haber: string;
  detalle: string | null;
  account: { codigo: string; nombre: string };
}

export interface AccountingEntry {
  id: number;
  numero: number | null;
  fecha: string;
  glosa: string;
  origenTipo: string | null;
  lines: AccountingLine[];
}

export interface PendingSummary {
  total: number;
  conError: number;
  porTipo: Array<{ tipo: string; cantidad: number }>;
}

export interface TrialBalanceRow {
  accountId: number;
  codigo: string;
  nombre: string;
  tipo: CuentaTipo | null;
  debe: number;
  haber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
}

export interface TrialBalance {
  filas: TrialBalanceRow[];
  totales: { debe: number; haber: number; deudor: number; acreedor: number };
}

export interface LedgerMovement {
  id: number;
  fecha: string;
  numero: number | null;
  glosa: string;
  debe: string;
  haber: string;
  saldo: number;
}

export interface Ledger {
  cuenta: { id: number; codigo: string; nombre: string; tipo: CuentaTipo };
  movimientos: LedgerMovement[];
}

export interface StatementRow {
  codigo: string;
  nombre: string;
  monto: number;
}

export interface IncomeStatement {
  ingresos: StatementRow[];
  egresos: StatementRow[];
  totalIngresos: number;
  totalEgresos: number;
  resultado: number;
}

export interface BalanceSheet {
  activo: StatementRow[];
  pasivo: StatementRow[];
  patrimonio: StatementRow[];
  resultado: number;
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
  totalPasivoPatrimonio: number;
}

// Ejercicio / periodo fiscal (CONM011)
export interface FiscalPeriod {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  cerrado: boolean;
  asientos: number;
}

// Configuracion de cuentas operativas (CONM010)
export interface AccountingConfigRow {
  clave: string;
  accountId: number | null;
  codigo: string | null;
  nombre: string | null;
}

// Libro IVA Compras / Ventas (CONC008 / CONC009)
export interface LibroIvaRow {
  fecha: string;
  tipoDoc: "FACTURA" | "NOTA_CREDITO";
  comprobante: string;
  timbrado: string;
  condicion: "CONTADO" | "CREDITO" | null;
  ruc: string;
  razonSocial: string;
  gravada10: number;
  gravada5: number;
  exenta: number;
  iva10: number;
  iva5: number;
  total: number;
}

export interface LibroIva {
  filas: LibroIvaRow[];
  totales: { gravada10: number; gravada5: number; exenta: number; iva10: number; iva5: number; total: number };
}

// Estado de cuenta del proveedor (saldo a pagar = haber - debe)
export interface SupplierAccount {
  supplier: { id: number; razonSocial: string; documento: string | null };
  resumen: { totalDebe: number; totalHaber: number; saldo: number };
  movimientos: AccountMovement[];
  compras: Array<{ id: number; nroComprobante: string; fecha: string; total: string }>;
}

export type MedioPago = "EFECTIVO" | "TARJETA_DEBITO" | "TARJETA_CREDITO" | "TRANSFERENCIA";

export const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta debito",
  TARJETA_CREDITO: "Tarjeta credito",
  TRANSFERENCIA: "Transferencia",
};

export type ChequeEstado = "PENDIENTE" | "COBRADO" | "ANULADO" | "RECHAZADO";

// Cheque emitido a proveedor (FINI007)
export interface Cheque {
  id: number;
  tipo: "RECIBIDO" | "EMITIDO";
  banco: string | null;
  numero: string;
  monto: string;
  fechaEmision: string;
  fechaCobro: string;
  estado: ChequeEstado;
  proveedorNombre: string | null;
}

export interface SalesPayment {
  id: number;
  medio: MedioPago;
  monto: string;
}

export interface SalesInvoice {
  id: number;
  establecimiento: string;
  puntoExpedicion: string;
  numero: string;
  timbrado: string | null;
  fecha: string;
  condicion: CondicionPago;
  subtotalExenta: string;
  subtotal5: string;
  subtotal10: string;
  iva5: string;
  iva10: string;
  total: string;
  entregaInicial?: string;
  estado: string;
  observacion: string | null;
  nroComprobante?: string;
  customer?: { person: { razonSocial: string } };
  priceList?: { nombre: string } | null;
  items?: Array<{
    id: number;
    cantidad: string;
    precioUnitario: string;
    ivaTipo: IvaTipo;
    total: string;
    article?: { codigo: string; descripcion: string };
  }>;
  payments?: SalesPayment[];
  installments?: Installment[];
}

// Presupuesto / cotizacion de venta
export interface SalesQuote {
  id: number;
  numero: string;
  fecha: string;
  validezDias: number;
  subtotalExenta: string;
  subtotal5: string;
  subtotal10: string;
  iva5: string;
  iva10: string;
  total: string;
  estado: string;
  observacion: string | null;
  customer?: { person: { razonSocial: string } };
  priceList?: { nombre: string } | null;
  items?: Array<{
    id: number;
    cantidad: string;
    precioUnitario: string;
    ivaTipo: IvaTipo;
    total: string;
    article?: { codigo: string; descripcion: string };
  }>;
}

export interface Article {
  id: number;
  codigo: string;
  descripcion: string;
  brandId: number | null;
  categoryId: number | null;
  unitId: number | null;
  rubroId: number | null;
  tipo: ArticleTipo;
  ivaTipo: IvaTipo;
  controlaSerie: boolean;
  costoActual: string; // Decimal serializado como string
  precioVenta: string;
  stockMinimo: string;
  imagenUrl: string | null;
  activo: boolean;
  brand?: Brand | null;
  category?: Category | null;
  unit?: Unit | null;
  rubro?: Rubro | null;
}
