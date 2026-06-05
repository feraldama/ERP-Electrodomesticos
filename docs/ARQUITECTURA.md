# Arquitectura

## Vision general

Monorepo (pnpm workspaces) con dos aplicaciones y un modelo de datos compartido.

```
┌─────────────────┐      HTTP/JSON       ┌──────────────────┐      Prisma      ┌────────────┐
│   apps/web       │  ───────────────▶   │    apps/api       │  ─────────────▶  │ PostgreSQL │
│   Next.js        │   Bearer token +    │    Express + TS   │                  │   18       │
│   (puerto 3000)  │   X-Company-Id      │    (puerto 4000)  │                  │            │
└─────────────────┘                      └──────────────────┘                  └────────────┘
```

- **apps/web** — Next.js (App Router). Renderiza el dashboard modular y los programas.
  Guarda el JWT y la empresa activa en `localStorage`; los envia en cada request.
- **apps/api** — Express. Expone `/api/*`. Valida con Zod, autentica con JWT, accede a la
  base via Prisma.
- **PostgreSQL local** — instalado en `D:\Archivos de programa\PostgreSQL\18`, base
  `erp_electrodomesticos`.

## Multi-empresa

- El usuario puede pertenecer a varias empresas (`user_companies`).
- El frontend manda la empresa activa en el header `X-Company-Id`.
- Las tablas operativas (stock, compras, ventas, finanzas, contabilidad) llevan `companyId`.
- Los catalogos transversales (articulos, marcas, categorias, personas) son compartidos;
  lo que es por empresa es el **stock**, los **comprobantes** y las **cuentas**.

## Autenticacion y permisos

- Login devuelve un JWT firmado (`HS256`) con `userId`, `username`, `isSuperadmin`.
- `authRequired` valida el token en cada ruta protegida.
- Modelo de permisos: `Role` ↔ `Permission` (clave tipo `STK.articulos.editar`) ↔ `User`.
  El front puede ocultar programas segun permisos (a implementar en cada modulo).

## Catalogo de modulos y programas

- Los **modulos** (tarjetas grandes, imagen 1) y **programas** (tarjetas internas, imagen 2)
  viven en la base (`modules`, `programs`) y se sirven desde `/api/catalog`.
- Cada programa tiene un `codigo` (ej. `STKM001`), una `categoria`
  (MANTENIMIENTOS/MOVIMIENTOS/CONSULTAS/LISTADOS/PROCESOS) y una `ruta` del frontend.
- Agregar un programa nuevo = agregar una fila (via seed o un futuro mantenedor) + crear
  la pagina en `apps/web` en la ruta indicada.

## Contabilidad en background

El modulo de contabilidad no se acopla a los demas. Cada operacion relevante
(venta, compra, cobro, pago...) encola un registro en `accounting_events` con un `payload`.
Un proceso (a implementar: `CONP003 - Procesar eventos contables`) lee los eventos
pendientes y genera el `AccountingEntry` con sus lineas debe/haber, segun el plan de cuentas.
Asi "contabilidad trabaja en el background del resto de los modulos".

## Convenciones de codigo

- TypeScript en ambos lados.
- Backend: rutas en `apps/api/src/routes`, validacion con Zod, errores via `HttpError`.
- Frontend: cliente HTTP unico en `apps/web/src/lib/api.ts`, estado de sesion en
  `apps/web/src/lib/auth.tsx`.
- Montos: `Decimal(18,4)` en DB. Guaranies se muestran sin decimales en la UI.

## Diseno (skill ui-ux-pro-max)

Para decisiones de UI hay una skill instalada en `.claude/skills/ui-ux-pro-max`.
Recomendacion para este ERP: estilo **Data-Dense Dashboard** (slate + verde),
tipografia Fira Code / Fira Sans. Consultar con:

```
python .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --stack nextjs
```
