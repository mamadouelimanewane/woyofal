/** Organisation, utilisateurs, sites, lots, compteurs, rattachements, import (CDC v2 § 3.2). */
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { compteurLots, compteurs, lots, occupants, organisations, sites, utilisateurs } from "../db/schema.js";
import { ECRITURE, GESTION, TOUS, authentifie, normaliserTelephone, roles, siteAutorise, type Vars } from "../lib/auth.js";
import { auditer } from "../lib/audit.js";
import { introuvable, invalide, uid } from "../lib/util.js";
import { publicUser } from "./auth.js";

const r = new Hono<Vars>();
r.use(authentifie);

const Numero = z.string().regex(/^\d{11}$/, "Le numéro de compteur comporte 11 chiffres");
const Regle = z.enum(["egal", "surface", "sous_compteur", "forfait"]);

// ---------- Organisation ----------
r.patch("/organisations/me", roles("admin"), async (c) => {
  const b = z.object({ nom: z.string().min(2).optional(), ninea: z.string().optional(), contact: z.string().optional(), logoUrl: z.string().optional(), parametres: z.record(z.string(), z.any()).optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [avant] = await db.select().from(organisations).where(eq(organisations.id, c.get("orgId")));
  if (!avant) introuvable();
  const [apres] = await db.update(organisations).set({ ...b, parametres: b.parametres ? { ...avant.parametres, ...b.parametres } : avant.parametres, modifieLe: new Date(), modifiePar: c.get("user").id }).where(eq(organisations.id, avant.id)).returning();
  await auditer(db, { organisationId: avant.id, utilisateurId: c.get("user").id, action: "modifier", entite: "organisation", entiteId: avant.id, avant: b, apres });
  return c.json(apres);
});

r.post("/organisations/me/cle-api", roles("admin"), async (c) => {
  const { randomBytes } = await import("node:crypto");
  const cle = randomBytes(24).toString("base64url");
  await c.get("db").update(organisations).set({ cleApi: cle, modifieLe: new Date() }).where(eq(organisations.id, c.get("orgId")));
  return c.json({ cleApi: cle });
});

// ---------- Utilisateurs ----------
r.get("/utilisateurs", roles(...TOUS), async (c) => {
  const rows = await c.get("db").select().from(utilisateurs).where(eq(utilisateurs.organisationId, c.get("orgId")));
  return c.json(rows.map(publicUser));
});

r.post("/utilisateurs", roles("admin"), async (c) => {
  const b = z.object({ nom: z.string().min(2), telephone: z.string().min(9), email: z.email().optional(), role: z.enum(["admin", "gestionnaire", "agent", "lecture"]), sitesAutorises: z.array(z.string()).default([]) }).parse(await c.req.json());
  const db = c.get("db");
  const [u] = await db.insert(utilisateurs).values({ id: uid(), organisationId: c.get("orgId"), ...b, telephone: normaliserTelephone(b.telephone), email: b.email?.toLowerCase(), creePar: c.get("user").id }).returning();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "inviter", entite: "utilisateur", entiteId: u.id, apres: b });
  return c.json(publicUser(u), 201);
});

r.patch("/utilisateurs/:id", roles("admin"), async (c) => {
  const b = z.object({ nom: z.string().min(2).optional(), role: z.enum(["admin", "gestionnaire", "agent", "lecture"]).optional(), sitesAutorises: z.array(z.string()).optional(), actif: z.boolean().optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [u] = await db.update(utilisateurs).set({ ...b, modifieLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(utilisateurs.id, c.req.param("id")), eq(utilisateurs.organisationId, c.get("orgId")))).returning();
  if (!u) introuvable();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "modifier", entite: "utilisateur", entiteId: u.id, apres: b });
  return c.json(publicUser(u));
});

// ---------- Sites ----------
// Les valeurs par défaut ne s'appliquent qu'à la création : un PATCH partiel ne doit rien réinitialiser.
const SiteBase = z.object({ nom: z.string().min(1), type: z.string(), adresse: z.string().optional(), geo: z.object({ lat: z.number(), lng: z.number() }).optional(), surfaceM2: z.number().int().optional(), budgetMensuel: z.number().int().optional(), responsable: z.string().optional(), joursInactiviteAlerte: z.number().int().optional() });
const SiteBody = SiteBase.extend({ type: z.string().default("immeuble") });

