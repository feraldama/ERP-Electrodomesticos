import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permission.js";
import { rucDesdeCedula } from "../services/ruc.js";
import { parseListParams, paginated, wantsPagination, buildWordSearch } from "../lib/listQuery.js";
import { diaContable, parseFechaDoc } from "../lib/fechas.js";

// /persons lo usan los 4 programas de personas (personas/clientes/proveedores/trabajadores).
const PERSON_PROGRAMS = ["FINM001", "FINM002", "FINM003", "FINM004"];

// Si no se especifica RUC y el documento es numerico, lo calculamos (cedula -> RUC con DV).
function resolverRuc(ruc: string | null | undefined, nroDoc: string | undefined): string | null {
  if (ruc && ruc.trim()) return ruc.trim();
  if (nroDoc && /^\d+$/.test(nroDoc)) return rucDesdeCedula(nroDoc);
  return null;
}

export const personsRouter = Router();
personsRouter.use(authRequired);

const personInclude = { customer: true, supplier: true, employee: true } as const;

// Persona + flags de rol para el frontend
function serialize(p: {
  customer: unknown;
  supplier: unknown;
  employee: unknown;
} & Record<string, unknown>) {
  const customer = p.customer as { activo: boolean } | null;
  const supplier = p.supplier as { activo: boolean } | null;
  const employee = p.employee as { activo: boolean } | null;
  return {
    ...p,
    esCliente: !!customer?.activo,
    esProveedor: !!supplier?.activo,
    esEmpleado: !!employee?.activo,
  };
}

const personSchema = z.object({
  tipoDoc: z.enum(["CI", "RUC", "PASAPORTE", "OTRO"]).default("CI"),
  nroDoc: z.string().min(1),
  ruc: z.string().optional().nullable(),
  razonSocial: z.string().min(1),
  nombreFantasia: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  latitud: z.number().optional().nullable(),
  longitud: z.number().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  esCliente: z.boolean().optional(),
  esProveedor: z.boolean().optional(),
  esEmpleado: z.boolean().optional(),
  limiteCredito: z.number().nonnegative().optional(),
  diasCredito: z.number().int().nonnegative().optional(),
  cargo: z.string().optional().nullable(),
  salario: z.number().nonnegative().optional().nullable(),
});

const personsSortable = {
  nombre: "razonSocial",
  documento: "nroDoc",
} as const;

// Listado con busqueda y filtro por rol. Paginacion opt-in (ver lib/listQuery).
personsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const role = req.query.role as string | undefined; // customer | supplier | employee

    const where: Record<string, unknown> = {
      ...buildWordSearch(q, ["razonSocial", "nroDoc", "ruc"]),
    };
    if (role === "customer") where.customer = { is: { activo: true } };
    if (role === "supplier") where.supplier = { is: { activo: true } };
    if (role === "employee") where.employee = { is: { activo: true } };

    const { skip, take, orderBy, page, pageSize } = parseListParams(req.query, {
      sortable: personsSortable,
      defaultSort: "nombre",
    });

    if (!wantsPagination(req.query)) {
      const persons = await prisma.person.findMany({ where, include: personInclude, orderBy, take: 300 });
      return res.json(persons.map(serialize));
    }

    const [items, total] = await prisma.$transaction([
      prisma.person.findMany({ where, include: personInclude, orderBy, skip, take }),
      prisma.person.count({ where }),
    ]);
    res.json(paginated(items.map(serialize), total, page, pageSize));
  })
);

personsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const person = await prisma.person.findUnique({
      where: { id: Number(req.params.id) },
      include: personInclude,
    });
    if (!person) throw new HttpError(404, "Persona no encontrada");
    res.json(serialize(person));
  })
);

personsRouter.post(
  "/",
  requireAnyPermission(PERSON_PROGRAMS),
  asyncHandler(async (req, res) => {
    const d = personSchema.parse(req.body);
    const person = await prisma.person.create({
      data: {
        tipoDoc: d.tipoDoc,
        nroDoc: d.nroDoc,
        ruc: resolverRuc(d.ruc, d.nroDoc),
        razonSocial: d.razonSocial,
        nombreFantasia: d.nombreFantasia ?? null,
        direccion: d.direccion ?? null,
        latitud: d.latitud ?? null,
        longitud: d.longitud ?? null,
        telefono: d.telefono ?? null,
        email: d.email ?? null,
        customer: d.esCliente
          ? { create: { limiteCredito: d.limiteCredito ?? 0, diasCredito: d.diasCredito ?? 0 } }
          : undefined,
        supplier: d.esProveedor ? { create: {} } : undefined,
        employee: d.esEmpleado ? { create: { cargo: d.cargo ?? null, salario: d.salario ?? null } } : undefined,
      },
      include: personInclude,
    });
    res.status(201).json(serialize(person));
  })
);

