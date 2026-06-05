"use client";

import { PersonsManager } from "@/components/PersonsManager";

export default function ClientesPage() {
  return (
    <PersonsManager
      title="Clientes"
      code="FINM002"
      subtitle="Personas con rol de cliente"
      role="customer"
    />
  );
}
