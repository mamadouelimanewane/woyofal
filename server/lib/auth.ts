/**
 * Authentification (CDC v2 § 3.1) : OTP SMS, e-mail + mot de passe, JWT court + refresh long,
 * RBAC et cloisonnement par organisation (§ 6.4).
 */
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { SignJWT, jwtVerify } from "jose";
import type { Db } from "../db";
import { otpCodes, sessions, utilisateurs } from "../db/schema";
import { envoyerSms } from "./sms";

export type Role = "superadmin" | "admin" | "gestionnaire" | "agent" | "occupant" | "lecture";
export type Utilisateur = typeof utilisateurs.$inferSelect;

export interface Vars {
  Variables: { user: Utilisateur; orgId: string; db: Db };
}

const ACCESS_TTL = "15m";
const REFRESH_TTL_JOURS = 30;
const OTP_TTL_MIN = 5;
const OTP_MAX_PAR_HEURE = 5;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "kuran-dev-secret-ne-pas-utiliser-en-prod");
  if (!s) throw new Error("JWT_SECRET manquant");
  return new TextEncoder().encode(s);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function normaliserTelephone(t: string): string {
  const chiffres = t.replace(/\D/g, "");
  if (chiffres.length === 9) return `221${chiffres}`;
  if (chiffres.startsWith("00")) return chiffres.slice(2);
  return chiffres;
}

// ---------- Mot de passe ----------
export function hacherMotDePasse(mdp: string): string {
  const sel = randomBytes(16).toString("hex");
  return `${sel}:${scryptSync(mdp, sel, 64).toString("hex")}`;
}
export function verifierMotDePasse(mdp: string, hash: string): boolean {
  const [sel, h] = hash.split(":");
  if (!sel || !h) return false;
  const calc = scryptSync(mdp, sel, 64);
  const ref = Buffer.from(h, "hex");
  return calc.length === ref.length && timingSafeEqual(calc, ref);
}

// ---------- OTP ----------
export async function demanderOtp(db: Db, telephoneBrut: string): Promise<{ devCode?: string }> {
  const telephone = normaliserTelephone(telephoneBrut);
  const depuis = new Date(Date.now() - 3600_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(otpCodes)
    .where(and(eq(otpCodes.telephone, telephone), gt(otpCodes.creeLe, depuis)));
  if (n >= OTP_MAX_PAR_HEURE) throw new HTTPException(429, { message: "Trop de demandes, réessayez dans une heure" });

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(otpCodes).values({
    id: randomUUID(),
    telephone,
    codeHash: sha256(`${telephone}:${code}`),
    expireLe: new Date(Date.now() + OTP_TTL_MIN * 60_000),
  });
  const envoye = await envoyerSms(telephone, `KURAÑ — votre code de connexion : ${code} (valable ${OTP_TTL_MIN} min)`);
  // Sans fournisseur SMS configuré, le code est renvoyé au client (dev / démo uniquement).
  return envoye ? {} : { devCode: code };
}

export async function verifierOtp(db: Db, telephoneBrut: string, code: string): Promise<boolean> {
  const telephone = normaliserTelephone(telephoneBrut);
  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.telephone, telephone), eq(otpCodes.utilise, false), gt(otpCodes.expireLe, new Date())))
    .orderBy(sql`${otpCodes.creeLe} desc`)
    .limit(1);
  if (!otp) return false;
  if (otp.tentatives >= 3) return false;
  const ok = otp.codeHash === sha256(`${telephone}:${code}`);
  await db
    .update(otpCodes)
    .set(ok ? { utilise: true } : { tentatives: otp.tentatives + 1 })
    .where(eq(otpCodes.id, otp.id));
  return ok;
}

// ---------- Jetons ----------
export interface Jetons { accessToken: string; refreshToken: string; expiresIn: number }

export async function emettreJetons(db: Db, user: Utilisateur): Promise<Jetons> {
  const accessToken = await new SignJWT({ role: user.role, org: user.organisationId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(secret());
  const refreshToken = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    id: randomUUID(),
    utilisateurId: user.id,
    refreshHash: sha256(refreshToken),
    expireLe: new Date(Date.now() + REFRESH_TTL_JOURS * 86400_000),
  });
  return { accessToken, refreshToken, expiresIn: 15 * 60 };
}

export async function rafraichir(db: Db, refreshToken: string): Promise<Jetons> {
  const [s] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.refreshHash, sha256(refreshToken)), isNull(sessions.revoqueLe), gt(sessions.expireLe, new Date())));
  if (!s) throw new HTTPException(401, { message: "Session expirée" });
  const [user] = await db.select().from(utilisateurs).where(and(eq(utilisateurs.id, s.utilisateurId), eq(utilisateurs.actif, true)));
  if (!user) throw new HTTPException(401, { message: "Compte désactivé" });
  // Rotation : l'ancien refresh est révoqué.
  await db.update(sessions).set({ revoqueLe: new Date() }).where(eq(sessions.id, s.id));
  return emettreJetons(db, user);
}

export async function revoquer(db: Db, refreshToken: string): Promise<void> {
  await db.update(sessions).set({ revoqueLe: new Date() }).where(eq(sessions.refreshHash, sha256(refreshToken)));
}

// ---------- Middlewares ----------
/** Exige un Bearer valide ; place `user` et `orgId` dans le contexte. */
export const authentifie: MiddlewareHandler<Vars> = async (c, next) => {
  const entete = c.req.header("authorization") ?? "";
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7) : null;
  if (!jeton) throw new HTTPException(401, { message: "Authentification requise" });
  let sub: string | undefined;
  try {
    ({ payload: { sub } } = await jwtVerify(jeton, secret()));
  } catch {
    throw new HTTPException(401, { message: "Jeton invalide ou expiré" });
  }
  const db = c.get("db");
  const [user] = await db.select().from(utilisateurs).where(and(eq(utilisateurs.id, sub!), eq(utilisateurs.actif, true)));
  if (!user) throw new HTTPException(401, { message: "Compte inconnu ou désactivé" });
  c.set("user", user);
  // Le super-admin peut agir sur une organisation via l'en-tête X-Organisation (tracé).
  const orgId = user.role === "superadmin" ? (c.req.header("x-organisation") ?? "") : (user.organisationId ?? "");
  c.set("orgId", orgId);
  await next();
};

export function roles(...autorises: Role[]): MiddlewareHandler<Vars> {
  return async (c, next) => {
    const user = c.get("user");
    if (user.role !== "superadmin" && !autorises.includes(user.role as Role)) {
      throw new HTTPException(403, { message: "Droits insuffisants" });
    }
    await next();
  };
}

/** Un gestionnaire / agent ne voit que ses sites assignés (liste vide = tous). */
export function siteAutorise(c: Context<Vars>, siteId: string): boolean {
  const user = c.get("user");
  if (["superadmin", "admin", "lecture"].includes(user.role)) return true;
  const liste = user.sitesAutorises ?? [];
  return liste.length === 0 || liste.includes(siteId);
}

export const ECRITURE: Role[] = ["admin", "gestionnaire", "agent"];
export const GESTION: Role[] = ["admin", "gestionnaire"];
export const TOUS: Role[] = ["admin", "gestionnaire", "agent", "lecture"];
