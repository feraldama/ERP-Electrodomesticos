import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Al existir este archivo de config, Prisma deja de cargar el .env
// automaticamente. Lo cargamos nosotros para que env("DATABASE_URL")
// del schema se resuelva. Los comandos de prisma corren con cwd en apps/api.
loadEnv();

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    // Antes vivia en package.json#prisma.seed (deprecado en Prisma 7).
    seed: "tsx prisma/seed.ts",
  },
});
