"use client";

import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
  /** Si hay cambios sin guardar: pide confirmacion al cerrar por click-afuera o Escape. */
  confirmClose?: boolean;
}

// Modal sobre Radix Dialog: foco atrapado, cierre con Escape/overlay y accesibilidad.
export function Modal({ open, onClose, title, children, footer, size = "md", confirmClose }: ModalProps) {
  const maxW = size === "lg" ? "max-w-2xl" : "max-w-lg";
  const contentRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  // Al abrir, enfoca el primer campo del form (no el boton de cerrar, que Radix toma por defecto)
  // para poder empezar a cargar sin tener que clickear con el mouse.
  function focusFirstField(e: Event) {
    const first = contentRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    if (first) {
      e.preventDefault();
      first.focus();
    }
  }

  // Evita perder datos por un click-afuera o Escape accidental cuando hay cambios sin guardar.
  // Bloquea el cierre nativo y pide confirmacion con el dialogo de la app (no window.confirm).
  function guardDismiss(e: Event) {
    if (!confirmClose) return;
    e.preventDefault();
    confirm({
      title: "Cambios sin guardar",
      description: "Si cerras se perderan los cambios que hiciste. ¿Cerrar de todos modos?",
      confirmText: "Cerrar sin guardar",
      cancelText: "Seguir editando",
      danger: true,
    }).then((ok) => {
      if (ok) onClose();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          ref={contentRef}
          onOpenAutoFocus={focusFirstField}
          onPointerDownOutside={guardDismiss}
          onEscapeKeyDown={guardDismiss}
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-[8%] z-50 w-[95vw] -translate-x-1/2 rounded-2xl bg-white shadow-xl animate-zoom-in",
            maxW
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <Dialog.Title className="text-base font-semibold text-foreground">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar"
              className="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
