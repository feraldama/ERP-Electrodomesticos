"use client";

import { PersonsManager } from "@/components/PersonsManager";

export default function ProveedoresPage() {
  return (
    <PersonsManager
      title="Proveedores"
      code="FINM003"
      subtitle="Personas con rol de proveedor"
      role="supplier"
    />
  );
}
