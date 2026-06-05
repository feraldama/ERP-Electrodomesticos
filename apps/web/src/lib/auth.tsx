"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getCompanyId, setCompanyId, setToken } from "./api";
import type { AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  companyId: number | null;
  selectCompany: (id: number) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyState] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    api<AuthUser>("/auth/me")
      .then((u) => {
        if (!mounted) return;
        setUser(u);
        const stored = getCompanyId();
        // Solo usamos el companyId guardado si todavia pertenece al usuario
        const storedValido = u.companies.some((c) => c.id === stored) ? stored : null;
        const initial = storedValido ?? u.companies[0]?.id ?? null;
        if (initial) {
          setCompanyId(initial);
          setCompanyState(initial);
        }
      })
      .catch(() => setUser(null))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  async function login(username: string, password: string) {
    const data = await api<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    setUser(data.user);
    const first = data.user.companies[0]?.id ?? null;
    if (first) {
      setCompanyId(first);
      setCompanyState(first);
    }
  }

  function logout() {
    setToken(null);
    setCompanyId(null);
    setUser(null);
    window.location.href = "/login";
  }

  function selectCompany(id: number) {
    setCompanyId(id);
    setCompanyState(id);
  }

  return (
    <AuthContext.Provider value={{ user, loading, companyId, selectCompany, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
