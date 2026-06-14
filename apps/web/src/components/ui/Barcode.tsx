"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface Props {
  value: string;
  height?: number;
  displayValue?: boolean;
}

// Renderiza un codigo de barra escaneable. Usa EAN13 si son 13 digitos validos,
// si no CODE128 (acepta letras/numeros).
export function Barcode({ value, height = 38, displayValue = true }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const opts = { height, displayValue, fontSize: 12, margin: 4, width: 1.5 } as const;
    const isEan13 = /^\d{13}$/.test(value);
    try {
      JsBarcode(ref.current, value, { format: isEan13 ? "EAN13" : "CODE128", ...opts });
    } catch {
      try {
        JsBarcode(ref.current, value, { format: "CODE128", ...opts });
      } catch {
        /* valor no representable: se deja vacio */
      }
    }
  }, [value, height, displayValue]);

  return <svg ref={ref} className="max-w-full" />;
}
