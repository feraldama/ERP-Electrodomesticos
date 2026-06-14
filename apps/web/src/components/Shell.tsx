"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Boxes, ShoppingCart, ReceiptText, Wallet, Calculator, Shield, Lock, LogOut, Loader2, Menu, X, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Select } from "@/components/ui/Field";
import { MenuSearch, loadMenuItems, type MenuItem } from "@/components/MenuSearch";
import { PageTitle } from "@/components/PageTitle";

const NAV: Array<{ href: string; label: string; Icon: LucideIcon; codigo?: string }> = [
  { href: "/", label: "Inicio", Icon: Home },
  { href: "/modulo/STK", label: "Control de Stock", Icon: Boxes, codigo: "STK" },
  { href: "/modulo/COM", label: "Compras", Icon: ShoppingCart, codigo: "COM" },
  { href: "/modulo/VEN", label: "Ventas", Icon: ReceiptText, codigo: "VEN" },
  { href: "/modulo/FIN", label: "Finanzas", Icon: Wallet, codigo: "FIN" },
  { href: "/modulo/CON", label: "Contabilidad", Icon: Calculator, codigo: "CON" },
  { href: "/modulo/ADM", label: "Administracion", Icon: Shield, codigo: "ADM" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, companyId, selectCompany, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) loadMenuItems().then(setMenuItems);
  }, [user]);

  // En mobile, cerrar el drawer al navegar o con Escape.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const currentCompany = user.companies.find((c) => c.id === companyId) ?? user.companies[0];

  // Permisos: el superadmin ve todo; el resto, solo sus programas.
  const isSuper = user.isSuperadmin;
  const can = (codigo: string) => isSuper || user.permisos.includes(codigo);
  const catalogReady = menuItems.length > 0;
  const allowedModulos = new Set(menuItems.filter((it) => can(it.programaCodigo)).map((it) => it.moduloCodigo));
  const visibleNav = NAV.filter((n) => !n.codigo || !catalogReady || allowedModulos.has(n.codigo));

  // Guard: si la ruta actual es un programa que el usuario no tiene permitido, bloquea.
  const programaActual = menuItems.find((it) => pathname === it.ruta || pathname.startsWith(`${it.ruta}/`));
  const sinPermiso = catalogReady && !!programaActual && !can(programaActual.programaCodigo);

  return (
    <div className="flex min-h-screen">
      <PageTitle />

      {/* Backdrop del drawer (solo mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {/* Sidebar: fijo en desktop, drawer deslizable en mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-sidebar text-sidebar-text transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between gap-2 px-5 font-bold tracking-wide text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-accent text-sm">E</span>
            ERP
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menu"
            className="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {visibleNav.map((item, i) => {
            // Activo si es la ruta exacta o si la pantalla actual pertenece a ese modulo
            // (ej. estando en /stock/articulos se resalta "Control de Stock").
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  (!!item.codigo && programaActual?.moduloCodigo === item.codigo);
            return (
              <div key={item.href}>
                {i === 1 && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Modulos
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
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
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="cursor-pointer rounded-lg p-2 text-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <MenuSearch />
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm">
            {user.companies.length > 1 ? (
              <Select
                value={companyId ?? ""}
                onChange={(e) => selectCompany(Number(e.target.value))}
                className="h-9 w-36 sm:w-52"
              >
                {user.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombreFantasia ?? c.razonSocial}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="hidden font-semibold text-secondary md:inline">
                {currentCompany?.razonSocial}
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {user.nombre.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden font-medium text-foreground sm:inline">{user.nombre}</span>
            </div>
            <button
              onClick={logout}
              aria-label="Salir"
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {sinPermiso ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-slate-400">
                <Lock className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Sin permiso</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                No tenes acceso a esta pantalla. Pedile a un administrador que te asigne el permiso correspondiente.
              </p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