r.get("/sites", roles(...TOUS), async (c) => {
  const rows = await c.get("db").select().from(sites).where(and(eq(sites.organisationId, c.get("orgId")), isNull(sites.archiveLe))).orderBy(asc(sites.nom));
  return c.json(rows.filter((s) => siteAutorise(c, s.id)));
});

r.post("/sites", roles(...GESTION), async (c) => {
  const b = SiteBody.parse(await c.req.json());
  const db = c.get("db");
  const [s] = await db.insert(sites).values({ id: uid(), organisationId: c.get("orgId"), ...b, creePar: c.get("user").id }).returning();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "creer", entite: "site", entiteId: s.id, apres: b });
  return c.json(s, 201);
});

r.patch("/sites/:id", roles(...GESTION), async (c) => {
  const b = SiteBase.partial().parse(await c.req.json());
  const db = c.get("db");
  if (!siteAutorise(c, c.req.param("id"))) introuvable();
  const [s] = await db.update(sites).set({ ...b, modifieLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(sites.id, c.req.param("id")), eq(sites.organisationId, c.get("orgId")))).returning();
  if (!s) introuvable();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "modifier", entite: "site", entiteId: s.id, apres: b });
  return c.json(s);
});

r.delete("/sites/:id", roles("admin"), async (c) => {
  const db = c.get("db");
  const [s] = await db.update(sites).set({ archiveLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(sites.id, c.req.param("id")), eq(sites.organisationId, c.get("orgId")))).returning();
  if (!s) introuvable();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "archiver", entite: "site", entiteId: s.id });
  return c.json({ ok: true });
});

// ---------- Lots ----------
const LotBody = z.object({ siteId: z.string(), reference: z.string().min(1), surfaceM2: z.number().int().optional(), etage: z.string().optional() });

r.get("/lots", roles(...TOUS), async (c) => {
  const rows = await c.get("db").select().from(lots).where(and(eq(lots.organisationId, c.get("orgId")), isNull(lots.archiveLe)));
  return c.json(rows.filter((l) => siteAutorise(c, l.siteId)));
});

r.post("/lots", roles(...GESTION), async (c) => {
  const b = LotBody.parse(await c.req.json());
  const db = c.get("db");
  await verifierSite(c, b.siteId);
  const [l] = await db.insert(lots).values({ id: uid(), organisationId: c.get("orgId"), ...b, creePar: c.get("user").id }).returning();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "creer", entite: "lot", entiteId: l.id, apres: b });
  return c.json(l, 201);
});

r.patch("/lots/:id", roles(...GESTION), async (c) => {
  const b = LotBody.partial().parse(await c.req.json());
  const db = c.get("db");
  const [l] = await db.update(lots).set({ ...b, modifieLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(lots.id, c.req.param("id")), eq(lots.organisationId, c.get("orgId")))).returning();
  if (!l) introuvable();
  return c.json(l);
});

r.delete("/lots/:id", roles(...GESTION), async (c) => {
  const db = c.get("db");
  const [l] = await db.update(lots).set({ archiveLe: new Date() }).where(and(eq(lots.id, c.req.param("id")), eq(lots.organisationId, c.get("orgId")))).returning();
  if (!l) introuvable();
  await db.delete(compteurLots).where(and(eq(compteurLots.lotId, l.id), eq(compteurLots.organisationId, c.get("orgId"))));
  return c.json({ ok: true });
});

// ---------- Compteurs ----------
const CompteurBase = z.object({ siteId: z.string(), numero: Numero, libelle: z.string().optional(), typeTarif: z.enum(["DPP", "DMP", "PRO"]), puissanceKva: z.number().optional(), statut: z.enum(["actif", "resilie"]), regleRepartition: Regle, photoUrl: z.string().optional(), geo: z.object({ lat: z.number(), lng: z.number() }).optional(), lotIds: z.array(z.string()) });
const CompteurBody = CompteurBase.extend({ typeTarif: z.enum(["DPP", "DMP", "PRO"]).default("DPP"), statut: z.enum(["actif", "resilie"]).default("actif"), regleRepartition: Regle.default("egal"), lotIds: z.array(z.string()).default([]) });

