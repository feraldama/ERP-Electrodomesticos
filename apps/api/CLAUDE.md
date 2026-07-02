# Convenciones del backend (API)

## Buscadores (parámetro `q`)

**Regla obligatoria:** todo endpoint de listado/autocomplete que acepte un texto de
búsqueda (`req.query.q`) DEBE usar el helper `buildWordSearch` de
[src/lib/listQuery.ts](src/lib/listQuery.ts). No escribir `{ contains: q }` a mano.

Motivo: `buildWordSearch` divide la búsqueda en palabras y exige que **cada palabra**
aparezca (contains, case-insensitive) en alguno de los campos, sin importar el orden.
Así "ropero uru" encuentra "Ropero 2 puertas Uruguayo". Un `contains` con la frase
completa solo matchea si las palabras están juntas y en ese orden.

### Cómo usarlo

```ts
import { buildWordSearch } from "../lib/listQuery.js";

const q = (req.query.q as string | undefined)?.trim();

// Campos simples: se mezcla con spread (devuelve {} si no hay q)
const where = {
  companyId: req.companyId,
  ...buildWordSearch(q, ["codigo", "descripcion"]),
};

// Relaciones anidadas: usar ruta con puntos
const where = {
  companyId: req.companyId,
  ...buildWordSearch(q, ["numero", "customer.person.razonSocial"]),
};
```

- Pasar en `fields` TODAS las columnas por las que debería encontrarse el registro
  (código, descripción, nombre, documento, y relaciones relevantes).
- No combinar con un `OR`/`contains` manual: el helper ya arma el `AND` de `OR`s.
- Devuelve `{}` cuando no hay búsqueda, así que siempre es seguro hacerle spread.
