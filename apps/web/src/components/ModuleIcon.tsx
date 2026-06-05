import {
  Boxes,
  ShoppingCart,
  ReceiptText,
  Wallet,
  Calculator,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

// Icono por codigo de modulo (lucide, set consistente)
const MAP: Record<string, LucideIcon> = {
  STK: Boxes,
  COM: ShoppingCart,
  VEN: ReceiptText,
  FIN: Wallet,
  CON: Calculator,
};

export function moduleIcon(codigo: string): LucideIcon {
  return MAP[codigo] ?? LayoutGrid;
}

export function ModuleIcon({ codigo, className }: { codigo: string; className?: string }) {
  const Icon = moduleIcon(codigo);
  return <Icon className={className} strokeWidth={1.8} />;
}