personsRouter.put(
  "/:id",
  requireAnyPermission(PERSON_PROGRAMS),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const d = personSchema.partial().parse(req.body);

    await prisma.$transaction(async (tx) => {
      const rucUpdate =
        d.ruc !== undefined || d.nroDoc !== undefined ? resolverRuc(d.ruc, d.nroDoc) : undefined;
      await tx.person.update({
        where: { id },
        data: {
          tipoDoc: d.tipoDoc,
          nroDoc: d.nroDoc,
          ruc: rucUpdate,
          razonSocial: d.razonSocial,
          nombreFantasia: d.nombreFantasia,
          direccion: d.direccion,
          latitud: d.latitud,
          longitud: d.longitud,
          telefono: d.telefono,
          email: d.email,
        },
      });

      // Roles: upsert si esta activo, soft-desactivar si se quita (preserva FKs)
      if (d.esCliente !== undefined) {
        if (d.esCliente) {
          await tx.customer.upsert({
            where: { personId: id },
            create: { personId: id, limiteCredito: d.limiteCredito ?? 0, diasCredito: d.diasCredito ?? 0, activo: true },
            update: { limiteCredito: d.limiteCredito, diasCredito: d.diasCredito, activo: true },
          });
        } else {
          await tx.customer.updateMany({ where: { personId: id }, data: { activo: false } });
        }
      }
      if (d.esProveedor !== undefined) {
        if (d.esProveedor) {
          await tx.supplier.upsert({
            where: { personId: id },
            create: { personId: id, activo: true },
            update: { activo: true },
          });
        } else {
          await tx.supplier.updateMany({ where: { personId: id }, data: { activo: false } });
        }
      }
      if (d.esEmpleado !== undefined) {
        if (d.esEmpleado) {
          await tx.employee.upsert({
            where: { personId: id },
            create: { personId: id, cargo: d.cargo ?? null, salario: d.salario ?? null, activo: true },
            update: { cargo: d.cargo, salario: d.salario, activo: true },
          });
        } else {
          await tx.employee.updateMany({ where: { personId: id }, data: { activo: false } });
        }
      }
    });

    const updated = await prisma.person.findUnique({ where: { id }, include: personInclude });
    res.json(serialize(updated!));
  })
);

// --- Selects para otros modulos ---

// Clientes activos (para Ventas)
export const customersRouter = Router();
customersRouter.use(authRequired);
customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const customers = await prisma.customer.findMany({
      where: {
        activo: true,
        ...buildWordSearch(q, ["person.razonSocial", "person.nroDoc", "person.ruc"]),
      },
      include: { person: true },
      orderBy: { person: { razonSocial: "asc" } },
      take: 50,
    });
    res.json(customers);
  })
);

// Proveedores activos (para Compras)
export const suppliersRouter = Router();
suppliersRouter.use(authRequired);
suppliersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const suppliers = await prisma.supplier.findMany({
      where: {
        activo: true,
        ...buildWordSearch(q, ["person.razonSocial", "person.nroDoc", "person.ruc"]),
      },
      include: { person: true },
      orderBy: { person: { razonSocial: "asc" } },
      take: 50,
    });
    res.json(suppliers);
  })
);

// Timbrados del proveedor. Por defecto solo los vigentes (no vencidos a hoy), que
// son los que se ofrecen al cargar una compra.
suppliersRouter.get(
  "/:id/timbrados",
  asyncHandler(async (req, res) => {
    const supplierId = Number(req.params.id);
    const todos = req.query.todos === "1";
    const timbrados = await prisma.supplierTimbrado.findMany({
      where: {
        supplierId,
        activo: true,
        ...(todos ? {} : { fechaVencimiento: { gte: diaContable(new Date()) } }),
      },
      orderBy: [{ fechaVencimiento: "desc" }, { numero: "asc" }],
    });
    res.json(timbrados);
  })
);

const codigo3 = z.string().regex(/^\d{1,3}$/, "Debe tener hasta 3 digitos").transform((v) => v.padStart(3, "0"));

const supplierTimbradoSchema = z
  .object({
    numero: z.string().trim().regex(/^\d{8}$/, "El timbrado debe tener 8 digitos"),
    tipoDocumento: z.enum(["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "REMISION"]).default("FACTURA"),
    establecimiento: codigo3,
    puntoExpedicion: codigo3,
    fechaInicio: z.string().min(1),
    fechaVencimiento: z.string().min(1),
    numeroInicial: z.number().int().positive().optional().nullable(),
    numeroFinal: z.number().int().positive().optional().nullable(),
    tipo: z.enum(["PREIMPRESO", "AUTOIMPRESOR", "ELECTRONICO"]).optional().nullable(),
  })
  .refine((d) => !d.numeroInicial || !d.numeroFinal || d.numeroFinal >= d.numeroInicial, {
    message: "El numero final debe ser mayor o igual al inicial",
    path: ["numeroFinal"],
  });

suppliersRouter.post(
  "/:id/timbrados",
  requireAnyPermission(["COMI001", "FINM003"]),
  asyncHandler(async (req, res) => {
    const supplierId = Number(req.params.id);
    const d = supplierTimbradoSchema.parse(req.body);
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new HttpError(404, "Proveedor no encontrado");

    const fechaInicio = parseFechaDoc(d.fechaInicio);
    const fechaVencimiento = parseFechaDoc(d.fechaVencimiento);
    if (fechaVencimiento < fechaInicio) throw new HttpError(400, "La fecha de vencimiento es anterior a la inicial");

    const dup = await prisma.supplierTimbrado.findFirst({
      where: {
        supplierId,
        numero: d.numero,
        tipoDocumento: d.tipoDocumento,
        establecimiento: d.establecimiento,
        puntoExpedicion: d.puntoExpedicion,
      },
    });
    if (dup) {
      throw new HttpError(409, `El timbrado ${d.numero} (${d.establecimiento}-${d.puntoExpedicion}) ya esta registrado para este proveedor`);
    }

    const t = await prisma.supplierTimbrado.create({
      data: {
        supplierId,
        numero: d.numero,
        tipoDocumento: d.tipoDocumento,
        establecimiento: d.establecimiento,
        puntoExpedicion: d.puntoExpedicion,
        fechaInicio,
        fechaVencimiento,
        numeroInicial: d.numeroInicial ?? null,
        numeroFinal: d.numeroFinal ?? null,
        tipo: d.tipo ?? null,
      },
    });
    res.status(201).json(t);
  })
);
