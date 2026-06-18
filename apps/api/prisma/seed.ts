import { PrismaClient, ProgramCategoria } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadChartOfAccounts } from "./chart-data.js";

const prisma = new PrismaClient();

// Catalogo de modulos y programas (imagen 1 y 2)
const MODULES: Array<{
  codigo: string;
  nombre: string;
  icono: string;
  color: string;
  orden: number;
  programs: Array<{
    codigo: string;
    nombre: string;
    categoria: ProgramCategoria;
    ruta: string;
  }>;
}> = [
  {
    codigo: "STK",
    nombre: "Control de Stock",
    icono: "boxes",
    color: "#c0392b",
    orden: 1,
    programs: [
      { codigo: "STKM001", nombre: "Administrar articulos", categoria: "MANTENIMIENTOS", ruta: "/stock/articulos" },
      { codigo: "STKM002", nombre: "Marcas", categoria: "MANTENIMIENTOS", ruta: "/stock/marcas" },
      { codigo: "STKM003", nombre: "Categorias", categoria: "MANTENIMIENTOS", ruta: "/stock/categorias" },
      { codigo: "STKM012", nombre: "Rubros", categoria: "MANTENIMIENTOS", ruta: "/stock/rubros" },
      { codigo: "STKM004", nombre: "Depositos", categoria: "MANTENIMIENTOS", ruta: "/stock/depositos" },
      { codigo: "STKI005", nombre: "Movimiento entre depositos", categoria: "MOVIMIENTOS", ruta: "/stock/movimientos" },
      { codigo: "STKI006", nombre: "Ajuste manual de inventario", categoria: "MOVIMIENTOS", ruta: "/stock/ajustes" },
      { codigo: "STKI007", nombre: "Generador de codigos de barra", categoria: "PROCESOS", ruta: "/stock/codigos-barra" },
      { codigo: "STKI008", nombre: "Impresion de etiquetas", categoria: "PROCESOS", ruta: "/stock/etiquetas" },
      { codigo: "STKC009", nombre: "Stock por deposito", categoria: "CONSULTAS", ruta: "/stock/consulta-stock" },
      { codigo: "STKL010", nombre: "Ultimas compras por articulo", categoria: "LISTADOS", ruta: "/stock/ultimas-compras" },
      { codigo: "STKC011", nombre: "Historial de costos", categoria: "CONSULTAS", ruta: "/stock/costos" },
    ],
  },
  {
    codigo: "COM",
    nombre: "Compras",
    icono: "shopping-cart",
    color: "#c0392b",
    orden: 2,
    programs: [
      { codigo: "COMI001", nombre: "Cargar compra", categoria: "MOVIMIENTOS", ruta: "/compras/nueva" },
      { codigo: "COMI002", nombre: "Nota de credito / devolucion", categoria: "MOVIMIENTOS", ruta: "/compras/notas-credito" },
      { codigo: "COMC004", nombre: "Cuenta corriente proveedor", categoria: "CONSULTAS", ruta: "/compras/cuenta-proveedor" },
      { codigo: "COML005", nombre: "Listado de compras", categoria: "LISTADOS", ruta: "/compras/listado" },
      { codigo: "COML006", nombre: "Ultimo costo por proveedor", categoria: "LISTADOS", ruta: "/compras/ultimos-costos" },
    ],
  },
  {
    codigo: "VEN",
    nombre: "Ventas",
    icono: "receipt",
    color: "#c0392b",
    orden: 3,
    programs: [
      { codigo: "VENI001", nombre: "Nueva venta", categoria: "MOVIMIENTOS", ruta: "/ventas/nueva" },
      { codigo: "VENI003", nombre: "Presupuesto", categoria: "MOVIMIENTOS", ruta: "/ventas/presupuesto" },
      { codigo: "VENI004", nombre: "Nota de credito / devolucion", categoria: "MOVIMIENTOS", ruta: "/ventas/notas-credito" },
      { codigo: "VENC006", nombre: "Estado de cuenta cliente", categoria: "CONSULTAS", ruta: "/ventas/cuenta-cliente" },
      { codigo: "VENL007", nombre: "Listado de ventas", categoria: "LISTADOS", ruta: "/ventas/listado" },
      { codigo: "VENM008", nombre: "Timbrados", categoria: "MANTENIMIENTOS", ruta: "/ventas/timbrados" },
      { codigo: "VENM009", nombre: "Puntos de expedicion por rubro", categoria: "MANTENIMIENTOS", ruta: "/ventas/puntos-expedicion" },
      { codigo: "VENM010", nombre: "Listas de precios", categoria: "MANTENIMIENTOS", ruta: "/ventas/listas-precios" },
      { codigo: "VENM011", nombre: "Precios por articulo", categoria: "MANTENIMIENTOS", ruta: "/ventas/precios" },
    ],
  },
  {
    codigo: "FIN",
    nombre: "Finanzas",
    icono: "wallet",
    color: "#c0392b",
    orden: 4,
    programs: [
      { codigo: "FINM001", nombre: "Administrar personas", categoria: "MANTENIMIENTOS", ruta: "/finanzas/personas" },
      { codigo: "FINM002", nombre: "Clientes", categoria: "MANTENIMIENTOS", ruta: "/finanzas/clientes" },
      { codigo: "FINM003", nombre: "Proveedores", categoria: "MANTENIMIENTOS", ruta: "/finanzas/proveedores" },
      { codigo: "FINM004", nombre: "Trabajadores", categoria: "MANTENIMIENTOS", ruta: "/finanzas/trabajadores" },
      { codigo: "FINI005", nombre: "Cobro de cuotas", categoria: "MOVIMIENTOS", ruta: "/finanzas/cobros" },
      { codigo: "FINI006", nombre: "Pago a proveedores", categoria: "MOVIMIENTOS", ruta: "/finanzas/pagos" },
      { codigo: "FINI007", nombre: "Cheques pendientes", categoria: "MOVIMIENTOS", ruta: "/finanzas/cheques" },
      { codigo: "FINI008", nombre: "Caja diaria", categoria: "MOVIMIENTOS", ruta: "/finanzas/caja" },
    ],
  },
  {
    codigo: "CON",
    nombre: "Contabilidad",
    icono: "book",
    color: "#c0392b",
    orden: 5,
    programs: [
      { codigo: "CONM001", nombre: "Plan de cuentas", categoria: "MANTENIMIENTOS", ruta: "/contabilidad/plan-cuentas" },
      { codigo: "CONC002", nombre: "Libro diario", categoria: "CONSULTAS", ruta: "/contabilidad/libro-diario" },
      { codigo: "CONP003", nombre: "Procesar eventos contables", categoria: "PROCESOS", ruta: "/contabilidad/procesar" },
      { codigo: "CONC004", nombre: "Balance de sumas y saldos", categoria: "CONSULTAS", ruta: "/contabilidad/balance" },
      { codigo: "CONC005", nombre: "Libro mayor", categoria: "CONSULTAS", ruta: "/contabilidad/mayor" },
      { codigo: "CONC006", nombre: "Estado de resultados", categoria: "CONSULTAS", ruta: "/contabilidad/estado-resultados" },
      { codigo: "CONC007", nombre: "Balance general", categoria: "CONSULTAS", ruta: "/contabilidad/balance-general" },
      { codigo: "CONC008", nombre: "Libro IVA Compras", categoria: "LISTADOS", ruta: "/contabilidad/libro-compras" },
      { codigo: "CONC009", nombre: "Libro IVA Ventas", categoria: "LISTADOS", ruta: "/contabilidad/libro-ventas" },
      { codigo: "CONM010", nombre: "Configuracion de cuentas", categoria: "MANTENIMIENTOS", ruta: "/contabilidad/config" },
      { codigo: "CONM011", nombre: "Ejercicios fiscales", categoria: "MANTENIMIENTOS", ruta: "/contabilidad/ejercicios" },
    ],
  },
  {
    codigo: "ADM",
    nombre: "Administracion",
    icono: "shield",
    color: "#c0392b",
    orden: 6,
    programs: [
      { codigo: "ADMM001", nombre: "Roles y permisos", categoria: "MANTENIMIENTOS", ruta: "/admin/roles" },
      { codigo: "ADMM002", nombre: "Usuarios", categoria: "MANTENIMIENTOS", ruta: "/admin/usuarios" },
    ],
  },
];

