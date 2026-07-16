# Convenciones del frontend (web)

## Selects (menús desplegables)

**Regla obligatoria:** para cualquier menú desplegable usar el componente `Select` de
[src/components/ui/Field.tsx](src/components/ui/Field.tsx) (o `SelectWithAdd`, que lo
envuelve). **No** usar `<select>` nativo suelto.

`Select` decide solo su presentación según la cantidad de opciones:

- **Lista larga** (más de `SEARCH_THRESHOLD` = 8 opciones): se convierte
  automáticamente en un **combobox con buscador** ([SearchSelect](src/components/ui/SearchSelect.tsx)),
  que filtra **por cualquier palabra** sin importar el orden (misma semántica que
  `buildWordSearch` del backend: cada palabra escrita debe aparecer en el label).
- **Lista corta** (≤ 8): se comporta como `<select>` nativo estilizado.

Así los selects largos (plan de cuentas, marca, categoría, rubro, proveedor, etc.) traen
buscador sin configuración, y los enums cortos (Contado/Crédito, tipo de IVA, método de
pago…) quedan simples.

### Cómo usarlo

La API es la misma en ambos modos: `value` controlado + `onChange` que lee
`e.target.value`, con hijos `<option>`.

```tsx
import { Select } from "@/components/ui/Field";

<Select id="cuenta" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
  <option value="">— Sin cuenta —</option>
  {cuentas.map((c) => (
    <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>
  ))}
</Select>
```

- El label puede ser compuesto (`{c.codigo} - {c.nombre}`); el buscador lo aplana a texto
  para filtrar, así que se busca sobre todo lo visible.
- En `CrudManager`, un `FieldDef` con `type: "select"` ya pasa por `Select`: solo definir
  `options` y, si hace falta, `numeric`. No hay flag extra para el buscador.
- El dropdown se renderiza en un portal (`document.body`) para no ser recortado por el
  overflow de un Modal; funciona igual dentro y fuera de modales.
