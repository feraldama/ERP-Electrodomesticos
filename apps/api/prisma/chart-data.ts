import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PrismaClient, CuentaTipo } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RawAccount {
  codigo: string;
  nombre: string;
  nivel: number;
  imputable: boolean;
}

// tipo por primer segmento del codigo (estructura DNIT de 20 grupos del plan del cliente).
// Los grupos 6/9/12/16/18/20 son lineas de subtotal de resultado (no imputables): se
// marcan ORDEN para que queden fuera de las sumas de balance / estado de resultados.
const TIPO_BY_GROUP: Record<number, CuentaTipo> = {
  1: "ACTIVO",
  2: "PASIVO",
  3: "PATRIMONIO",
  4: "INGRESO",
  5: "EGRESO",
  6: "ORDEN",
  7: "INGRESO",
  8: "INGRESO",
  9: "ORDEN",
  10: "EGRESO",
  11: "EGRESO",
  12: "ORDEN",
  13: "EGRESO",
  14: "EGRESO",
  15: "EGRESO",
  16: "ORDEN",
  17: "INGRESO",
  18: "ORDEN",
  19: "EGRESO",
  20: "ORDEN",
};

export function tipoDe(codigo: string): CuentaTipo {
  const grupo = parseInt(codigo.split("-")[0], 10);
  return TIPO_BY_GROUP[grupo] ?? "ORDEN";
}

// Cuentas operativas usadas por el motor de asientos -> cuenta del plan del cliente.
export const DEFAULT_ACCOUNTING_CONFIG: Record<string, string> = {
  CAJA: "1-01-01-02-01-00", // Caja Guaranies
  CLIENTES: "1-01-03-01-01-00", // Clientes
  IVA_CREDITO_10: "1-01-03-05-03-01",
  IVA_CREDITO_5: "1-01-03-05-03-02",
  PROVEEDORES: "2-01-01-01-00-00", // Proveedores locales
  IVA_DEBITO_10: "2-01-03-01-02-01",
  IVA_DEBITO_5: "2-01-03-01-02-02",
  VENTAS_10: "4-01-01-01-00-00",
  VENTAS_5: "4-01-01-02-00-00",
  VENTAS_EXENTA: "4-01-02-00-00-00",
  COMPRAS_GRAV: "5-01-01-00-00-00",
  COMPRAS_EXENTA: "5-01-02-00-00-00",
  RESULTADO_EJERCICIO: "3-03-02-00-00-00", // Resultado del ejercicio (patrimonio) - destino del cierre
};

export function getChartData(): RawAccount[] {
  const path = join(__dirname, "data", "chart-of-accounts.json");
  return JSON.parse(readFileSync(path, "utf8")) as RawAccount[];
}

export interface LoadResult {
  creadas: number;
  actualizadas: number;
  desactivadas: number;
  borradas: number;
  configCreadas: number;
}

/**
 * Carga (o actualiza) el plan de cuentas del cliente para una empresa y siembra la
 * configuracion de cuentas operativas. Idempotente:
 *  - upsert de cada cuenta por (companyId, codigo); el parentId se resuelve con una
 *    pila por nivel (las filas vienen en orden jerarquico).
 *  - las cuentas previas que NO esten en el plan del cliente se desactivan; se borran
 *    solo si no tienen movimientos contables ni subcuentas.
 *  - la config de cuentas solo se crea si falta (no pisa asignaciones que el usuario
 *    haya cambiado a mano).
 */
export async function loadChartOfAccounts(
  prisma: PrismaClient,
  companyId: number
): Promise<LoadResult> {
  const data = getChartData();
  const result: LoadResult = { creadas: 0, actualizadas: 0, desactivadas: 0, borradas: 0, configCreadas: 0 };

  // 1) upsert de cuentas (sin parent todavia) y mapeo codigo -> id
  const idByCodigo = new Map<string, number>();
  for (const a of data) {
    const existing = await prisma.chartOfAccount.findUnique({
      where: { companyId_codigo: { companyId, codigo: a.codigo } },
      select: { id: true },
    });
    const rec = await prisma.chartOfAccount.upsert({
      where: { companyId_codigo: { companyId, codigo: a.codigo } },
      update: { nombre: a.nombre, tipo: tipoDe(a.codigo), imputable: a.imputable, activo: true },
      create: {
        companyId,
        codigo: a.codigo,
        nombre: a.nombre,
        tipo: tipoDe(a.codigo),
        imputable: a.imputable,
        activo: true,
      },
    });
    idByCodigo.set(a.codigo, rec.id);
    if (existing) result.actualizadas++;
    else result.creadas++;
  }

  // 2) resolver parentId con pila por nivel
  const lastByLevel: Record<number, string> = {};
  for (const a of data) {
    lastByLevel[a.nivel] = a.codigo;
    const parentCodigo = a.nivel > 1 ? lastByLevel[a.nivel - 1] : undefined;
    const parentId = parentCodigo ? idByCodigo.get(parentCodigo) ?? null : null;
    await prisma.chartOfAccount.update({
      where: { id: idByCodigo.get(a.codigo)! },
      data: { parentId },
    });
  }

  // 3) desactivar / borrar cuentas previas que no esten en el plan del cliente
  const clientCodes = new Set(data.map((a) => a.codigo));
  const orphans = await prisma.chartOfAccount.findMany({
    where: { companyId, codigo: { notIn: [...clientCodes] } },
    select: { id: true },
  });
  for (const o of orphans) {
    const [conMovimientos, conHijos] = await Promise.all([
      prisma.accountingEntryLine.count({ where: { accountId: o.id } }),
      prisma.chartOfAccount.count({ where: { parentId: o.id } }),
    ]);
    if (conMovimientos === 0 && conHijos === 0) {
      await prisma.chartOfAccount.delete({ where: { id: o.id } });
      result.borradas++;
    } else {
      await prisma.chartOfAccount.update({ where: { id: o.id }, data: { activo: false } });
      result.desactivadas++;
    }
  }

  // 4) sembrar config de cuentas operativas (solo si falta)
  for (const [clave, codigo] of Object.entries(DEFAULT_ACCOUNTING_CONFIG)) {
    const accountId = idByCodigo.get(codigo);
    if (!accountId) {
      console.warn(`[chart] config ${clave}: cuenta ${codigo} no existe en el plan, se omite`);
      continue;
    }
    const exists = await prisma.accountingConfig.findUnique({
      where: { companyId_clave: { companyId, clave } },
      select: { id: true },
    });
    if (!exists) {
      await prisma.accountingConfig.create({ data: { companyId, clave, accountId } });
      result.configCreadas++;
    }
  }

  return result;
}
