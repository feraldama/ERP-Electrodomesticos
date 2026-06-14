import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";
import { requirePermission } from "../middleware/permission.js";
import { createPurchase } from "../services/purchases.js";
import { parseListParams, paginated, wantsPagination } from "../lib/listQuery.js";

export const purchasesRouter = Router();
purchasesRouter.use(authRequired, companyRequired);

const purchaseSchema = z.object({
  supplierId: z.number().int(),
  warehouseId: z.number().int(),
  nroComprobante: z.string().min(1),
  timbrado: z.string().optional().nullable(),
  fecha: z.string().min(1), // ISO date
  condicion: z.enum(["CONTADO", "CREDITO"]).default("CONTADO"),
  moneda: z.string().optional(),
  observacion: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        articleId: z.number().int(),
        cantidad: z.number().positive(),
        costoUnitario: z.number().nonnegative(),
        ivaTipo: z.enum(["IVA10", "IVA5", "EXENTA"]),
      })
    )
    .min(1, "Agrega al menos un articulo"),
});

// Crear compra (transaccional)
purchasesRouter.post(
  "/",
  requirePermission("COMI001"),
  asyncHandler(async (req, res) => {
    const d = purchaseSchema.parse(req.body);
    const companyId = req.companyId!;

    const [supplier, warehouse] = await Promise.all([
      prisma.supplier.findUnique({ where: { id: d.supplierId } }),
      prisma.warehouse.findFirst({ where: { id: d.warehouseId, companyId } }),
    ]);
    if (!supplier) throw new HttpError(400, "Proveedor invalido");
    if (!warehouse) throw new HttpError(400, "Deposito invalido para la empresa");

    // Evita cargar dos veces el mismo comprobante del mismo proveedor (duplicaria stock y deuda)
    const dup = await prisma.purchaseInvoice.findFirst({
      where: {
        companyId,
        supplierId: d.supplierId,
        nroComprobante: d.nroComprobante,
        estado: { not: "ANULADO" },
      },
    });
    if (dup) {
      throw new HttpError(409, `Ya existe una compra con el comprobante ${d.nroComprobante} para este proveedor`);
    }

    const invoice = await prisma.$transaction((tx) =>
      createPurchase(tx, {
        companyId,
        supplierId: d.supplierId,
        warehouseId: d.warehouseId,
        nroComprobante: d.nroComprobante,
        timbrado: d.timbrado ?? null,
        fecha: new Date(d.fecha),
        condicion: d.condicion,
        moneda: d.moneda,
        observacion: d.observacion ?? null,
        usuarioId: req.auth?.userId ?? null,
        items: d.items,
      })
    );

    res.status(201).json(invoice);
  })
);

// Listado de compras
const purchasesSortable = {
  fecha: "fecha",
  comprobante: "nroComprobante",
  proveedor: "supplier.person.razonSocial",
  condicion: "condicion",
  total: "total",
} as const;

purchasesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const where = {
      companyId: req.companyId,
      ...(q
        ? {
            OR: [
              { nroComprobante: { contains: q, mode: "insensitive" as const } },
              { supplier: { person: { razonSocial: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };
    const include = { supplier: { include: { person: true } } };
    const { skip, take, orderBy, page, pageSize } = parseListParams(req.query, {
      sortable: purchasesSortable,
      defaultSort: "fecha",
      defaultDir: "desc",
    });

    if (!wantsPagination(req.query)) {
      const invoices = await prisma.purchaseInvoice.findMany({ where, include, orderBy, take: 200 });
      return res.json(invoices);
    }

    const [items, total] = await prisma.$transaction([
      prisma.purchaseInvoice.findMany({ where, include, orderBy, skip, take }),
      prisma.purchaseInvoice.count({ where }),
    ]);
    res.json(paginated(items, total, page, pageSize));
  })
);

// Detalle de compra
purchasesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: Number(req.params.id), companyId: req.companyId },
      include: {
        supplier: { include: { person: true } },
        items: { include: { article: true } },
      },
    });
    if (!invoice) throw new HttpError(404, "Compra no encontrada");
    res.json(invoice);
  })
);
