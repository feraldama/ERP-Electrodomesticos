"use client";

import { LibroIva } from "../_components/LibroIva";

export default function LibroComprasPage() {
  return (
    <LibroIva
      titulo="Libro IVA Compras"
      codigo="CONC008"
      endpoint="/contabilidad/libro-compras"
      contraparte="Proveedor"
    />
  );
}
