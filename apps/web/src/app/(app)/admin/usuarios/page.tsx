"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { Plus, Pencil } from "lucide-react";

interface UserRow {
  id: number;
  username: string;
  nombre: string;
  activo: boolean;
  isSuperadmin: boolean;
  roleIds: number[];
  companyIds: number[];
}
interface RoleLite {
  id: number;
  nombre: string;
}
interface CompanyLite {
  id: number;
  razonSocial: string;
  nombreFantasia: string | null;
}

export default function UsuariosPage() {
  const { notify } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [companies, setCompanies] = useState<CompanyLite[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [username, setUsername] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [activo, setActivo] = useState(true);
  const [roleIds, setRoleIds] = useState<Set<number>>(new Set());
  const [companyIds, setCompanyIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setUsers(await api<UserRow[]>("/users"));
    } catch {
      setUsers([]);
    }
  }
  useEffect(() => {
    load();
    api<RoleLite[]>("/roles").then(setRoles).catch(() => setRoles([]));
    api<CompanyLite[]>("/companies").then(setCompanies).catch(() => setCompanies([]));
  }, []);

  function nuevo() {
    setEditing(null);
    setUsername("");
    setNombre("");
    setPassword("");
    setActivo(true);
    setRoleIds(new Set());
    setCompanyIds(new Set(companies.map((c) => c.id))); // por defecto, todas las empresas
    setOpen(true);
  }
  function editar(u: UserRow) {
    setEditing(u);
    setUsername(u.username);
    setNombre(u.nombre);
    setPassword("");
    setActivo(u.activo);
    setRoleIds(new Set(u.roleIds));
    setCompanyIds(new Set(u.companyIds));
    setOpen(true);
  }
  function toggleRole(id: number) {
    setRoleIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleCompany(id: number) {
    setCompanyIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function guardar() {
    if (!nombre.trim()) return notify("error", "Indica el nombre");
    if (!editing) {
      if (!username.trim()) return notify("error", "Indica el usuario");
      if (password.length < 4) return notify("error", "La contrasena debe tener al menos 4 caracteres");
    }
    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, unknown> = { nombre: nombre.trim(), activo, roleIds: [...roleIds], companyIds: [...companyIds] };
        if (password) body.password = password;
        await api(`/users/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        notify("success", "Usuario actualizado");
      } else {
        await api("/users", {
          method: "POST",
          body: JSON.stringify({ username: username.trim(), nombre: nombre.trim(), password, activo, roleIds: [...roleIds], companyIds: [...companyIds] }),
        });
        notify("success", "Usuario creado");
      }
      setOpen(false);
      load();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const roleName = (id: number) => roles.find((r) => r.id === id)?.nombre ?? `#${id}`;

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Usuarios</h1>
            <span className="font-mono text-xs font-semibold text-slate-400">ADMM002</span>
          </div>
          <p className="text-sm text-slate-500">Administra usuarios y los roles que tienen asignados.</p>
        </div>
        <Button onClick={nuevo}><Plus className="h-4 w-4" /> Nuevo usuario</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 text-center font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No hay usuarios.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 text-foreground">
                    {u.nombre}
                    {u.isSuperadmin && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">superadmin</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary">{u.username}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {u.isSuperadmin ? "Todos (superadmin)" : u.roleIds.length ? u.roleIds.map(roleName).join(", ") : <span className="text-slate-400">sin roles</span>}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge activo={u.activo} /></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => editar(u)} aria-label="Editar"
                      className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-muted hover:text-primary">
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar ${editing.nombre}` : "Nuevo usuario"}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={guardar} loading={saving}>{editing ? "Guardar" : "Crear"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Usuario" htmlFor="username" required>
            <Input id="username" value={username} disabled={!!editing} onChange={(e) => setUsername(e.target.value)} placeholder="ej jperez" />
          </Field>
          <Field label="Nombre" htmlFor="nombre" required>
            <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Field>
          <Field label={editing ? "Nueva contrasena (opcional)" : "Contrasena"} htmlFor="pass" required={!editing}>
            <Input id="pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editing ? "Dejar vacio para no cambiar" : ""} />
          </Field>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
              Activo
            </label>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-secondary">Roles</p>
          {editing?.isSuperadmin ? (
            <p className="text-xs text-slate-400">Este usuario es superadmin: tiene acceso total sin importar los roles.</p>
          ) : roles.length === 0 ? (
            <p className="text-xs text-slate-400">No hay roles definidos. Crealos en Roles y permisos.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {roles.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
                  <input type="checkbox" checked={roleIds.has(r.id)} onChange={() => toggleRole(r.id)} className="h-4 w-4 cursor-pointer accent-accent" />
                  {r.nombre}
                </label>
              ))}
            </div>
          )}
        </div>

        {!editing?.isSuperadmin && companies.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-secondary">Empresas a las que accede</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {companies.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-secondary">
                  <input type="checkbox" checked={companyIds.has(c.id)} onChange={() => toggleCompany(c.id)} className="h-4 w-4 cursor-pointer accent-accent" />
                  {c.nombreFantasia ?? c.razonSocial}
                </label>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
