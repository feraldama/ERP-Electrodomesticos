// Pruebas del armado de asientos (computeEntryLines es puro: no toca la base).
// Correr con: pnpm --filter @erp/api test
import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorCategoria, computeEntryLines, type CategoryMoment } from "./accounting.js";

// Cuentas ficticias por clave operativa.
const ID: Record<string, number> = {
  CAJA: 1,
  MEDIO_EFECTIVO: 2,
  MEDIO_TRANSFERENCIA: 3,
  MEDIO_CHEQUE: 4,
  CLIENTES: 10,
  PROVEEDORES: 20,
  IVA_CREDITO_10: 30,
  IVA_CREDITO_5: 31,
  IVA_DEBITO_10: 40,
  IVA_DEBITO_5: 41,
  COMPRAS_GRAV: 50,
  COMPRAS_EXENTA: 51,
  VENTAS_10: 60,
  VENTAS_5: 61,
  VENTAS_EXENTA: 62,
};
const CUENTA_PROVEEDOR = 99; // cuenta propia de un proveedor (SupplierAccountConfig)
const CUENTA_CATEGORIA = 77; // cuenta de compra de una categoria

const resolveClave = (clave: string) => {
  const id = ID[clave];
  if (!id) throw new Error(`clave sin cuenta: ${clave}`);
  return id;
};
const resolveCategoria = (categoryId: number | null | undefined, moments: CategoryMoment[]) =>
  categoryId === 5 && moments.includes("compra") ? CUENTA_CATEGORIA : null;

const asiento = (tipo: string, payload: Record<string, unknown>) => {
  const lineas = computeEntryLines(tipo, payload, resolveClave, resolveCategoria);
  // Toda partida doble debe cuadrar.
  const debe = lineas.reduce((s, l) => s + l.debe, 0);
  const haber = lineas.reduce((s, l) => s + l.haber, 0);
  assert.equal(debe, haber, `${tipo} descuadrado: debe ${debe} / haber ${haber}`);
  return Object.fromEntries(lineas.map((l) => [l.accountId, l.debe - l.haber]));
};

// Compra de 1.100.000 gravada 10% (1.000.000 + IVA 100.000).
const compra = { subtotalExenta: 0, subtotal5: 0, subtotal10: 1_000_000, iva5: 0, iva10: 100_000, total: 1_100_000 };

test("compra credito sin cuenta propia: la deuda va a PROVEEDORES", () => {
  assert.deepEqual(asiento("COMPRA", { ...compra, condicion: "CREDITO" }), {
    [ID.COMPRAS_GRAV]: 1_000_000,
    [ID.IVA_CREDITO_10]: 100_000,
    [ID.PROVEEDORES]: -1_100_000,
  });
});

test("compra credito con cuenta del proveedor: la deuda va a esa cuenta", () => {
  const a = asiento("COMPRA", { ...compra, condicion: "CREDITO", cuentaProveedorId: CUENTA_PROVEEDOR });
  assert.equal(a[CUENTA_PROVEEDOR], -1_100_000);
  assert.equal(a[ID.PROVEEDORES], undefined);
});

test("compra contado repartida por medio de pago", () => {
  const a = asiento("COMPRA", {
    ...compra,
    condicion: "CONTADO",
    pagos: [
      { medio: "EFECTIVO", monto: 600_000 },
      { medio: "TRANSFERENCIA", monto: 300_000 },
      { medio: "CHEQUE", monto: 200_000 },
    ],
  });
  assert.equal(a[ID.MEDIO_EFECTIVO], -600_000);
  assert.equal(a[ID.MEDIO_TRANSFERENCIA], -300_000);
  assert.equal(a[ID.MEDIO_CHEQUE], -200_000);
});

test("compra contado sin desglose (eventos viejos) sale de CAJA", () => {
  assert.equal(asiento("COMPRA", { ...compra, condicion: "CONTADO" })[ID.CAJA], -1_100_000);
});

