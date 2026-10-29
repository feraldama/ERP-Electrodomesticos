import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Asientos de prueba para ver saldos en el plan de cuentas (CONM001) y el mayor.
// Idempotente: borra los asientos con origenTipo = "PRUEBA" y los vuelve a generar.
// Uso: pnpm --filter @erp/api seed:asientos-prueba [companyId]

const ORIGEN = "PRUEBA";

// Cuentas imputables del plan estandar (codigos de 6 niveles).
const CTA = {
  RECAUDACIONES: "1-01-01-01-01-00",
  CAJA: "1-01-01-02-01-00",
  CLIENTES: "1-01-03-01-01-00",
  TARJETAS: "1-01-03-01-02-00",
  IVA_CRED_10: "1-01-03-05-03-01",
  MERCADERIAS_10: "1-01-04-01-01-00",
  SEGUROS: "1-01-05-02-00-00",
  RODADOS: "1-02-04-02-00-00",
  MUEBLES: "1-02-04-03-00-00",
  PROVEEDORES: "2-01-01-01-00-00",
  PRESTAMOS: "2-01-02-01-00-00",
  IVA_DEB_10: "2-01-03-01-02-01",
  CARGAS_SOCIALES: "2-01-03-02-00-00",
  CAPITAL: "3-01-01-01-00-00",
  VENTAS_10: "4-01-01-01-00-00",
  DESCUENTOS: "4-98-00-00-00-00",
  INTERESES_GANADOS: "8-01-00-00-00-00",
  COSTO_MERC: "5-01-01-00-00-00",
  SUELDOS_VTA: "10-01-01-00-00-00",
  PUBLICIDAD: "10-04-00-00-00-00",
  FLETES: "10-05-00-00-00-00",
  SUELDOS_ADM: "11-01-01-00-00-00",
  APORTE_PATRONAL: "11-01-02-00-00-00",
  ALQUILERES: "11-05-00-00-00-00",
  SERVICIOS: "11-06-00-00-00-00",
  COMBUSTIBLE: "11-08-00-00-00-00",
  UTILES: "11-11-00-00-00-00",
  GASTOS_BANCARIOS: "11-16-00-00-00-00",
  INTERESES_PAGADOS: "13-01-00-00-00-00",
} as const;
type Clave = keyof typeof CTA;
type Linea = [Clave, number, number, string?]; // cuenta, debe, haber, detalle

// Generador determinista para que los montos sean siempre los mismos.
let semilla = 20261029;
function rnd() {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
}
const monto = (min: number, max: number) => Math.round((min + rnd() * (max - min)) / 10000) * 10000;
const iva = (neto: number) => Math.round(neto / 10);

const CLIENTES = ["Gomez Benitez, Carlos", "Comercial San Jose S.A.", "Rojas, Maria Elena", "Almacen La Familia", "Duarte, Pedro", "Servicios Integrales SRL"];
const PROVEEDORES = ["Tokyo Electronics S.A.", "Distribuidora del Este", "Samsung Paraguay", "Muebles Itaugua SRL"];

