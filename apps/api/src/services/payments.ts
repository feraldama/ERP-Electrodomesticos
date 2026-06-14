import type { Prisma } from "@prisma/client";

export interface CreateSupplierPaymentInput {
  companyId: number;
  supplierId: number;
  fecha: Date;
  metodo: string; // EFECTIVO | TARJETA_DEBITO | TARJETA_CREDITO | TRANSFERENCIA | CHEQUE
  monto: number;
  observacion?: string | null;
  usuarioId?: number | null;
  // Solo cuando metodo === "CHEQUE": genera un cheque EMITIDO (diferido) ligado al pago.
  cheque?: { banco?: string | null; numero: string; fechaCobro: Date } | null;
}

export interface CollectionAllocationInput {
  installmentId: number;
  monto: number;
}

export interface CreateCollectionInput {
  companyId: number;
  customerId: number;
  fecha: Date;
  metodo: string; // EFECTIVO | TARJETA_DEBITO | TARJETA_CREDITO | TRANSFERENCIA
  observacion?: string | null;
  usuarioId?: number | null;
  allocations: CollectionAllocationInput[];
}

const r = (n: number) => Math.round(n);

/**
 * Registra un pago a un proveedor (a cuenta del saldo, ya que las compras no
 * generan cuotas), en una sola transaccion:
 *  1) crea el PaymentMade
 *  2) registra el debe en la cuenta corriente del proveedor (reduce lo que debemos)
 *  3) encola el evento contable (PAGO)
 */
export async function createSupplierPayment(prisma: Prisma.TransactionClient, input: CreateSupplierPaymentInput) {
  const monto = r(input.monto);
  if (monto <= 0) throw new Error("El monto a pagar debe ser mayor a cero");

  const payment = await prisma.paymentMade.create({
    data: {
      companyId: input.companyId,
      supplierId: input.supplierId,
      fecha: input.fecha,
      montoTotal: monto,
      metodo: input.metodo,
      observacion: input.observacion ?? null,
      usuarioId: input.usuarioId ?? null,
    },
  });

  // Pago con cheque: registra el cheque EMITIDO (diferido), ligado al pago.
  if (input.metodo === "CHEQUE") {
    if (!input.cheque?.numero) throw new Error("Falta el numero de cheque");
    await prisma.check.create({
      data: {
        companyId: input.companyId,
        tipo: "EMITIDO",
        banco: input.cheque.banco ?? null,
        numero: input.cheque.numero,
        monto,
        fechaEmision: input.fecha,
        fechaCobro: input.cheque.fechaCobro,
        estado: "PENDIENTE",
        paymentMadeId: payment.id,
      },
    });
  }

  await prisma.supplierAccountEntry.create({
    data: {
      companyId: input.companyId,
      supplierId: input.supplierId,
      concepto: `Pago a proveedor (${input.metodo})`,
      debe: monto,
      origenTipo: "PAGO",
      origenId: payment.id,
    },
  });

  await prisma.accountingEvent.create({
    data: {
      companyId: input.companyId,
      tipo: "PAGO",
      origenTipo: "PAGO",
      origenId: payment.id,
      payload: { montoTotal: monto, metodo: input.metodo, supplierId: input.supplierId },
    },
  });

  return payment;
}

/**
 * Registra un cobro recibido de un cliente y lo aplica a una o varias cuotas, en
 * una sola transaccion:
 *  1) valida que cada cuota pertenezca al cliente y que el monto no supere su saldo
 *  2) crea el PaymentReceived con sus aplicaciones (InstallmentPayment)
 *  3) actualiza montoPagado y estado (PARCIAL / PAGADA) de cada cuota
 *  4) registra el haber en la cuenta corriente del cliente
 *  5) encola el evento contable (COBRO)
 */
export async function createCollection(prisma: Prisma.TransactionClient, input: CreateCollectionInput) {
  const ids = input.allocations.map((a) => a.installmentId);
  const installments = await prisma.installment.findMany({
    where: { id: { in: ids }, companyId: input.companyId, invoice: { customerId: input.customerId } },
    select: { id: true, montoCuota: true, montoPagado: true },
  });
  const byId = new Map(installments.map((i) => [i.id, i]));

  let montoTotal = 0;
  const apps = input.allocations.map((a) => {
    const inst = byId.get(a.installmentId);
    if (!inst) throw new Error("Una cuota no corresponde al cliente seleccionado");
    const montoCuota = Number(inst.montoCuota);
    const montoPagado = Number(inst.montoPagado);
    const saldo = r(montoCuota - montoPagado);
    const monto = r(a.monto);
    if (monto <= 0) throw new Error("Los montos a cobrar deben ser mayores a cero");
    if (monto > saldo) throw new Error(`El monto de una cuota supera su saldo (${saldo})`);
    montoTotal += monto;
    return { installmentId: a.installmentId, monto, montoCuota, montoPagado };
  });
  if (montoTotal <= 0) throw new Error("No hay montos para cobrar");

  const payment = await prisma.paymentReceived.create({
    data: {
      companyId: input.companyId,
      customerId: input.customerId,
      fecha: input.fecha,
      montoTotal,
      metodo: input.metodo,
      observacion: input.observacion ?? null,
      usuarioId: input.usuarioId ?? null,
      allocations: {
        create: apps.map((a) => ({ installmentId: a.installmentId, monto: a.monto })),
      },
    },
  });

  for (const a of apps) {
    const nuevoPagado = a.montoPagado + a.monto;
    await prisma.installment.update({
      where: { id: a.installmentId },
      data: {
        montoPagado: nuevoPagado,
        estado: nuevoPagado >= a.montoCuota ? "PAGADA" : "PARCIAL",
      },
    });
  }

  await prisma.customerAccountEntry.create({
    data: {
      companyId: input.companyId,
      customerId: input.customerId,
      concepto: `Cobro recibido (${input.metodo})`,
      haber: montoTotal,
      origenTipo: "COBRO",
      origenId: payment.id,
    },
  });

  await prisma.accountingEvent.create({
    data: {
      companyId: input.companyId,
      tipo: "COBRO",
      origenTipo: "COBRO",
      origenId: payment.id,
      payload: {
        montoTotal,
        metodo: input.metodo,
        cuotas: apps.map((a) => ({ installmentId: a.installmentId, monto: a.monto })),
      },
    },
  });

  return payment;
}