r.get("/compteurs", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const rows = await db.select().from(compteurs).where(and(eq(compteurs.organisationId, c.get("orgId")), isNull(compteurs.archiveLe)));
  const ratt = await db.select().from(compteurLots).where(eq(compteurLots.organisationId, c.get("orgId")));
  return c.json(rows.filter((x) => siteAutorise(c, x.siteId)).map((x) => ({ ...x, puissanceKva: x.puissanceKva == null ? null : Number(x.puissanceKva), lots: ratt.filter((y) => y.compteurId === x.id).map((y) => ({ lotId: y.lotId, forfait: y.forfait })) })));
});

r.post("/compteurs", roles(...GESTION), async (c) => {
  const { lotIds, puissanceKva, ...b } = CompteurBody.parse(await c.req.json());
  const db = c.get("db");
  await verifierSite(c, b.siteId);
  const [existant] = await db.select({ id: compteurs.id }).from(compteurs).where(and(eq(compteurs.organisationId, c.get("orgId")), eq(compteurs.numero, b.numero)));
  if (existant) invalide(`Le compteur ${b.numero} existe déjà dans cette organisation`);
  const [cpt] = await db.insert(compteurs).values({ id: uid(), organisationId: c.get("orgId"), ...b, puissanceKva: puissanceKva?.toString(), partage: lotIds.length > 1, creePar: c.get("user").id }).returning();
  if (lotIds.length) await db.insert(compteurLots).values(lotIds.map((lotId) => ({ compteurId: cpt.id, lotId, organisationId: c.get("orgId") })));
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "creer", entite: "compteur", entiteId: cpt.id, apres: { ...b, lotIds } });
  return c.json(cpt, 201);
});

r.patch("/compteurs/:id", roles(...GESTION), async (c) => {
  const { lotIds: _l, puissanceKva, ...b } = CompteurBase.partial().parse(await c.req.json());
  const db = c.get("db");
  const [cpt] = await db.update(compteurs).set({ ...b, ...(puissanceKva !== undefined ? { puissanceKva: puissanceKva.toString() } : {}), modifieLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(compteurs.id, c.req.param("id")), eq(compteurs.organisationId, c.get("orgId")))).returning();
  if (!cpt) introuvable();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "modifier", entite: "compteur", entiteId: cpt.id, apres: b });
  return c.json(cpt);
});

/** Remplace les rattachements (règle EF-REP-05 : n'affecte que les recharges futures). */
r.put("/compteurs/:id/rattachements", roles(...GESTION), async (c) => {
  const { lots: liste } = z.object({ lots: z.array(z.object({ lotId: z.string(), forfait: z.number().int().optional() })) }).parse(await c.req.json());
  const db = c.get("db");
  const orgId = c.get("orgId");
  const [cpt] = await db.select().from(compteurs).where(and(eq(compteurs.id, c.req.param("id")), eq(compteurs.organisationId, orgId)));
  if (!cpt) introuvable();
  if (liste.length) {
    const ok = await db.select({ id: lots.id }).from(lots).where(and(eq(lots.organisationId, orgId), inArray(lots.id, liste.map((l) => l.lotId))));
    if (ok.length !== liste.length) invalide("Un des lots n'appartient pas à l'organisation");
  }
  await db.delete(compteurLots).where(and(eq(compteurLots.compteurId, cpt.id), eq(compteurLots.organisationId, orgId)));
  if (liste.length) await db.insert(compteurLots).values(liste.map((l) => ({ compteurId: cpt.id, lotId: l.lotId, forfait: l.forfait ?? null, organisationId: orgId })));
  await db.update(compteurs).set({ partage: liste.length > 1, modifieLe: new Date() }).where(eq(compteurs.id, cpt.id));
  await auditer(db, { organisationId: orgId, utilisateurId: c.get("user").id, action: "rattacher", entite: "compteur", entiteId: cpt.id, apres: liste });
  return c.json({ ok: true, partage: liste.length > 1 });
});

