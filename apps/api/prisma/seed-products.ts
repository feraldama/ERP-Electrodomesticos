import { PrismaClient, IvaTipo } from "@prisma/client";

const prisma = new PrismaClient();

// Seed idempotente de productos variados para pruebas generales.
// Cada producto se crea con: articulo, codigo de barra principal, stock en
// Deposito Central + Showroom, precios en las 4 listas, historial de costo y
// un movimiento de AJUSTE de ingreso inicial. Se puede correr varias veces:
// upsert por codigo de articulo; el stock/movimiento/costo inicial solo se
// cargan la primera vez (cuando el articulo aun no existia).

type Prod = {
  codigo: string;
  descripcion: string;
  marca: string;
  categoria: string;
  rubro: "Electrodomesticos" | "Muebles";
  iva?: IvaTipo; // default IVA10
  controlaSerie?: boolean;
  costo: number; // costo actual (PYG)
  precio: number; // precio de venta contado (IVA incluido, PYG)
  central: number; // stock en Deposito Central
  showroom: number; // stock en Showroom
  minimo?: number; // stock minimo
};

const PRODUCTS: Prod[] = [
  // --- Electrodomesticos ---
  { codigo: "HEL-WPL-375", descripcion: "Heladera No Frost 375L", marca: "Whirlpool", categoria: "Heladeras", rubro: "Electrodomesticos", costo: 2800000, precio: 3990000, central: 8, showroom: 2, minimo: 3 },
  { codigo: "HEL-ELX-260", descripcion: "Heladera Frost Free 260L", marca: "Electrolux", categoria: "Heladeras", rubro: "Electrodomesticos", costo: 2100000, precio: 2990000, central: 6, showroom: 1, minimo: 2 },
  { codigo: "LAV-SAM-12", descripcion: "Lavarropas Automatico 12kg", marca: "Samsung Electronics", categoria: "Lavarropas", rubro: "Electrodomesticos", costo: 2600000, precio: 3690000, central: 5, showroom: 2, minimo: 2 },
  { codigo: "LAV-LG-9", descripcion: "Lavarropas Carga Frontal 9kg", marca: "LG", categoria: "Lavarropas", rubro: "Electrodomesticos", costo: 2200000, precio: 3190000, central: 7, showroom: 1, minimo: 2 },
  { codigo: "COC-MAB-4H", descripcion: "Cocina 4 hornallas Inox", marca: "Mabe", categoria: "Cocinas", rubro: "Electrodomesticos", costo: 1400000, precio: 1990000, central: 10, showroom: 2, minimo: 3 },
  { codigo: "COC-TOK-6H", descripcion: "Cocina 6 hornallas con grill", marca: "Tokyo", categoria: "Cocinas", rubro: "Electrodomesticos", costo: 1900000, precio: 2690000, central: 4, showroom: 1, minimo: 2 },
  { codigo: "AIR-LG-12", descripcion: "Aire Split 12000 BTU Inverter", marca: "LG", categoria: "Aires Acondicionados", rubro: "Electrodomesticos", costo: 2400000, precio: 3390000, central: 12, showroom: 2, minimo: 4 },
  { codigo: "AIR-SAM-18", descripcion: "Aire Split 18000 BTU Inverter", marca: "Samsung Electronics", categoria: "Aires Acondicionados", rubro: "Electrodomesticos", costo: 3200000, precio: 4490000, central: 6, showroom: 1, minimo: 2 },
  { codigo: "MIC-PHI-25", descripcion: "Microondas 25L Digital", marca: "Philips", categoria: "Microondas", rubro: "Electrodomesticos", costo: 650000, precio: 950000, central: 15, showroom: 3, minimo: 5 },
  { codigo: "MIC-SAM-30", descripcion: "Microondas 30L Grill", marca: "Samsung Electronics", categoria: "Microondas", rubro: "Electrodomesticos", costo: 850000, precio: 1250000, central: 9, showroom: 2, minimo: 3 },
  { codigo: "TV-LG-50U", descripcion: "Smart TV 50 UHD 4K", marca: "LG", categoria: "Televisores", rubro: "Electrodomesticos", costo: 1900000, precio: 2790000, central: 8, showroom: 3, minimo: 3 },
  { codigo: "TV-SAM-43", descripcion: "Smart TV 43 FHD", marca: "Samsung Electronics", categoria: "Televisores", rubro: "Electrodomesticos", costo: 1300000, precio: 1890000, central: 11, showroom: 4, minimo: 4 },
  { codigo: "AUD-SON-BT", descripcion: "Parlante Bluetooth 40W", marca: "Sony", categoria: "Audio", rubro: "Electrodomesticos", costo: 320000, precio: 490000, central: 20, showroom: 5, minimo: 6 },
  { codigo: "AUD-LG-SB", descripcion: "Barra de sonido 2.1", marca: "LG", categoria: "Audio", rubro: "Electrodomesticos", costo: 780000, precio: 1150000, central: 7, showroom: 2, minimo: 2 },
  { codigo: "VEN-TOK-20", descripcion: "Ventilador de pie 20 pulgadas", marca: "Tokyo", categoria: "Ventilacion", rubro: "Electrodomesticos", costo: 180000, precio: 290000, central: 25, showroom: 5, minimo: 8 },
  { codigo: "CLI-CON-CT", descripcion: "Climatizador evaporativo", marca: "Consul", categoria: "Climatizacion", rubro: "Electrodomesticos", costo: 620000, precio: 890000, central: 9, showroom: 2, minimo: 3 },
  { codigo: "PEL-PHI-AIR", descripcion: "Freidora de aire 5L", marca: "Philips", categoria: "Pequenos Electrodomesticos", rubro: "Electrodomesticos", costo: 550000, precio: 850000, central: 18, showroom: 4, minimo: 5 },
  { codigo: "PEL-PHI-LIC", descripcion: "Licuadora 600W", marca: "Philips", categoria: "Pequenos Electrodomesticos", rubro: "Electrodomesticos", costo: 210000, precio: 350000, central: 22, showroom: 5, minimo: 6 },
  { codigo: "PEL-PHI-PLA", descripcion: "Plancha de vapor", marca: "Philips", categoria: "Pequenos Electrodomesticos", rubro: "Electrodomesticos", costo: 150000, precio: 250000, central: 30, showroom: 6, minimo: 10 },
  { codigo: "PEL-JAM-CAF", descripcion: "Cafetera electrica 12 tazas", marca: "JAM", categoria: "Pequenos Electrodomesticos", rubro: "Electrodomesticos", costo: 240000, precio: 390000, central: 14, showroom: 3, minimo: 4 },
  { codigo: "CEL-SAM-A15", descripcion: "Celular Galaxy A15 128GB", marca: "Samsung Electronics", categoria: "Celulares", rubro: "Electrodomesticos", controlaSerie: true, costo: 1200000, precio: 1690000, central: 6, showroom: 0, minimo: 2 },
  { codigo: "CEL-XIA-13C", descripcion: "Celular Redmi 13C 256GB", marca: "Xiaomi", categoria: "Celulares", rubro: "Electrodomesticos", controlaSerie: true, costo: 950000, precio: 1390000, central: 5, showroom: 0, minimo: 2 },
  // --- Muebles ---
  { codigo: "MUE-ABA-RAC", descripcion: "Rack de TV 1.60m", marca: "Abba", categoria: "Muebles", rubro: "Muebles", costo: 480000, precio: 750000, central: 10, showroom: 2, minimo: 3 },
  { codigo: "MUE-ABA-COL", descripcion: "Colchon 2 plazas resortes", marca: "Abba", categoria: "Muebles", rubro: "Muebles", costo: 900000, precio: 1450000, central: 6, showroom: 2, minimo: 2 },
  { codigo: "MUE-ABA-SIL", descripcion: "Juego de sillas x4", marca: "Abba", categoria: "Muebles", rubro: "Muebles", costo: 380000, precio: 620000, central: 12, showroom: 2, minimo: 4 },
];

