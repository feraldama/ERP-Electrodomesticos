"use client";

import { PersonsManager } from "@/components/PersonsManager";

export default function TrabajadoresPage() {
  return (
    <PersonsManager
      title="Trabajadores"
      code="FINM004"
      subtitle="Personas con rol de empleado"
      role="employee"
    />
  );
}
