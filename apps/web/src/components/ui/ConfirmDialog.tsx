"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/Button";

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Resalta la accion como destructiva (rojo). */
  danger?: boolean;
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Confirmacion reutilizable sobre Radix Dialog (role=alertdialog), con el mismo
// estilo/animacion que el resto. Devuelve una promesa: true = confirmar, false = cancelar.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const resolverRef = useRef<(value: boolean) => void>(() => {});
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((options = {}) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const finish = useCallback((result: boolean) => {
    setOpen(false);
    resolverRef.current(result);
  }, []);

  const {
    title = "Confirmar accion",
    description,
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    danger,
  } = opts;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog.Root open={open} onOpenChange={(o) => !o && finish(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm animate-fade-in" />
          <Dialog.Content
            role="alertdialog"
            aria-describedby={undefined}
            // Por seguridad, el foco arranca en "Cancelar", no en la accion.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              cancelRef.current?.focus();
            }}
            className="fixed left-1/2 top-1/2 z-[70] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl animate-zoom-in"
          >
            <Dialog.Title className="text-base font-semibold text-foreground">{title}</Dialog.Title>
            {description && <p className="mt-2 text-sm text-slate-500">{description}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button ref={cancelRef} variant="secondary" type="button" onClick={() => finish(false)}>
                {cancelText}
              </Button>
              <Button variant={danger ? "danger" : "primary"} type="button" onClick={() => finish(true)}>
                {confirmText}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ConfirmProvider");
  return ctx;
}
