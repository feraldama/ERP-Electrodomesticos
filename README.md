# ERP Electrodomesticos

ERP modular para una empresa de venta de electrodomesticos, electronicos y muebles.
Inspirado en el estilo de Century Shift: modulos en tarjetas y, dentro de cada modulo,
"programas" (cada uno con su codigo, ej. `STKM009`).

## Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **ORM / DB:** Prisma + PostgreSQL
- **Monorepo:** pnpm workspaces

## Modulos

1. **Control de Stock** — articulos, codigos de barra, movimientos entre depositos, costos, ultimas compras, series/IMEI.
2. **Compras** — carga de compras, notas de credito recibidas, devoluciones, cuenta corriente proveedor.
3. **Ventas** — facturacion contado y credito (pagare + cuotas), SIFEN (facturacion electronica Paraguay).
4. **Finanzas** — personas (cliente/proveedor/empleado), cobro de cuotas, pago a proveedores, cheques, caja.
5. **Contabilidad** (posterior) — asientos automaticos generados en background por el resto de los modulos.

## Caracteristicas transversales

- **Multi-empresa**: todas las operaciones se filtran por empresa.
- **Fiscal Paraguay**: IVA 10%/5%, Guaranies, timbrado DNIT, facturacion electronica SIFEN/e-Kuatia.
- **Auth**: usuarios, roles y permisos.

## Estructura

```
.
├── apps/
│   ├── api/        # Express + Prisma (backend)
│   └── web/        # Next.js (frontend)
├── packages/       # codigo compartido (a futuro)
├── docs/           # arquitectura y modelo de datos
└── docker-compose.yml
```

## Puesta en marcha

### 1. Base de datos

Ya existe un PostgreSQL 18 local (`D:\Archivos de programa\PostgreSQL\18`) y la base
`erp_electrodomesticos` ya fue creada. Credenciales por defecto: `postgres / 12345`.

> Alternativa: `pnpm db:up` levanta un Postgres en Docker (puerto **5433**).
> En ese caso ajusta el puerto en `apps/api/.env`.

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Configurar entorno

Copia `apps/api/.env.example` a `apps/api/.env` (ya viene apuntando al Postgres local).

### 4. Migrar y poblar

```bash
pnpm db:migrate    # crea las tablas
pnpm db:seed       # carga modulos, programas, roles y un usuario admin
```

### 5. Levantar todo

```bash
pnpm dev           # api (4000) + web (3000) en paralelo
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/health

Usuario inicial (tras el seed): **admin / admin123**.

## Scripts utiles

| Script             | Que hace                                  |
|--------------------|-------------------------------------------|
| `pnpm dev`         | Levanta api + web                         |
| `pnpm dev:api`     | Solo el backend                           |
| `pnpm dev:web`     | Solo el frontend                          |
| `pnpm db:migrate`  | Aplica migraciones Prisma                 |
| `pnpm db:seed`     | Pobla datos iniciales                     |
| `pnpm db:studio`   | Abre Prisma Studio                        |

Ver [`docs/`](./docs) para la arquitectura y el modelo de datos en detalle.