function asientos(): Array<{ fecha: string; glosa: string; lineas: Linea[] }> {
  const out: Array<{ fecha: string; glosa: string; lineas: Linea[] }> = [];
  const add = (fecha: string, glosa: string, lineas: Linea[]) => out.push({ fecha, glosa, lineas });

  add("2026-07-01", "Aporte de capital de los socios", [["CAJA", 250_000_000, 0], ["CAPITAL", 0, 250_000_000]]);
  add("2026-07-02", "Prestamo Banco Itau a 24 meses", [["CAJA", 120_000_000, 0], ["PRESTAMOS", 0, 120_000_000]]);
  add("2026-07-03", "Compra de rodado para reparto", [["RODADOS", 95_000_000, 0], ["CAJA", 0, 95_000_000]]);
  add("2026-07-04", "Compra de muebles para salon de ventas", [["MUEBLES", 18_500_000, 0], ["CAJA", 0, 18_500_000]]);
  add("2026-07-05", "Poliza de seguro anual del local", [["SEGUROS", 9_600_000, 0], ["CAJA", 0, 9_600_000]]);

  const meses = ["07", "08", "09", "10"];
  meses.forEach((m, mi) => {
    // Compras de mercaderias a credito
    for (let k = 0; k < 3; k++) {
      const neto = monto(25_000_000, 70_000_000);
      const prov = PROVEEDORES[(mi + k) % PROVEEDORES.length];
      add(`2026-${m}-${String(3 + k * 8).padStart(2, "0")}`, `Compra de mercaderias - ${prov}`, [
        ["MERCADERIAS_10", neto, 0],
        ["IVA_CRED_10", iva(neto), 0],
        ["PROVEEDORES", 0, neto + iva(neto), prov],
      ]);
    }
    // Ventas contado y credito, con su costo
    for (let k = 0; k < 6; k++) {
      const neto = monto(6_000_000, 28_000_000);
      const costo = Math.round((neto * 0.68) / 10000) * 10000;
      const credito = k % 3 === 2;
      const tarjeta = k % 3 === 1;
      const cliente = CLIENTES[(mi * 2 + k) % CLIENTES.length];
      const dia = String(2 + k * 4).padStart(2, "0");
      add(`2026-${m}-${dia}`, `Venta ${credito ? "credito" : "contado"} - ${cliente}`, [
        [credito ? "CLIENTES" : tarjeta ? "TARJETAS" : "CAJA", neto + iva(neto), 0, cliente],
        ["VENTAS_10", 0, neto],
        ["IVA_DEB_10", 0, iva(neto)],
      ]);
      add(`2026-${m}-${dia}`, `Costo de venta - ${cliente}`, [["COSTO_MERC", costo, 0], ["MERCADERIAS_10", 0, costo]]);
    }
    // Cobranzas, pagos y depositos
    const cobro = monto(15_000_000, 30_000_000);
    add(`2026-${m}-18`, `Cobranza cuotas - ${CLIENTES[mi % CLIENTES.length]}`, [["CAJA", cobro, 0], ["CLIENTES", 0, cobro]]);
    const acred = monto(20_000_000, 40_000_000);
    add(`2026-${m}-20`, "Acreditacion de cupones de tarjeta", [["CAJA", acred, 0], ["TARJETAS", 0, acred]]);
    const pago = monto(60_000_000, 110_000_000);
    add(`2026-${m}-25`, `Pago a proveedor - ${PROVEEDORES[mi % PROVEEDORES.length]}`, [["PROVEEDORES", pago, 0], ["CAJA", 0, pago]]);
    const deposito = monto(10_000_000, 25_000_000);
    add(`2026-${m}-26`, "Recaudacion del dia a depositar", [["RECAUDACIONES", deposito, 0], ["CAJA", 0, deposito]]);
    // Gastos del mes
    add(`2026-${m}-28`, "Liquidacion de sueldos", [
      ["SUELDOS_VTA", 14_000_000, 0],
      ["SUELDOS_ADM", 9_500_000, 0],
      ["APORTE_PATRONAL", 3_877_500, 0],
      ["CAJA", 0, 23_500_000],
      ["CARGAS_SOCIALES", 0, 3_877_500],
    ]);
    add(`2026-${m}-10`, "Pago IPS del mes anterior", [["CARGAS_SOCIALES", mi ? 3_877_500 : 0, 0], ["CAJA", 0, mi ? 3_877_500 : 0]]);
    add(`2026-${m}-05`, "Alquiler del local comercial", [["ALQUILERES", 7_500_000, 0], ["CAJA", 0, 7_500_000]]);
    const ande = monto(1_200_000, 2_400_000);
    add(`2026-${m}-12`, "ANDE, ESSAP y Tigo internet", [["SERVICIOS", ande, 0], ["CAJA", 0, ande]]);
    const publi = monto(1_500_000, 4_500_000);
    add(`2026-${m}-15`, "Publicidad en redes y radio", [["PUBLICIDAD", publi, 0], ["CAJA", 0, publi]]);
    const flete = monto(600_000, 1_800_000);
    add(`2026-${m}-16`, "Fletes de entregas a domicilio", [["FLETES", flete, 0], ["CAJA", 0, flete]]);
    const comb = monto(900_000, 1_600_000);
    add(`2026-${m}-17`, "Combustible del rodado", [["COMBUSTIBLE", comb, 0], ["CAJA", 0, comb]]);
    const utiles = monto(250_000, 600_000);
    add(`2026-${m}-19`, "Utiles de oficina", [["UTILES", utiles, 0], ["CAJA", 0, utiles]]);
    add(`2026-${m}-27`, "Comision bancaria y mantenimiento de cuenta", [["GASTOS_BANCARIOS", 85_000, 0], ["CAJA", 0, 85_000]]);
    add(`2026-${m}-29`, "Cuota prestamo Banco Itau", [
      ["PRESTAMOS", 5_000_000, 0],
      ["INTERESES_PAGADOS", 1_350_000, 0],
      ["CAJA", 0, 6_350_000],
    ]);
    add(`2026-${m}-22`, "Descuento por pronto pago a cliente", [["DESCUENTOS", 350_000, 0], ["CLIENTES", 0, 350_000]]);
    add(`2026-${m}-30`, "Intereses ganados plazo fijo", [["CAJA", 420_000, 0], ["INTERESES_GANADOS", 0, 420_000]]);
  });

  // No generar asientos en el futuro ni vacios.
  const hoy = new Date().toISOString().slice(0, 10);
  return out
    .filter((a) => a.fecha <= hoy && a.lineas.some((l) => l[1] > 0))
    .map((a) => ({ ...a, lineas: a.lineas.filter((l) => l[1] > 0 || l[2] > 0) }))
    .sort((x, y) => x.fecha.localeCompare(y.fecha));
}

