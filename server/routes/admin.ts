/** Back-office super-admin (EF-ABO-06, EF-TARIF-02, EF-RECH-04) et tâches planifiées. */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { compteurs, grillesTarifaires, notifications, organisations, patternsSms, sites, smsEntrants, utilisateurs } from "../db/schema.js";
import { authentifie, hacherMotDePasse, normaliserTelephone, roles, type Vars } from "../lib/auth.js";
import { auditer } from "../lib/audit.js";
import { traiterFile } from "../lib/notifications.js";
import { analyserSms, grilles } from "../lib/tarif-service.js";
import { uid } from "../lib/util.js";
import { relancer } from "./occupants.js";
import { randomBytes } from "node:crypto";

const r = new Hono<Vars>();

// ---------- Cron (Vercel envoie Authorization: Bearer CRON_SECRET) ----------
r.post("/cron/quotidien", async (c) => {
  const attendu = process.env.CRON_SECRET;
  if (attendu && c.req.header("authorization") !== `Bearer ${attendu}`) throw new HTTPException(401, { message: "Cron non autorisé" });
  const db = c.get("db");
  const orgs = await db.select({ id: organisations.id }).from(organisations).where(sql`${organisations.statut} in ('actif', 'essai')`);
  let relances = 0;
  for (const o of orgs) relances += await relancer(db, o.id);
  const file = await traiterFile(db, 500);
  // EF-ABO-02/04 : fin d'essai + 15 j sans paiement → lecture seule (les données restent)
  await db.update(organisations).set({ statut: "lecture_seule", modifieLe: new Date() }).where(sql`${organisations.statut} = 'essai' and ${organisations.finEssai} < now() - interval '15 days'`);
  return c.json({ relances, file });
});

r.use(authentifie, roles());

// ---------- Organisations ----------
r.get("/organisations", async (c) => {
  const db = c.get("db");
  const rows = await db.select({
    o: organisations,
    nbCompteurs: sql<number>`(select count(*) from ${compteurs} where ${compteurs.organisationId} = ${organisations.id} and ${compteurs.archiveLe} is null)::int`,
    nbSites: sql<number>`(select count(*) from ${sites} where ${sites.organisationId} = ${organisations.id} and ${sites.archiveLe} is null)::int`,
    nbUtilisateurs: sql<number>`(select count(*) from ${utilisateurs} where ${utilisateurs.organisationId} = ${organisations.id})::int`,
  }).from(organisations).orderBy(desc(organisations.creeLe));
  return c.json(rows.map((x) => ({ ...x.o, cleApi: undefined, nbCompteurs: x.nbCompteurs, nbSites: x.nbSites, nbUtilisateurs: x.nbUtilisateurs })));
});

r.post("/organisations", async (c) => {
  const b = z.object({ nom: z.string().min(2), type: z.enum(["immo", "entreprise"]), plan: z.string().default("gratuit"), admin: z.object({ nom: z.string().min(2), telephone: z.string().min(9), email: z.email().optional(), motDePasse: z.string().min(10).optional() }) }).parse(await c.req.json());
  const db = c.get("db");
  const id = uid();
  await db.insert(organisations).values({ id, nom: b.nom, type: b.type, plan: b.plan, cleApi: randomBytes(24).toString("base64url"), finEssai: new Date(Date.now() + 30 * 86400_000), statut: "essai", creePar: c.get("user").id });
  const [u] = await db.insert(utilisateurs).values({ id: uid(), organisationId: id, role: "admin", nom: b.admin.nom, telephone: normaliserTelephone(b.admin.telephone), email: b.admin.email?.toLowerCase(), motDePasseHash: b.admin.motDePasse ? hacherMotDePasse(b.admin.motDePasse) : null, creePar: c.get("user").id }).returning({ id: utilisateurs.id });
  await auditer(db, { organisationId: id, utilisateurId: c.get("user").id, action: "creer", entite: "organisation", entiteId: id, apres: { nom: b.nom, type: b.type, plan: b.plan } });
  return c.json({ id, adminId: u.id }, 201);
});

