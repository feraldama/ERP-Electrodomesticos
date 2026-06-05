"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-7 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-xl font-bold text-white">
            E
          </div>
          <h1 className="text-lg font-semibold text-foreground">ERP Electrodomesticos</h1>
          <p className="mt-1 text-sm text-slate-500">Electronicos &middot; Muebles</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <Field label="Usuario" htmlFor="username" required>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </Field>
          <Field label="Contrasena" htmlFor="password" required>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        </div>

        <Button type="submit" loading={loading} className="mt-6 w-full">
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>

        <p className="mt-4 text-center text-xs text-slate-400">admin / admin123</p>
      </form>
    </div>
  );
}
