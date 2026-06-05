export function StatusBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        activo ? "bg-accent/10 text-accent" : "bg-slate-100 text-slate-500"
      }`}
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}
