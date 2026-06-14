import type { Prisma } from "@prisma/client";
import { desglosarIvaIncluido } from "./iva.js";

export interface QuoteItemInput {
  articleId: number;
  cantidad: number;
  precioUnitario: number; // con IVA incluido
}

export interface CreateQuoteInput {
  companyId: number;
  customerId: number;
  priceListId?: number | null;
  fecha: Date;
  validezDias?: number;
  observacion?: string | null;
  usuarioId?: number | null;
  items: QuoteItemInput[];
}

const r = (n: number) => Math.round(n);

/**
 * Crea un presupuesto/cotizacion. NO afecta stock ni cuenta corriente. Calcula
 * los totales (IVA incluido desglosado) y un numero correlativo por empresa.
 */
export async function createQuote(prisma: Prisma.TransactionClient, input: CreateQuoteInput) {
  const articleIds = [...new Set(input.items.map((i) => i.articleId))];
  const articles = await prisma.article.findMany({
    where: { id: { in: articleIds } },
    select: { id: true, ivaTipo: true },
  });
  const ivaById = new Map(articles.map((a) => [a.id, a.ivaTipo]));

  let subtotalExenta = 0, subtotal5 = 0, subtotal10 = 0, iva5 = 0, iva10 = 0;
  const computed = input.items.map((it) => {
    const ivaTipo = ivaById.get(it.articleId) ?? "IVA10";
    const bruto = r(it.cantidad * it.precioUnitario);
    const { neto, iva } = desglosarIvaIncluido(bruto, ivaTipo);
    if (ivaTipo === "IVA10") { subtotal10 += neto; iva10 += iva; }
    else if (ivaTipo === "IVA5") { subtotal5 += neto; iva5 += iva; }
    else subtotalExenta += bruto;
    return { ...it, ivaTipo, total: bruto };
  });
  const total = subtotalExenta + subtotal5 + subtotal10 + iva5 + iva10;

  const count = await prisma.salesQuote.count({ where: { companyId: input.companyId } });
  const numero = String(count + 1).padStart(7, "0");

  return prisma.salesQuote.create({
    data: {
      companyId: input.companyId,
      customerId: input.customerId,
      priceListId: input.priceListId ?? null,
      numero,
      fecha: input.fecha,
      validezDias: input.validezDias ?? 15,
      subtotalExenta, subtotal5, subtotal10, iva5, iva10, total,
      observacion: input.observacion ?? null,
      usuarioId: input.usuarioId ?? null,
      items: {
        create: computed.map((c) => ({
          articleId: c.articleId,
          cantidad: c.cantidad,
          precioUnitario: c.precioUnitario,
          ivaTipo: c.ivaTipo,
          total: c.total,
        })),
      },
    },
  });
}
