"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Home, Boxes, ShoppingCart, ReceiptText, Wallet, Calculator, LogOut, Loader2, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";

const NAV: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: "/", label: "Inicio", Icon: Home },
  { href: "/modulo/STK", label: "Control de Stock", Icon: Boxes },
  { href: "/modulo/COM", label: "Compras", Icon: ShoppingCart },
  { href: "/modulo/VEN", label: "Ventas", Icon: ReceiptText },
  { href: "/modulo/FIN", label: "Finanzas", Icon: Wallet },
  { href: "/modulo/CON", label: "Contabilidad", Icon: Calculator },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, companyId, selectCompany, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const currentCompany = user.companies.find((c) => c.id === companyId) ?? user.companies[0];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col bg-sidebar text-sidebar-text">
        <div className="flex h-14 items-center gap-2 px-5 font-bold tracking-wide text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-accent text-sm">E</span>
          ERP
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV.map((item, i) => {
            const active = pathname === item.href;
            return (
              <div key={item.href}>
                {i === 1 && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Modulos
                  </p>
                )}
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200 ${
                    active
                      ? "bg-sidebar-active font-medium text-white"
                      : "hover:bg-sidebar-hover hover:text-white"
                  }`}
                >
                  <item.Icon className={`h-5 w-5 shrink-0 ${active ? "text-accent" : ""}`} strokeWidth={1.8} />
                  {item.label}
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-xs text-slate-500">
          ERP Electrodomesticos &middot; v0.1
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-white px-6">
          <div className="text-sm font-semibold text-secondary">{currentCompany?.razonSocial}</div>
          <div className="flex items-center gap-4 text-sm">
            {user.companies.length > 1 && (
              <select
                value={companyId ?? ""}
                onChange={(e) => selectCompany(Number(e.target.value))}
                className="cursor-pointer rounded-lg border border-border bg-white px-2 py-1.5 text-foreground outline-none focus:ring-2 focus:ring-primary/20"
              >
                {user.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombreFantasia ?? c.razonSocial}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {user.nombre.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden font-medium text-foreground sm:inline">{user.nombre}</span>
            </div>
            <button
              onClick={logout}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-secondary transition-colors hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
