/**
 * Client API KURAÑ pour l'application agent : jetons en SecureStore, rafraîchissement
 * automatique, URL du serveur modifiable (Profil → Serveur) pour les tests locaux.
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const URL_DEFAUT = "https://woyofal.vercel.app";
const CLE_URL = "kuran-url";
const CLE_SESSION = "kuran-session";

export interface Session { accessToken: string; refreshToken: string }

export class ApiError extends Error {
  constructor(public status: number, message: string, public corps?: any) { super(message); }
}

let urlCache: string | null = null;
export async function urlServeur(): Promise<string> {
  if (urlCache) return urlCache;
  urlCache = (await AsyncStorage.getItem(CLE_URL)) ?? URL_DEFAUT;
  return urlCache;
}
export async function definirUrlServeur(u: string): Promise<void> {
  urlCache = u.replace(/\/$/, "");
  await AsyncStorage.setItem(CLE_URL, urlCache);
}

export async function lireSession(): Promise<Session | null> {
  const s = await SecureStore.getItemAsync(CLE_SESSION);
  return s ? (JSON.parse(s) as Session) : null;
}
export async function ecrireSession(s: Session | null): Promise<void> {
  if (s) await SecureStore.setItemAsync(CLE_SESSION, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(CLE_SESSION);
}

let rafraichissement: Promise<boolean> | null = null;
async function rafraichir(): Promise<boolean> {
  if (!rafraichissement) {
    rafraichissement = (async () => {
      const s = await lireSession();
      if (!s?.refreshToken) return false;
      const res = await fetch(`${await urlServeur()}/api/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
      if (!res.ok) { await ecrireSession(null); return false; }
      const j = await res.json();
      await ecrireSession({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      return true;
    })().finally(() => { rafraichissement = null; });
  }
  return rafraichissement;
}

function expiration(jeton: string): number {
  try { return JSON.parse(atob(jeton.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch { return 0; }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const auth = init.auth ?? true;
  let s = auth ? await lireSession() : null;
  if (s?.accessToken && expiration(s.accessToken) < Date.now() + 30_000 && (await rafraichir())) s = await lireSession();
  const base = await urlServeur();
  const executer = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
    try {
      return await fetch(`${base}/api${path}`, {
        method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
        headers: { "content-type": "application/json", ...(auth && s?.accessToken ? { authorization: `Bearer ${s.accessToken}` } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: ctrl.signal,
      });
    } finally { clearTimeout(t); }
  };
  let res = await executer();
  if (res.status === 401 && auth && (await rafraichir())) { s = await lireSession(); res = await executer(); }
  const texte = await res.text();
  const json = texte ? JSON.parse(texte) : {};
  if (!res.ok) throw new ApiError(res.status, json.erreur ?? `Erreur ${res.status}`, json);
  return json as T;
}