r.put("/compteurs/:id/repartition", roles(...GESTION), async (c) => {
  const { regle } = z.object({ regle: Regle }).parse(await c.req.json());
  const db = c.get("db");
  const [cpt] = await db.update(compteurs).set({ regleRepartition: regle, modifieLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(compteurs.id, c.req.param("id")), eq(compteurs.organisationId, c.get("orgId")))).returning();
  if (!cpt) introuvable();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "regle", entite: "compteur", entiteId: cpt.id, apres: { regle } });
  return c.json(cpt);
});

r.delete("/compteurs/:id", roles("admin"), async (c) => {
  const db = c.get("db");
  const [cpt] = await db.update(compteurs).set({ archiveLe: new Date(), statut: "resilie" }).where(and(eq(compteurs.id, c.req.param("id")), eq(compteurs.organisationId, c.get("orgId")))).returning();
  if (!cpt) introuvable();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "archiver", entite: "compteur", entiteId: cpt.id });
  return c.json({ ok: true });
});

// ---------- Import (EF-PARC-06) : le client convertit l'Excel en JSON, le serveur valide ligne par ligne ----------
const ImportBody = z.object({
  sites: z.array(z.object({ nom: z.string().min(1), type: z.string().optional(), adresse: z.string().optional(), surfaceM2: z.number().optional(), budgetMensuel: z.number().optional() })).default([]),
  lots: z.array(z.object({ site: z.string(), reference: z.string().min(1), surfaceM2: z.number().optional(), etage: z.string().optional() })).default([]),
  compteurs: z.array(z.object({ site: z.string(), numero: z.string(), typeTarif: z.enum(["DPP", "DMP", "PRO"]).optional(), libelle: z.string().optional(), lots: z.array(z.string()).default([]), regle: Regle.optional() })).default([]),
  occupants: z.array(z.object({ site: z.string(), lot: z.string(), nom: z.string().min(1), telephone: z.string().optional(), dateEntree: z.string().optional(), caution: z.number().optional() })).default([]),
  simuler: z.boolean().default(false),
});