async function main() {
  const companyId = Number(process.argv[2] ?? 1);
  const cuentas = await prisma.chartOfAccount.findMany({
    where: { companyId, codigo: { in: Object.values(CTA) } },
    select: { id: true, codigo: true, imputable: true },
  });
  const idDe = new Map(cuentas.map((c) => [c.codigo, c.id]));
  const faltan = Object.values(CTA).filter((c) => !idDe.has(c));
  if (faltan.length) throw new Error(`Faltan cuentas en el plan de la empresa ${companyId}: ${faltan.join(", ")}`);

  const lista = asientos();
  for (const a of lista) {
    const d = a.lineas.reduce((s, l) => s + l[1], 0);
    const h = a.lineas.reduce((s, l) => s + l[2], 0);
    if (d !== h) throw new Error(`Asiento descuadrado: ${a.fecha} ${a.glosa} (${d} / ${h})`);
  }

  await prisma.$transaction(
    async (tx) => {
      const borrados = await tx.accountingEntry.deleteMany({ where: { companyId, origenTipo: ORIGEN } });
      if (borrados.count) console.log(`Borrados ${borrados.count} asientos de prueba anteriores`);

      const periodos = await tx.fiscalPeriod.findMany({ where: { companyId } });
      const max = await tx.accountingEntry.aggregate({ where: { companyId }, _max: { numero: true } });
      let numero = max._max.numero ?? 0;

      for (const a of lista) {
        const fecha = new Date(`${a.fecha}T00:00:00.000Z`);
        const periodo = periodos.find((p) => fecha >= p.fechaInicio && fecha <= p.fechaFin);
        await tx.accountingEntry.create({
          data: {
            companyId,
            periodId: periodo?.id ?? null,
            numero: ++numero,
            fecha,
            glosa: a.glosa,
            origenTipo: ORIGEN,
            lines: {
              create: a.lineas.map(([clave, debe, haber, detalle]) => ({
                accountId: idDe.get(CTA[clave])!,
                debe,
                haber,
                detalle: detalle ?? null,
              })),
            },
          },
        });
      }
    },
    { timeout: 60_000 }
  );
  console.log(`Creados ${lista.length} asientos de prueba (origenTipo = "${ORIGEN}") para la empresa ${companyId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
