const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3009/api";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("erp_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("erp_token", token);
  else localStorage.removeItem("erp_token");
}

export function getCompanyId(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem("erp_company");
  return v ? Number(v) : null;
}

export function setCompanyId(id: number | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem("erp_company", String(id));
  else localStorage.removeItem("erp_company");
}

interface ApiOptions extends RequestInit {
  auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = opts;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
    const companyId = getCompanyId();
    if (companyId) finalHeaders["X-Company-Id"] = String(companyId);
  }

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });

  if (res.status === 401) {
    // Limpiamos el token, pero NO redirigimos desde aca: el AuthProvider
    // captura el error y el Shell se encarga de mandar a /login si hace falta.
    // (Redirigir aca causaba un loop en la propia pagina de login.)
    setToken(null);
    throw new Error("No autenticado");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Error en la solicitud");
  }
  return data as T;
}

// Origen del backend (sin el sufijo /api), para servir archivos estaticos como /uploads/...
const ASSET_ORIGIN = API_URL.replace(/\/api\/?$/, "");

// Convierte una ruta relativa de archivo subido en URL absoluta servible.
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${ASSET_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Sube un archivo (multipart) y devuelve la ruta relativa guardada en el server.
export async function uploadFile(path: string, file: File, field = "imagen"): Promise<{ url: string }> {
  const finalHeaders: Record<string, string> = {};
  const token = getToken();
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) finalHeaders["X-Company-Id"] = String(companyId);

  const body = new FormData();
  body.append(field, file);

  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: finalHeaders, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Error al subir el archivo");
  }
  return data as { url: string };
}
