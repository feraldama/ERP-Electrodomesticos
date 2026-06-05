import { forwardRef } from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/cn";

// Estilo base de inputs (shadcn/ui adaptado a slate + verde)
const inputBase =
  "flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-slate-500";

export const Label = forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn("mb-1 block text-sm font-medium text-secondary", className)}
      {...props}
    />
  );
});

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

// Label siempre visible (guia UX: nunca usar placeholder como unica etiqueta)
export function Field({ label, htmlFor, error, required, children, className }: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputBase, className)} {...rest} />;
  }
);

// Select nativo estilizado: el chevron viene de la clase global .field-select (globals.css)
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(inputBase, "field-select cursor-pointer", className)} {...rest}>
        {children}
      </select>
    );
  }
);
