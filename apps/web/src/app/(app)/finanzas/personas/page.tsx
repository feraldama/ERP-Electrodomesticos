"use client";

import { PersonsManager } from "@/components/PersonsManager";

export default function PersonasPage() {
  return (
    <PersonsManager
      title="Administrar personas"
      code="FINM001"
      subtitle="Clientes, proveedores y trabajadores (una persona puede tener varios roles)"
      role={null}
    />
  );
}