test("la compra contado ignora la cuenta del proveedor (no genera deuda)", () => {
  const a = asiento("COMPRA", { ...compra, condicion: "CONTADO", cuentaProveedorId: CUENTA_PROVEEDOR });
  assert.equal(a[CUENTA_PROVEEDOR], undefined);
});

test("la anulacion de compra es el espejo exacto de la compra", () => {
  for (const extra of [
    { condicion: "CREDITO", cuentaProveedorId: CUENTA_PROVEEDOR },
    { condicion: "CONTADO", pagos: [{ medio: "EFECTIVO", monto: 500_000 }, { medio: "CHEQUE", monto: 600_000 }] },
  ]) {
    const original = asiento("COMPRA", { ...compra, ...extra });
    const reversa = asiento("COMPRA_ANULADA", { ...compra, ...extra });
    for (const [cuenta, saldo] of Object.entries(original)) assert.equal(reversa[cuenta], -saldo, `cuenta ${cuenta}`);
  }
});

test("compra imputada a la cuenta de su categoria", () => {
  const categorias = agruparPorCategoria([
    { categoryId: 5, ivaTipo: "IVA10", total: 550_000 },
    { categoryId: null, ivaTipo: "IVA10", total: 550_000 },
  ]);
  const a = asiento("COMPRA", { ...compra, condicion: "CREDITO", categorias });
  assert.equal(a[CUENTA_CATEGORIA], 500_000);
  assert.equal(a[ID.COMPRAS_GRAV], 500_000);
});

test("pago al proveedor cancela la deuda en su cuenta y sale por el medio", () => {
  assert.deepEqual(asiento("PAGO", { montoTotal: 300_000, metodo: "TRANSFERENCIA", cuentaProveedorId: CUENTA_PROVEEDOR }), {
    [CUENTA_PROVEEDOR]: 300_000,
    [ID.MEDIO_TRANSFERENCIA]: -300_000,
  });
});

test("cheque rechazado repone la deuda en la cuenta del proveedor", () => {
  assert.deepEqual(asiento("PAGO_ANULADO", { montoTotal: 300_000, cuentaProveedorId: CUENTA_PROVEEDOR }), {
    [ID.MEDIO_CHEQUE]: 300_000,
    [CUENTA_PROVEEDOR]: -300_000,
  });
});

test("nota de credito de compra rebaja la deuda en la cuenta del proveedor", () => {
  const a = asiento("NOTA_CREDITO_COMPRA", { ...compra, cuentaProveedorId: CUENTA_PROVEEDOR });
  assert.equal(a[CUENTA_PROVEEDOR], 1_100_000);
  assert.equal(a[ID.IVA_CREDITO_10], -100_000);
});

test("venta contado repartida por medio de pago", () => {
  const a = asiento("VENTA_CONTADO", {
    ...compra,
    pagos: [{ medio: "EFECTIVO", monto: 1_000_000 }, { medio: "TRANSFERENCIA", monto: 100_000 }],
  });
  assert.equal(a[ID.MEDIO_EFECTIVO], 1_000_000);
  assert.equal(a[ID.MEDIO_TRANSFERENCIA], 100_000);
  assert.equal(a[ID.VENTAS_10], -1_000_000);
  assert.equal(a[ID.IVA_DEBITO_10], -100_000);
});

test("el reparto entre medios no pierde guaranies por redondeo", () => {
  // 1.000.001 repartido en tercios: la suma debe seguir siendo exacta (asiento cuadra).
  const a = asiento("COMPRA", {
    subtotalExenta: 1_000_001, subtotal5: 0, subtotal10: 0, iva5: 0, iva10: 0, total: 1_000_001,
    condicion: "CONTADO",
    pagos: [{ medio: "EFECTIVO", monto: 1 }, { medio: "TRANSFERENCIA", monto: 1 }, { medio: "CHEQUE", monto: 1 }],
  });
  assert.equal(a[ID.MEDIO_EFECTIVO] + a[ID.MEDIO_TRANSFERENCIA] + a[ID.MEDIO_CHEQUE], -1_000_001);
});
