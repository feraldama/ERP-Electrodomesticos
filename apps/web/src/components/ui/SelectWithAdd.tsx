"use client";

import { Plus } from "lucide-react";
import { Select } from "@/components/ui/Field";

interface SelectWithAddProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Abre el flujo de creacion (modal). */
  onAdd: () => void;
  /** Texto del boton para accesibilidad. */
  addTitle?: string;
}

// Select nativo + boton "+" a la derecha para crear una opcion nueva sin salir del form.
export function SelectWithAdd({ onAdd, addTitle = "Crear nuevo", children, ...rest }: SelectWithAddProps) {
  return (
    <div className="flex items-center gap-2">
      <Select className="flex-1" {...rest}>
        {children}
      </Select>
      <button
        type="button"
        onClick={onAdd}
        aria-label={addTitle}
        title={addTitle}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-secondary transition-colors hover:border-primary hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
