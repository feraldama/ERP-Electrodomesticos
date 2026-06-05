import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { authRequired } from "../middleware/auth.js";
import { rucDesdeCedula } from "../services/ruc.js";

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

// Listado con busqueda y filtro por rol
personsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const role = req.query.role as string | undefined; // customer | supplier | employee

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { razonSocial: { contains: q, mode: "insensitive" } },
        { nroDoc: { contains: q, mode: "insensitive" } },
        { ruc: { contains: q, mode: "insensitive" } },
      ];
    }
    if (role === "customer") where.customer = { is: { activo: true } };
    if (role === "supplier") where.supplier = { is: { activo: true } };
    if (role === "employee") where.employee = { is: { activo: true } };

    const persons = await prisma.person.findMany({
      where,
      include: personInclude,
      orderBy: { razonSocial: "asc" },
      take: 300,
    });
    res.json(persons.map(serialize));
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
  asyncHandler(async (_req, res) => {
    const customers = await prisma.customer.findMany({
      where: { activo: true },
      include: { person: true },
      orderBy: { person: { razonSocial: "asc" } },
    });
    res.json(customers);
  })
);

// Proveedores activos (para Compras)
export const suppliersRouter = Router();
suppliersRouter.use(authRequired);
suppliersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const suppliers = await prisma.supplier.findMany({
      where: { activo: true },
      include: { person: true },
      orderBy: { person: { razonSocial: "asc" } },
    });
    res.json(suppliers);
  })
);
