export interface Company {
  id: number;
  razonSocial: string;
  nombreFantasia?: string | null;
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

export interface Article {
  id: number;
  codigo: string;
  descripcion: string;
  brandId: number | null;
  categoryId: number | null;
  unitId: number | null;
  tipo: ArticleTipo;
  ivaTipo: IvaTipo;
  controlaSerie: boolean;
  costoActual: string; // Decimal serializado como string
  precioVenta: string;
  stockMinimo: string;
  activo: boolean;
  brand?: Brand | null;
  category?: Category | null;
  unit?: Unit | null;
}