r.patch("/organisations/:id", async (c) => {
  const b = z.object({ plan: z.string().optional(), statut: z.enum(["essai", "actif", "lecture_seule", "resilie"]).optional(), finEssai: z.string().optional(), nom: z.string().optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [o] = await db.update(organisations).set({ ...b, finEssai: b.finEssai ? new Date(b.finEssai) : undefined, modifieLe: new Date(), modifiePar: c.get("user").id }).where(eq(organisations.id, c.req.param("id"))).returning();
  if (!o) throw new HTTPException(404, { message: "Organisation inconnue" });
  await auditer(db, { organisationId: o.id, utilisateurId: c.get("user").id, action: "modifier_plan", entite: "organisation", entiteId: o.id, apres: b });
  return c.json({ ...o, cleApi: undefined });
});

// ---------- Grille tarifaire ----------
const GrilleBody = z.object({ dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), libelle: z.string().min(3), tranche1: z.number().positive(), tranche2: z.number().positive(), tranche3: z.number().positive(), seuilT1: z.number().int().positive(), seuilT2: z.number().int().positive(), redevance: z.number().int().nonnegative(), seuilTva: z.number().int().positive(), tauxTva: z.number().min(0).max(1), tauxTaxeCommunale: z.number().min(0).max(1), periode: z.enum(["mois", "bimestre"]).default("mois") });

r.post("/grille", async (c) => {
  const b = GrilleBody.parse(await c.req.json());
  const db = c.get("db");
  await grilles(db); // garantit la présence de la grille de base
  const [g] = await db.insert(grillesTarifaires).values({ id: `grille-${b.dateEffet}`, ...b, tranche1: String(b.tranche1), tranche2: String(b.tranche2), tranche3: String(b.tranche3), tauxTva: String(b.tauxTva), tauxTaxeCommunale: String(b.tauxTaxeCommunale) }).returning();
  await auditer(db, { utilisateurId: c.get("user").id, action: "creer", entite: "grille", entiteId: g.id, apres: b });
  return c.json(g, 201);
});

// ---------- Patterns SMS ----------
r.get("/patterns-sms", async (c) => c.json(await c.get("db").select().from(patternsSms).orderBy(desc(patternsSms.dateEffet))));

r.post("/patterns-sms", async (c) => {
  const b = z.object({ operateur: z.enum(["wave", "orange", "free", "senelec"]), regex: z.string().min(5), champsMap: z.record(z.string(), z.number().int()), dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), actif: z.boolean().default(true) }).parse(await c.req.json());
  try { new RegExp(b.regex, "i"); } catch { throw new HTTPException(400, { message: "Expression régulière invalide" }); }
  const db = c.get("db");
  const [{ v }] = await db.select({ v: sql<number>`coalesce(max(${patternsSms.version}), 0)::int` }).from(patternsSms).where(eq(patternsSms.operateur, b.operateur));
  const [p] = await db.insert(patternsSms).values({ id: uid(), ...b, version: v + 1 }).returning();
  return c.json(p, 201);
});

r.patch("/patterns-sms/:id", async (c) => {
  const { actif } = z.object({ actif: z.boolean() }).parse(await c.req.json());
  const [p] = await c.get("db").update(patternsSms).set({ actif }).where(eq(patternsSms.id, c.req.param("id"))).returning();
  if (!p) throw new HTTPException(404, { message: "Pattern inconnu" });
  return c.json(p);
});

/** Test d'un texte contre les patterns actifs (sans enregistrement). */
r.post("/patterns-sms/tester", async (c) => {
  const { texte } = z.object({ texte: z.string().min(5) }).parse(await c.req.json());
  return c.json(await analyserSms(c.get("db"), texte));
});

/** Taux de parsing 7 jours (EF-RECH-12). */
r.get("/parsing/stats", async (c) => {
  const rows = await c.get("db").select({ statut: smsEntrants.statut, n: sql<number>`count(*)::int` }).from(smsEntrants).where(sql`${smsEntrants.recuLe} > now() - interval '7 days'`).groupBy(smsEntrants.statut);
  const total = rows.reduce((a, x) => a + x.n, 0);
  const ok = rows.filter((x) => x.statut === "rattache" || x.statut === "doublon").reduce((a, x) => a + x.n, 0);
  return c.json({ total, rattaches: ok, taux: total ? Math.round((ok / total) * 1000) / 10 : null, alerte: total >= 10 && ok / total < 0.9, detail: rows });
});

r.post("/notifications/traiter", async (c) => c.json(await traiterFile(c.get("db"), 500)));
r.get("/notifications", async (c) => c.json(await c.get("db").select().from(notifications).orderBy(desc(notifications.creeLe)).limit(200)));

export default r;
