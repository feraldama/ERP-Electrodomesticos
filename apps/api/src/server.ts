import express from "express";
import cors from "cors";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "./env.js";
import { HttpError } from "./http.js";
import { UPLOADS_DIR } from "./uploads.js";
import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { articlesRouter, brandsRouter, rubrosRouter, barcodesRouter, serialsRouter } from "./routes/articles.js";
import { categoriesRouter, unitsRouter } from "./routes/stockCatalogs.js";
import { warehousesRouter, stockRouter } from "./routes/warehouses.js";
import { timbradosRouter, puntosExpedicionRouter } from "./routes/timbrados.js";
import { personsRouter, customersRouter, suppliersRouter } from "./routes/persons.js";
import { purchasesRouter } from "./routes/purchases.js";
import { priceListsRouter, articlePricesRouter, salesRouter } from "./routes/sales.js";
import { cobrosRouter } from "./routes/collections.js";
import { cuentaClienteRouter } from "./routes/customerAccount.js";
import { cuentaProveedorRouter } from "./routes/supplierAccount.js";
import { pagosRouter, chequesRouter } from "./routes/supplierPayments.js";
import { notasCreditoVentaRouter } from "./routes/salesCreditNotes.js";
import { notasCreditoCompraRouter } from "./routes/purchaseCreditNotes.js";
import { rolesRouter, usersRouter, companiesRouter } from "./routes/admin.js";
import { contabilidadRouter } from "./routes/accounting.js";
import { presupuestosRouter } from "./routes/quotes.js";
import { dashboardRouter } from "./routes/dashboard.js";

const app = express();

app.use(cors({ origin: env.webOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));

// Archivos subidos (imagenes de articulos, etc) servidos como estaticos
app.use("/uploads", express.static(UPLOADS_DIR));

// Healthcheck
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "erp-api", time: new Date().toISOString() });
});

// Rutas
app.use("/api/auth", authRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/articles", articlesRouter);
app.use("/api/brands", brandsRouter);
app.use("/api/rubros", rubrosRouter);
app.use("/api/barcodes", barcodesRouter);
app.use("/api/serials", serialsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/units", unitsRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/stock", stockRouter);
app.use("/api/timbrados", timbradosRouter);
app.use("/api/puntos-expedicion", puntosExpedicionRouter);
app.use("/api/persons", personsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/purchases", purchasesRouter);
app.use("/api/price-lists", priceListsRouter);
app.use("/api/article-prices", articlePricesRouter);
app.use("/api/sales", salesRouter);
app.use("/api/cobros", cobrosRouter);
app.use("/api/cuenta-cliente", cuentaClienteRouter);
app.use("/api/cuenta-proveedor", cuentaProveedorRouter);
app.use("/api/pagos", pagosRouter);
app.use("/api/cheques", chequesRouter);
app.use("/api/notas-credito", notasCreditoVentaRouter);
app.use("/api/notas-credito-compra", notasCreditoCompraRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/users", usersRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/contabilidad", contabilidadRouter);
app.use("/api/presupuestos", presupuestosRouter);
app.use("/api/dashboard", dashboardRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// Manejo de errores
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Datos invalidos", detalles: err.issues });
    }
    if (err instanceof MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE" ? "La imagen supera el tamano maximo (5 MB)" : "Error al subir el archivo";
      return res.status(400).json({ error: msg });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    // Errores conocidos de Prisma -> mensajes amigables
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        const campos = (err.meta?.target as string[] | undefined)?.join(", ");
        return res
          .status(409)
          .json({ error: `Ya existe un registro con ese valor unico${campos ? ` (${campos})` : ""}` });
      }
      if (err.code === "P2025") {
        return res.status(404).json({ error: "Registro no encontrado" });
      }
      if (err.code === "P2003") {
        return res.status(409).json({ error: "No se puede completar: hay registros relacionados" });
      }
    }
    console.error(err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
);

app.listen(env.port, () => {
  console.log(`API escuchando en http://localhost:${env.port}`);
  console.log(`Health: http://localhost:${env.port}/api/health`);
});
