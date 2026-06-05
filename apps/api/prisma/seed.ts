import { PrismaClient, ProgramCategoria } from "@prisma/client";
import bcrypt from "bcryptjs";

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
      { codigo: "COMI002", nombre: "Nota de credito recibida", categoria: "MOVIMIENTOS", ruta: "/compras/notas-credito" },
      { codigo: "COMI003", nombre: "Devolucion de compra", categoria: "MOVIMIENTOS", ruta: "/compras/devoluciones" },
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
      { codigo: "VENI001", nombre: "Facturacion contado", categoria: "MOVIMIENTOS", ruta: "/ventas/contado" },
      { codigo: "VENI002", nombre: "Facturacion credito", categoria: "MOVIMIENTOS", ruta: "/ventas/credito" },
      { codigo: "VENI003", nombre: "Presupuesto", categoria: "MOVIMIENTOS", ruta: "/ventas/presupuesto" },
      { codigo: "VENI004", nombre: "Nota de credito emitida", categoria: "MOVIMIENTOS", ruta: "/ventas/notas-credito" },
      { codigo: "VENI005", nombre: "Devolucion de venta", categoria: "MOVIMIENTOS", ruta: "/ventas/devoluciones" },
      { codigo: "VENC006", nombre: "Estado de cuenta cliente", categoria: "CONSULTAS", ruta: "/ventas/cuenta-cliente" },
      { codigo: "VENL007", nombre: "Listado de ventas", categoria: "LISTADOS", ruta: "/ventas/listado" },
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

  // 5) Catalogos basicos
  const units = [
    { codigo: "UN", nombre: "Unidad" },
    { codigo: "KG", nombre: "Kilogramo" },
    { codigo: "MT", nombre: "Metro" },
  ];
  for (const u of units) {
    await prisma.unitOfMeasure.upsert({ where: { codigo: u.codigo }, update: {}, create: u });
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
