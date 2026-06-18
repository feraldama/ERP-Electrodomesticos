"use client";

import { LibroIva } from "../_components/LibroIva";

export default function LibroVentasPage() {
  return (
    <LibroIva
      titulo="Libro IVA Ventas"
      codigo="CONC009"
      endpoint="/contabilidad/libro-ventas"
      contraparte="Cliente"
    />
  );
}