async function main() {
  console.log("Sembrando datos iniciales...");

  // 1) Empresa demo
  const company = await prisma.company.upsert({
    where: { ruc: "80012345-6" },
    update: {},
    create: {
      ruc: "80012345-6",
      razonSocial: "ELECTRO DEMO S.A.",
      nombreFantasia: "Electro Demo",
      sifenAmbiente: "TEST",
      branches: {
        create: [{ codigo: "001", nombre: "Casa Central" }],
      },
      warehouses: {
        create: [
          { codigo: "001", nombre: "Deposito Central" },
          { codigo: "002", nombre: "Showroom" },
        ],
      },
    },
  });

  // 2) Rol admin
  const adminRole = await prisma.role.upsert({
    where: { nombre: "Administrador" },
    update: {},
    create: { nombre: "Administrador", descripcion: "Acceso total al sistema" },
  });

  // 3) Usuario admin
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@erp.local",
      nombre: "Administrador",
      passwordHash,
      isSuperadmin: true,
      roles: { create: [{ roleId: adminRole.id }] },
      userCompanies: { create: [{ companyId: company.id }] },
    },
  });

  // 4) Modulos y programas
  // La facturacion contado/credito se unifico en /ventas/nueva: removemos el
  // programa obsoleto si quedo de un seed anterior.
  await prisma.program.deleteMany({ where: { codigo: { in: ["VENI002", "VENI005", "COMI003"] } } });
  for (const m of MODULES) {
    const mod = await prisma.module.upsert({
      where: { codigo: m.codigo },
      update: { nombre: m.nombre, icono: m.icono, color: m.color, orden: m.orden },
      create: { codigo: m.codigo, nombre: m.nombre, icono: m.icono, color: m.color, orden: m.orden },
    });
    let orden = 0;
    for (const p of m.programs) {
      orden += 1;
      await prisma.program.upsert({
        where: { codigo: p.codigo },
        update: { nombre: p.nombre, categoria: p.categoria, ruta: p.ruta, orden, moduleId: mod.id },
        create: {
          codigo: p.codigo,
          nombre: p.nombre,
          categoria: p.categoria,
          ruta: p.ruta,
          orden,
          moduleId: mod.id,
        },
      });
    }
  }

  // 4b) Permisos: uno por programa (clave = codigo de programa). El admin es
  // superadmin y no necesita permisos asignados.
  const allPrograms = await prisma.program.findMany({ select: { codigo: true, nombre: true } });
  for (const p of allPrograms) {
    await prisma.permission.upsert({
      where: { clave: p.codigo },
      update: { descripcion: p.nombre },
      create: { clave: p.codigo, descripcion: p.nombre },
    });
  }

  // 5) Catalogos basicos
  const units = [
    { codigo: "UN", nombre: "Unidad" },
    { codigo: "KG", nombre: "Kilogramo" },
    { codigo: "MT", nombre: "Metro" },
  ];
  for (const u of units) {
    await prisma.unitOfMeasure.upsert({ where: { codigo: u.codigo }, update: {}, create: u });
  }

  const rubroElectro = await prisma.rubro.upsert({
    where: { nombre: "Electrodomesticos" },
    update: {},
    create: { nombre: "Electrodomesticos" },
  });
  const rubroMuebles = await prisma.rubro.upsert({
    where: { nombre: "Muebles" },
    update: {},
    create: { nombre: "Muebles" },
  });

  // Timbrado demo (compartido) + un punto de expedicion por rubro.
  const timbrado = await prisma.timbrado.upsert({
    where: { companyId_numero: { companyId: company.id, numero: "12345678" } },
    update: {},
    create: {
      companyId: company.id,
      numero: "12345678",
      establecimiento: "001",
      fechaInicio: new Date("2026-01-01"),
    },
  });
  const puntos = [
    { rubroId: rubroElectro.id, codigo: "001" },
    { rubroId: rubroMuebles.id, codigo: "002" },
  ];
  for (const p of puntos) {
    await prisma.puntoExpedicion.upsert({
      where: { companyId_rubroId: { companyId: company.id, rubroId: p.rubroId } },
      update: { timbradoId: timbrado.id, codigo: p.codigo },
      create: {
        companyId: company.id,
        timbradoId: timbrado.id,
        rubroId: p.rubroId,
        codigo: p.codigo,
        tipoDocumento: "FACTURA",
        numeroInicial: 1,
      },
    });
  }

  const methods = [
    { codigo: "EFECTIVO", nombre: "Efectivo" },
    { codigo: "CHEQUE", nombre: "Cheque" },
    { codigo: "TRANSFERENCIA", nombre: "Transferencia" },
    { codigo: "TARJETA", nombre: "Tarjeta" },
  ];
  for (const pm of methods) {
    await prisma.paymentMethod.upsert({ where: { codigo: pm.codigo }, update: {}, create: pm });
  }

  // Listas de precios: contado + planes de credito (6/10/12 cuotas).
  const priceLists: Array<{
    codigo: string;
    nombre: string;
    condicion: "CONTADO" | "CREDITO";
    cuotas: number;
    orden: number;
    esDefault: boolean;
  }> = [
    { codigo: "CONTADO", nombre: "Contado", condicion: "CONTADO", cuotas: 0, orden: 1, esDefault: true },
    { codigo: "CRED6", nombre: "Credito 6 cuotas", condicion: "CREDITO", cuotas: 6, orden: 2, esDefault: false },
    { codigo: "CRED10", nombre: "Credito 10 cuotas", condicion: "CREDITO", cuotas: 10, orden: 3, esDefault: false },
    { codigo: "CRED12", nombre: "Credito 12 cuotas", condicion: "CREDITO", cuotas: 12, orden: 4, esDefault: false },
  ];
  for (const pl of priceLists) {
    await prisma.priceList.upsert({
      where: { codigo: pl.codigo },
      update: { nombre: pl.nombre, condicion: pl.condicion, cuotas: pl.cuotas, orden: pl.orden },
      create: pl,
    });
  }

  // Plan de cuentas estandar (por empresa). Default razonable PY; editable.
  // Plan de cuentas del cliente (CNTL100) + config de cuentas operativas.
  // La logica vive en chart-data.ts y la reusa tambien prisma/load-chart.ts.
  const chartRes = await loadChartOfAccounts(prisma, company.id);
  console.log(
    `  Plan de cuentas: ${chartRes.creadas} creadas, ${chartRes.actualizadas} actualizadas, ` +
      `${chartRes.configCreadas} config`
  );

  console.log("Seed completo.");
  console.log(`  Empresa: ${company.razonSocial} (id ${company.id})`);
  console.log(`  Usuario: ${admin.username} / admin123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