// Redondea a los mil mas cercano (guaranies).
const mil = (n: number) => Math.round(n / 1000) * 1000;
// Precios por lista: contado + recargos por financiacion.
const precioPorLista = (base: number) => ({
  CONTADO: base,
  CRED6: mil(base * 1.1),
  CRED10: mil(base * 1.18),
  CRED12: mil(base * 1.25),
});

async function main() {
  console.log("Sembrando productos de prueba...");

  const company = await prisma.company.findFirst();
  if (!company) throw new Error("No hay empresa. Corre primero el seed principal.");

  const unidad = await prisma.unitOfMeasure.findUnique({ where: { codigo: "UN" } });
  if (!unidad) throw new Error("Falta la unidad UN. Corre primero el seed principal.");

  // Depositos: Central (recibe stock) y Showroom.
  const central = await prisma.warehouse.findFirst({ where: { companyId: company.id, codigo: "001" } });
  const showroom = await prisma.warehouse.findFirst({ where: { companyId: company.id, codigo: "002" } });
  if (!central || !showroom) throw new Error("Faltan depositos 001/002.");

  // Listas de precios (por codigo).
  const priceLists = await prisma.priceList.findMany();
  const plByCodigo = new Map(priceLists.map((pl) => [pl.codigo, pl]));

  // Cache de marcas / categorias / rubros para upsert unico.
  const marcasNecesarias = [...new Set(PRODUCTS.map((p) => p.marca))];
  const categoriasNecesarias = [...new Set(PRODUCTS.map((p) => p.categoria))];
  const rubrosNecesarios = [...new Set(PRODUCTS.map((p) => p.rubro))];

  const brandByName = new Map<string, number>();
  for (const nombre of marcasNecesarias) {
    const b = await prisma.brand.upsert({ where: { nombre }, update: {}, create: { nombre } });
    brandByName.set(nombre, b.id);
  }
  const catByName = new Map<string, number>();
  for (const nombre of categoriasNecesarias) {
    const c = await prisma.category.upsert({ where: { nombre }, update: {}, create: { nombre } });
    catByName.set(nombre, c.id);
  }
  const rubroByName = new Map<string, number>();
  for (const nombre of rubrosNecesarios) {
    const r = await prisma.rubro.upsert({ where: { nombre }, update: {}, create: { nombre } });
    rubroByName.set(nombre, r.id);
  }

  let creados = 0;
  let existentes = 0;
  let index = 0;

  for (const p of PRODUCTS) {
    index += 1;
    const yaExiste = await prisma.article.findUnique({ where: { codigo: p.codigo } });

    const article = await prisma.article.upsert({
      where: { codigo: p.codigo },
      update: {
        descripcion: p.descripcion,
        brandId: brandByName.get(p.marca)!,
        categoryId: catByName.get(p.categoria)!,
        unitId: unidad.id,
        rubroId: rubroByName.get(p.rubro)!,
        ivaTipo: p.iva ?? "IVA10",
        controlaSerie: p.controlaSerie ?? false,
        costoActual: p.costo,
        precioVenta: p.precio,
        stockMinimo: p.minimo ?? 0,
      },
      create: {
        codigo: p.codigo,
        descripcion: p.descripcion,
        brandId: brandByName.get(p.marca)!,
        categoryId: catByName.get(p.categoria)!,
        unitId: unidad.id,
        rubroId: rubroByName.get(p.rubro)!,
        ivaTipo: p.iva ?? "IVA10",
        controlaSerie: p.controlaSerie ?? false,
        costoActual: p.costo,
        precioVenta: p.precio,
        stockMinimo: p.minimo ?? 0,
      },
    });

    // Codigo de barra principal (idempotente por codigo unico).
    const barcode = `2000000${String(500000 + index)}`; // 13 digitos, unico
    const barExiste = await prisma.articleBarcode.findUnique({ where: { codigo: barcode } });
    if (!barExiste) {
      await prisma.articleBarcode.create({
        data: { articleId: article.id, codigo: barcode, esPrincipal: true },
      });
    }

    // Precios en las 4 listas.
    const precios = precioPorLista(p.precio);
    for (const [codigoLista, precio] of Object.entries(precios)) {
      const pl = plByCodigo.get(codigoLista);
      if (!pl) continue;
      await prisma.articlePrice.upsert({
        where: { articleId_priceListId: { articleId: article.id, priceListId: pl.id } },
        update: { precio },
        create: { articleId: article.id, priceListId: pl.id, precio },
      });
    }

    // Stock inicial + movimiento + historial de costo: solo la primera vez.
    if (!yaExiste) {
      const totalInicial = p.central + p.showroom;

      if (p.central > 0) {
        await prisma.stockByWarehouse.create({
          data: { articleId: article.id, warehouseId: central.id, cantidad: p.central },
        });
      }
      if (p.showroom > 0) {
        await prisma.stockByWarehouse.create({
          data: { articleId: article.id, warehouseId: showroom.id, cantidad: p.showroom },
        });
      }

      // Movimiento de AJUSTE de ingreso inicial (carga de inventario).
      if (p.central > 0) {
        await prisma.stockMovement.create({
          data: {
            companyId: company.id,
            articleId: article.id,
            warehouseId: central.id,
            tipo: "AJUSTE",
            cantidad: p.central,
            origenTipo: "AJUSTE",
            observacion: "Carga inicial de inventario (seed)",
          },
        });
      }
      if (p.showroom > 0) {
        await prisma.stockMovement.create({
          data: {
            companyId: company.id,
            articleId: article.id,
            warehouseId: showroom.id,
            tipo: "AJUSTE",
            cantidad: p.showroom,
            origenTipo: "AJUSTE",
            observacion: "Carga inicial de inventario (seed)",
          },
        });
      }

      // Historial de costo inicial.
      await prisma.articleCostHistory.create({
        data: { articleId: article.id, costo: p.costo, moneda: "PYG", origenTipo: "AJUSTE" },
      });

      // Series/IMEI para articulos que controlan serie (igual al stock central).
      if (p.controlaSerie && p.central > 0) {
        for (let i = 1; i <= p.central; i++) {
          const serie = `${p.codigo}-${String(i).padStart(4, "0")}`;
          await prisma.articleSerial.create({
            data: { articleId: article.id, serie, warehouseId: central.id, estado: "EN_STOCK" },
          });
        }
      }

      creados++;
      console.log(`  + ${p.codigo}  ${p.descripcion}  (stock ${totalInicial})`);
    } else {
      existentes++;
      console.log(`  = ${p.codigo}  ya existia (precios/datos actualizados, stock intacto)`);
    }
  }

  console.log(`\nSeed de productos completo: ${creados} creados, ${existentes} ya existentes.`);
  console.log(`Total de articulos en el catalogo: ${await prisma.article.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
