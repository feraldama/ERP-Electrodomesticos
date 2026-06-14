import "dotenv/config";

const isProd = process.env.NODE_ENV === "production";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

// JWT_SECRET: en desarrollo permitimos un fallback comodo, pero en produccion
// es obligatorio y debe ser robusto (no el placeholder, >=16 chars). Asi un
// deploy sin secret configurado FALLA al arrancar en vez de firmar con un valor conocido.
const WEAK_JWT_SECRETS = new Set(["dev-secret", "cambia-esto-por-un-secreto-largo-y-aleatorio", ""]);
const jwtSecret = process.env.JWT_SECRET ?? (isProd ? "" : "dev-secret");
if (isProd && (WEAK_JWT_SECRETS.has(jwtSecret) || jwtSecret.length < 16)) {
  throw new Error("JWT_SECRET es obligatorio y debe ser robusto (>=16 caracteres) en produccion");
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
};
