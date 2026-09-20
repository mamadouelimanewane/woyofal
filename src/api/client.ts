/**
 * Client HTTP de l'API KURAÑ : jetons en localStorage, rafraîchissement automatique
 * sur 401, erreurs remontées sous forme d'ApiError avec le message du serveur.
 */
const CLE = "kuran-auth";

export interface Session { accessToken: string; refreshToken: string }

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function lireSession(): Session | null {
  try {
    const s = localStorage.getItem(CLE);
    return s ? (JSON.parse(s) as Session) : null;
  } catch {
    return null;
  }
}

export function ecrireSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(CLE, JSON.stringify(s));
    else localStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible : la session ne survit pas au rechargement */
  }
}

let rafraichissement: Promise<boolean> | null = null;

async function rafraichir(): Promise<boolean> {
  if (!rafraichissement) {
    rafraichissement = (async () => {
      const s = lireSession();
      if (!s?.refreshToken) return false;
      const res = await fetch("/api/auth/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
      if (!res.ok) { ecrireSession(null); return false; }
      const j = await res.json();
      ecrireSession({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      return true;
    })().finally(() => { rafraichissement = null; });
  }
  return rafraichissement;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; auth?: boolean } = {}): Promise<T> {
  const auth = init.auth ?? true;
  const executer = async (): Promise<Response> => {
    const s = lireSession();
    return fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(auth && s?.accessToken ? { authorization: `Bearer ${s.accessToken}` } : {}), ...(init.headers ?? {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  };
  let res = await executer();
  if (res.status === 401 && auth && (await rafraichir())) res = await executer();
  const texte = await res.text();
  const json = texte ? JSON.parse(texte) : {};
  if (!res.ok) throw new ApiError(res.status, json.erreur ?? `Erreur ${res.status}`, json.details);
  return json as T;
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, body: unknown) => api<T>(path, { method: "POST", body });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const del = <T = any>(path: string) => api<T>(path, { method: "DELETE" });