r.post("/parc/import", roles("admin", "gestionnaire"), async (c) => {
  const b = ImportBody.parse(await c.req.json());
  const db = c.get("db");
  const orgId = c.get("orgId");
  const erreurs: { onglet: string; ligne: number; message: string }[] = [];
  const existantsSites = await db.select().from(sites).where(and(eq(sites.organisationId, orgId), isNull(sites.archiveLe)));
  const existantsLots = await db.select().from(lots).where(and(eq(lots.organisationId, orgId), isNull(lots.archiveLe)));
  const existantsCpt = await db.select({ numero: compteurs.numero }).from(compteurs).where(eq(compteurs.organisationId, orgId));

  const siteId = new Map(existantsSites.map((s) => [s.nom.trim().toLowerCase(), s.id]));
  const lotId = new Map(existantsLots.map((l) => [`${siteIdInverse(existantsSites, l.siteId)}|${l.reference.trim().toLowerCase()}`, l.id]));
  const numeros = new Set(existantsCpt.map((x) => x.numero));

  const aCreer = { sites: [] as (typeof sites.$inferInsert)[], lots: [] as (typeof lots.$inferInsert)[], compteurs: [] as (typeof compteurs.$inferInsert)[], ratt: [] as (typeof compteurLots.$inferInsert)[], occupants: [] as (typeof occupants.$inferInsert)[] };

  b.sites.forEach((s, i) => {
    const k = s.nom.trim().toLowerCase();
    if (siteId.has(k)) return; // déjà présent : on ne duplique pas
    const id = uid();
    siteId.set(k, id);
    aCreer.sites.push({ id, organisationId: orgId, nom: s.nom.trim(), type: s.type ?? "immeuble", adresse: s.adresse, surfaceM2: s.surfaceM2, budgetMensuel: s.budgetMensuel, creePar: c.get("user").id });
    void i;
  });
  b.lots.forEach((l, i) => {
    const sk = l.site.trim().toLowerCase();
    const sid = siteId.get(sk);
    if (!sid) return erreurs.push({ onglet: "Lots", ligne: i + 2, message: `Site inconnu : ${l.site}` });
    const k = `${sk}|${l.reference.trim().toLowerCase()}`;
    if (lotId.has(k)) return;
    const id = uid();
    lotId.set(k, id);
    aCreer.lots.push({ id, organisationId: orgId, siteId: sid, reference: l.reference.trim(), surfaceM2: l.surfaceM2, etage: l.etage, creePar: c.get("user").id });
  });
  b.compteurs.forEach((x, i) => {
    const sk = x.site.trim().toLowerCase();
    const sid = siteId.get(sk);
    const numero = x.numero.replace(/\D/g, "");
    if (!sid) return erreurs.push({ onglet: "Compteurs", ligne: i + 2, message: `Site inconnu : ${x.site}` });
    if (!/^\d{11}$/.test(numero)) return erreurs.push({ onglet: "Compteurs", ligne: i + 2, message: `Numéro invalide (11 chiffres attendus) : ${x.numero}` });
    if (numeros.has(numero)) return erreurs.push({ onglet: "Compteurs", ligne: i + 2, message: `Compteur déjà présent : ${numero}` });
    const lotIds = x.lots.map((ref) => lotId.get(`${sk}|${ref.trim().toLowerCase()}`));
    if (lotIds.some((v) => !v)) return erreurs.push({ onglet: "Compteurs", ligne: i + 2, message: `Lot inconnu parmi : ${x.lots.join(", ")}` });
    numeros.add(numero);
    const id = uid();
    aCreer.compteurs.push({ id, organisationId: orgId, siteId: sid, numero, libelle: x.libelle, typeTarif: x.typeTarif ?? "DPP", partage: lotIds.length > 1, regleRepartition: x.regle ?? "egal", creePar: c.get("user").id });
    aCreer.ratt.push(...lotIds.map((lid) => ({ compteurId: id, lotId: lid!, organisationId: orgId })));
  });
  b.occupants.forEach((o, i) => {
    const lid = lotId.get(`${o.site.trim().toLowerCase()}|${o.lot.trim().toLowerCase()}`);
    if (!lid) return erreurs.push({ onglet: "Occupants", ligne: i + 2, message: `Lot inconnu : ${o.site} / ${o.lot}` });
    aCreer.occupants.push({ id: uid(), organisationId: orgId, lotId: lid, nom: o.nom.trim(), telephone: o.telephone ? normaliserTelephone(o.telephone) : null, dateEntree: o.dateEntree ?? new Date().toISOString().slice(0, 10), caution: o.caution, creePar: c.get("user").id });
  });

  const rapport = { sites: aCreer.sites.length, lots: aCreer.lots.length, compteurs: aCreer.compteurs.length, occupants: aCreer.occupants.length, erreurs };
  if (b.simuler || erreurs.length) return c.json({ ...rapport, importe: false }, erreurs.length ? 422 : 200);

  if (aCreer.sites.length) await db.insert(sites).values(aCreer.sites);
  if (aCreer.lots.length) await db.insert(lots).values(aCreer.lots);
  if (aCreer.compteurs.length) await db.insert(compteurs).values(aCreer.compteurs);
  if (aCreer.ratt.length) await db.insert(compteurLots).values(aCreer.ratt);
  if (aCreer.occupants.length) await db.insert(occupants).values(aCreer.occupants);
  await auditer(db, { organisationId: orgId, utilisateurId: c.get("user").id, action: "importer", entite: "parc", apres: { sites: rapport.sites, lots: rapport.lots, compteurs: rapport.compteurs, occupants: rapport.occupants } });
  return c.json({ ...rapport, importe: true }, 201);
});

function siteIdInverse(liste: (typeof sites.$inferSelect)[], id: string): string {
  return liste.find((s) => s.id === id)?.nom.trim().toLowerCase() ?? "";
}

async function verifierSite(c: any, siteId: string): Promise<void> {
  const [s] = await c.get("db").select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.organisationId, c.get("orgId"))));
  if (!s || !siteAutorise(c, siteId)) invalide("Site inconnu");
}

export { ECRITURE };
export default r;
