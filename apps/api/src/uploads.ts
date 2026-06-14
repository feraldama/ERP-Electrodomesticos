import path from "node:path";
import fs from "node:fs";

// Directorio raiz para archivos subidos (imagenes de articulos, etc).
// Se ubica en la raiz del paquete api (cwd al ejecutar dev o start).
// Esta ignorado en git (.gitignore -> uploads/).
export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
