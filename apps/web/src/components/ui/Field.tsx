import { Children, forwardRef, isValidElement, type ReactNode } from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/cn";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/SearchSelect";

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
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputBase, className)} {...rest} />;
  }
);

// A partir de esta cantidad de opciones, el Select se vuelve un combobox con buscador
// (filtra por cualquier palabra). Por debajo se comporta como <select> nativo. Ver la
// regla en apps/web/CLAUDE.md ("Selects").
const SEARCH_THRESHOLD = 8;

// Aplana el contenido de una <option> a texto (soporta labels compuestos como
// `{codigo} - {nombre}`, que llegan como varios hijos).
function optionText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(optionText).join("");
  if (isValidElement(node)) return optionText((node.props as { children?: ReactNode }).children);
  return "";
}

// Extrae {value,label} de los hijos <option>/<optgroup> para alimentar al buscador.
function optionsFromChildren(children: ReactNode): SearchSelectOption[] {
  const out: SearchSelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as { value?: string | number; children?: ReactNode };
      out.push({ value: String(props.value ?? ""), label: optionText(props.children).trim() });
    } else if (child.type === "optgroup") {
      out.push(...optionsFromChildren((child.props as { children?: ReactNode }).children));
    }
  });
  return out;
}

// Select estilizado. Si la lista es larga (> SEARCH_THRESHOLD) se convierte
// automaticamente en un combobox con buscador; si no, es un <select> nativo (el chevron
// viene de la clase global .field-select en globals.css). Misma API en ambos casos:
// `value` + `onChange(e => e.target.value)` con hijos <option>.
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, value, onChange, onBlur, id, disabled, ...rest }, ref) {
    const options = optionsFromChildren(children);

    if (options.length > SEARCH_THRESHOLD) {
      return (
        <SearchSelect
          id={id}
          className={className}
          value={String(value ?? "")}
          options={options}
          disabled={disabled}
          onChange={(v) =>
            // Se emula el evento nativo: los call-sites solo leen e.target.value.
            onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>)
          }
          onBlur={onBlur ? () => onBlur({} as unknown as React.FocusEvent<HTMLSelectElement>) : undefined}
        />
      );
    }

    return (
      <select
        ref={ref}
        id={id}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        className={cn(inputBase, "field-select cursor-pointer", className)}
        {...rest}
      >
        {children}
      </select>
    );
  }
);
