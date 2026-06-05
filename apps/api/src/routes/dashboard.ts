import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { companyRequired } from "../middleware/company.js";

export const dashboardRouter = Router();
dashboardRouter.use(authRequired, companyRequired);

// Metricas del Inicio para la empresa activa
dashboardRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!;

    const [articulos, stockAgg, comprasAgg, clientes, proveedores] = await Promise.all([
      prisma.article.count({ where: { activo: true } }),
      prisma.stockByWarehouse.aggregate({
        _sum: { cantidad: true },
        where: { warehouse: { companyId } },
      }),
      prisma.purchaseInvoice.aggregate({
        _count: { _all: true },
        _sum: { total: true },
        where: { companyId, estado: { not: "ANULADO" } },
      }),
      prisma.customer.count({ where: { activo: true } }),
      prisma.supplier.count({ where: { activo: true } }),
    ]);

    // Valor del stock (cantidad * costo) via raw para la empresa activa
    const valorRows = await prisma.$queryRaw<Array<{ valor: number }>>`
      SELECT COALESCE(SUM(s.cantidad * a."costoActual"), 0)::float8 AS valor
      FROM stock_by_warehouse s
      JOIN articles a ON a.id = s."articleId"
      JOIN warehouses w ON w.id = s."warehouseId"
      WHERE w."companyId" = ${companyId}
    `;

    res.json({
      articulos,
      unidadesStock: Number(stockAgg._sum.cantidad ?? 0),
      valorStock: Math.round(valorRows[0]?.valor ?? 0),
      comprasCount: comprasAgg._count._all,
      comprasTotal: Number(comprasAgg._sum.total ?? 0),
      clientes,
      proveedores,
    });
  })
);
