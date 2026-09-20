import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { organisations, utilisateurs } from "../db/schema.js";
import { authentifie, demanderOtp, emettreJetons, hacherMotDePasse, normaliserTelephone, rafraichir, revoquer, verifierMotDePasse, verifierOtp, type Vars } from "../lib/auth.js";
import { auditer } from "../lib/audit.js";
import { uid } from "../lib/util.js";
import { randomBytes } from "node:crypto";

const r = new Hono<Vars>();

const Tel = z.string().min(9).max(20);

r.post("/otp/request", async (c) => {
  const { telephone } = z.object({ telephone: Tel }).parse(await c.req.json());
  const res = await demanderOtp(c.get("db"), telephone);
  return c.json({ ok: true, ...res });
});

r.post("/otp/verify", async (c) => {
  const { telephone, code } = z.object({ telephone: Tel, code: z.string().length(6) }).parse(await c.req.json());
  const db = c.get("db");
  if (!(await verifierOtp(db, telephone, code))) throw new HTTPException(401, { message: "Code incorrect ou expiré" });
  const tel = normaliserTelephone(telephone);
  const comptes = await db.select().from(utilisateurs).where(and(eq(utilisateurs.telephone, tel), eq(utilisateurs.actif, true)));
  if (comptes.length === 0) throw new HTTPException(404, { message: "Numéro inconnu : créez une organisation ou demandez une invitation" });
  // Un même numéro peut appartenir à plusieurs organisations : on ouvre la première, la liste est renvoyée.
  const user = comptes[0];
  const jetons = await emettreJetons(db, user);
  await auditer(db, { organisationId: user.organisationId, utilisateurId: user.id, action: "connexion_otp", entite: "utilisateur", entiteId: user.id });
  return c.json({ ...jetons, utilisateur: publicUser(user), organisations: comptes.map((u) => ({ id: u.organisationId, role: u.role })) });
});

r.post("/login", async (c) => {
  const { email, motDePasse } = z.object({ email: z.email(), motDePasse: z.string().min(1) }).parse(await c.req.json());
  const db = c.get("db");
  const [user] = await db.select().from(utilisateurs).where(and(eq(utilisateurs.email, email.toLowerCase()), eq(utilisateurs.actif, true)));
  if (!user?.motDePasseHash || !verifierMotDePasse(motDePasse, user.motDePasseHash)) throw new HTTPException(401, { message: "Identifiants incorrects" });
  const jetons = await emettreJetons(db, user);
  await auditer(db, { organisationId: user.organisationId, utilisateurId: user.id, action: "connexion_email", entite: "utilisateur", entiteId: user.id });
  return c.json({ ...jetons, utilisateur: publicUser(user) });
});

/** Inscription libre : crée l'organisation (plan gratuit, essai 30 j) et son administrateur, après OTP. */
r.post("/inscription", async (c) => {
  const b = z.object({
    telephone: Tel,
    code: z.string().length(6),
    nom: z.string().min(2),
    email: z.email().optional(),
    motDePasse: z.string().min(10).optional(),
    organisation: z.object({ nom: z.string().min(2), type: z.enum(["immo", "entreprise"]) }),
  }).parse(await c.req.json());
  const db = c.get("db");
  if (!(await verifierOtp(db, b.telephone, b.code))) throw new HTTPException(401, { message: "Code incorrect ou expiré" });
  const orgId = uid();
  await db.insert(organisations).values({ id: orgId, nom: b.organisation.nom, type: b.organisation.type, plan: "gratuit", cleApi: randomBytes(24).toString("base64url"), finEssai: new Date(Date.now() + 30 * 86400_000), statut: "essai" });
  const [user] = await db.insert(utilisateurs).values({
    id: uid(), organisationId: orgId, role: "admin", nom: b.nom, telephone: normaliserTelephone(b.telephone),
    email: b.email?.toLowerCase(), motDePasseHash: b.motDePasse ? hacherMotDePasse(b.motDePasse) : null,
  }).returning();
  await auditer(db, { organisationId: orgId, utilisateurId: user.id, action: "inscription", entite: "organisation", entiteId: orgId, apres: b.organisation });
  const jetons = await emettreJetons(db, user);
  return c.json({ ...jetons, utilisateur: publicUser(user), organisationId: orgId }, 201);
});

r.post("/refresh", async (c) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(await c.req.json());
  return c.json(await rafraichir(c.get("db"), refreshToken));
});

r.post("/logout", async (c) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(await c.req.json());
  await revoquer(c.get("db"), refreshToken);
  return c.json({ ok: true });
});

r.get("/me", authentifie, async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const [org] = c.get("orgId") ? await db.select().from(organisations).where(eq(organisations.id, c.get("orgId"))) : [null];
  return c.json({ utilisateur: publicUser(user), organisation: org ? { ...org, cleApi: user.role === "admin" || user.role === "superadmin" ? org.cleApi : undefined } : null });
});

r.post("/mot-de-passe", authentifie, async (c) => {
  const { motDePasse } = z.object({ motDePasse: z.string().min(10) }).parse(await c.req.json());
  const db = c.get("db");
  await db.update(utilisateurs).set({ motDePasseHash: hacherMotDePasse(motDePasse), modifieLe: new Date() }).where(eq(utilisateurs.id, c.get("user").id));
  return c.json({ ok: true });
});

export function publicUser(u: typeof utilisateurs.$inferSelect) {
  const { motDePasseHash: _h, ...rest } = u;
  return rest;
}

export default r;
