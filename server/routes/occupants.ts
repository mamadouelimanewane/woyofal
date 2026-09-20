/** Occupants, quotes-parts, paiements, quittances, recouvrement et relances (CDC v2 § 3.6). */
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { compteurs, lots, notifications, occupants, organisations, paiementsOccupant, quotesParts, recharges, sites } from "../db/schema.js";
import { ECRITURE, GESTION, TOUS, authentifie, normaliserTelephone, roles, siteAutorise, type Vars } from "../lib/auth.js";
import { auditer } from "../lib/audit.js";
import { notifier, traiterFile } from "../lib/notifications.js";
import { introuvable, invalide, uid, urlPublique } from "../lib/util.js";
import type { Db } from "../db/index.js";
import { urlQuittance } from "../lib/quittance-pdf.js";
import { enregistrerPaiementOccupant } from "../lib/recouvrement.js";
import { lienPayerOccupant } from "../lib/paiement.js";

const r = new Hono<Vars>();
r.use(authentifie);

const OccBody = z.object({ lotId: z.string(), nom: z.string().min(1), telephone: z.string().optional(), email: z.email().optional(), dateEntree: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), caution: z.number().int().optional(), consentementNotifications: z.boolean().optional() });

r.get("/occupants", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const rows = await db.select({ o: occupants, siteId: lots.siteId }).from(occupants).innerJoin(lots, eq(lots.id, occupants.lotId)).where(and(eq(occupants.organisationId, c.get("orgId")), isNull(occupants.archiveLe)));
  return c.json(rows.filter((x) => siteAutorise(c, x.siteId)).map((x) => x.o));
});

r.post("/occupants", roles(...GESTION), async (c) => {
  const b = OccBody.parse(await c.req.json());
  const db = c.get("db");
  const [lot] = await db.select().from(lots).where(and(eq(lots.id, b.lotId), eq(lots.organisationId, c.get("orgId"))));
  if (!lot) invalide("Lot inconnu");
  const [o] = await db.insert(occupants).values({ id: uid(), organisationId: c.get("orgId"), ...b, telephone: b.telephone ? normaliserTelephone(b.telephone) : null, creePar: c.get("user").id }).returning();
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "creer", entite: "occupant", entiteId: o.id, apres: b });
  return c.json(o, 201);
});

r.patch("/occupants/:id", roles(...GESTION), async (c) => {
  const b = OccBody.partial().parse(await c.req.json());
  const db = c.get("db");
  const [o] = await db.update(occupants).set({ ...b, ...(b.telephone ? { telephone: normaliserTelephone(b.telephone) } : {}), modifieLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(occupants.id, c.req.param("id")), eq(occupants.organisationId, c.get("orgId")))).returning();
  if (!o) introuvable();
  return c.json(o);
});

/** Compte occupant (EF-OCC-02) : quotes-parts, paiements, solde. */
r.get("/occupants/:id/compte", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const [o] = await db.select().from(occupants).where(and(eq(occupants.id, c.req.param("id")), eq(occupants.organisationId, c.get("orgId"))));
  if (!o) introuvable();
  return c.json(await compte(db, o));
});

async function compte(db: Db, o: typeof occupants.$inferSelect) {
  const qps = await db.select({ q: quotesParts, r: { date: recharges.date, montant: recharges.montant, compteurId: recharges.compteurId } }).from(quotesParts).innerJoin(recharges, eq(recharges.id, quotesParts.rechargeId)).where(eq(quotesParts.occupantId, o.id)).orderBy(desc(recharges.date));
  const paiements = await db.select().from(paiementsOccupant).where(eq(paiementsOccupant.occupantId, o.id)).orderBy(desc(paiementsOccupant.date));
  const du = qps.filter((x) => x.q.statut === "due").reduce((a, x) => a + x.q.montant, 0);
  const paye = qps.filter((x) => x.q.statut === "payee").reduce((a, x) => a + x.q.montant, 0);
  return { occupant: o, quotesParts: qps.map((x) => ({ ...x.q, recharge: x.r })), paiements, solde: du, totalPaye: paye };
}

/** EF-OCC-03/04 : paiement d'une ou plusieurs quotes-parts, quittance numérotée, relances stoppées (RG-10). */
r.post("/occupants/:id/paiements", roles(...ECRITURE), async (c) => {
  const b = z.object({ quotesPartsIds: z.array(z.string()).min(1), moyen: z.enum(["especes", "wave", "om", "virement", "versuspay"]), reference: z.string().optional(), date: z.string().optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [o] = await db.select().from(occupants).where(and(eq(occupants.id, c.req.param("id")), eq(occupants.organisationId, c.get("orgId"))));
  if (!o) introuvable();
  const res = await enregistrerPaiementOccupant(db, { organisationId: c.get("orgId"), occupant: o, quotesPartsIds: b.quotesPartsIds, moyen: b.moyen, reference: b.reference, date: b.date ? new Date(b.date) : new Date(), utilisateurId: c.get("user").id });
  return c.json(res, 201);
});

/** Données d'une quittance (rendu PDF serveur, cf. server/lib/quittance-pdf.ts). */
export async function donneesQuittance(db: Db, numero: string, orgId?: string) {
  const conds = [eq(paiementsOccupant.quittanceNumero, numero)];
  if (orgId) conds.push(eq(paiementsOccupant.organisationId, orgId));
  const [p] = await db.select().from(paiementsOccupant).where(and(...conds));
  if (!p) return null;
  const [o] = await db.select().from(occupants).where(eq(occupants.id, p.occupantId));
  const [lot] = await db.select().from(lots).where(eq(lots.id, o.lotId));
  const [site] = await db.select().from(sites).where(eq(sites.id, lot.siteId));
  const [org] = await db.select().from(organisations).where(eq(organisations.id, p.organisationId));
  const qps = p.quotesPartsIds.length ? await db.select({ q: quotesParts, r: recharges, cpt: compteurs }).from(quotesParts).innerJoin(recharges, eq(recharges.id, quotesParts.rechargeId)).innerJoin(compteurs, eq(compteurs.id, recharges.compteurId)).where(inArray(quotesParts.id, p.quotesPartsIds)) : [];
  const [{ solde }] = await db.select({ solde: sql<number>`coalesce(sum(${quotesParts.montant}), 0)::int` }).from(quotesParts).where(and(eq(quotesParts.occupantId, o.id), eq(quotesParts.statut, "due")));
  return { paiement: p, occupant: o, lot, site, organisation: { id: org.id, nom: org.nom, ninea: org.ninea, contact: org.contact, logoUrl: org.logoUrl }, lignes: qps.map((x) => ({ date: x.r.date, compteur: x.cpt.libelle ?? x.cpt.numero, rechargeMontant: x.r.montant, quotePart: x.q.montant })), soldeRestant: solde };
}

r.get("/quittances/:numero", roles(...TOUS), async (c) => {
  const d = await donneesQuittance(c.get("db"), c.req.param("numero"), c.get("orgId"));
  if (!d) introuvable();
  return c.json({ ...d, url: urlQuittance(urlPublique(), d.paiement.quittanceNumero) });
});

/** EF-OCC-07 : sortie — solde de clôture, état de sortie, libération du lot. */
r.post("/occupants/:id/sortie", roles(...GESTION), async (c) => {
  const { dateSortie } = z.object({ dateSortie: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(await c.req.json());
  const db = c.get("db");
  const [o] = await db.select().from(occupants).where(and(eq(occupants.id, c.req.param("id")), eq(occupants.organisationId, c.get("orgId"))));
  if (!o) introuvable();
  if (o.dateSortie) invalide("Occupant déjà sorti");
  const [maj] = await db.update(occupants).set({ dateSortie, modifieLe: new Date(), modifiePar: c.get("user").id }).where(eq(occupants.id, o.id)).returning();
  const etat = await compte(db, maj);
  const caution = o.caution ?? 0;
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "sortie", entite: "occupant", entiteId: o.id, apres: { dateSortie, solde: etat.solde, caution } });
  return c.json({ ...etat, caution, soldeApresCaution: etat.solde - caution });
});

// ---------- Quotes-parts et recouvrement ----------
r.get("/quotes-parts", roles(...TOUS), async (c) => {
  const conds = [eq(quotesParts.organisationId, c.get("orgId"))];
  if (c.req.query("statut")) conds.push(eq(quotesParts.statut, c.req.query("statut")!));
  if (c.req.query("occupantId")) conds.push(eq(quotesParts.occupantId, c.req.query("occupantId")!));
  if (c.req.query("rechargeId")) conds.push(eq(quotesParts.rechargeId, c.req.query("rechargeId")!));
  const rows = await c.get("db").select().from(quotesParts).where(and(...conds)).orderBy(desc(quotesParts.creeLe)).limit(5000);
  return c.json(rows);
});

r.post("/quotes-parts/:id/annuler", roles(...GESTION), async (c) => {
  const [q] = await c.get("db").update(quotesParts).set({ statut: "annulee", modifieLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(quotesParts.id, c.req.param("id")), eq(quotesParts.organisationId, c.get("orgId")), eq(quotesParts.statut, "due"))).returning();
  if (!q) introuvable("Quote-part inconnue ou déjà réglée");
  return c.json(q);
});

/** EF-OCC-06 : soldes dus par occupant, avec ancienneté. */
r.get("/recouvrement", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const rows = await db
    .select({ occupantId: quotesParts.occupantId, lotId: quotesParts.lotId, du: sql<number>`sum(${quotesParts.montant})::int`, nb: sql<number>`count(*)::int`, plusAncienne: sql<string>`min(${recharges.date})` })
    .from(quotesParts).innerJoin(recharges, eq(recharges.id, quotesParts.rechargeId))
    .where(and(eq(quotesParts.organisationId, c.get("orgId")), eq(quotesParts.statut, "due")))
    .groupBy(quotesParts.occupantId, quotesParts.lotId);
  const occIds = rows.map((x) => x.occupantId).filter((x): x is string => !!x);
  const occ = occIds.length ? await db.select().from(occupants).where(inArray(occupants.id, occIds)) : [];
  const lotsRows = await db.select().from(lots).where(eq(lots.organisationId, c.get("orgId")));
  const sitesRows = await db.select().from(sites).where(eq(sites.organisationId, c.get("orgId")));
  const now = Date.now();
  const lignes = rows.map((x) => {
    const o = occ.find((y) => y.id === x.occupantId);
    const lot = lotsRows.find((l) => l.id === x.lotId);
    const site = sitesRows.find((s) => s.id === lot?.siteId);
    return { occupantId: x.occupantId, occupant: o?.nom ?? "Propriétaire (lot vacant)", telephone: o?.telephone ?? null, lot: lot?.reference, siteId: site?.id, site: site?.nom, du: x.du, nb: x.nb, joursRetard: Math.floor((now - new Date(x.plusAncienne).getTime()) / 86400_000) };
  }).filter((l) => !l.siteId || siteAutorise(c, l.siteId)).sort((a, b) => b.joursRetard - a.joursRetard);
  return c.json({ total: lignes.reduce((a, l) => a + l.du, 0), lignes });
});

/** Relance manuelle (un occupant ou tous ceux en retard). */
r.post("/relances/envoyer", roles(...GESTION), async (c) => {
  const b = z.object({ occupantIds: z.array(z.string()).optional(), message: z.string().optional() }).parse(await c.req.json());
  const n = await relancer(c.get("db"), c.get("orgId"), b.occupantIds, b.message, 0);
  await auditer(c.get("db"), { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "relancer", entite: "occupant", apres: { nb: n } });
  return c.json({ relances: n });
});

/** Relances automatiques (EF-OCC-05) — appelée par le cron. Paliers J+3/7/15 par défaut, un envoi par palier. */
export async function relancer(db: Db, orgId: string, occupantIds?: string[], message?: string, palierMin = 3): Promise<number> {
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
  if (!org) return 0;
  const paliers = org.parametres?.relances ?? [3, 7, 15];
  const conds = [eq(quotesParts.organisationId, orgId), eq(quotesParts.statut, "due")];
  if (occupantIds?.length) conds.push(inArray(quotesParts.occupantId, occupantIds));
  const dues = await db.select({ q: quotesParts, date: recharges.date }).from(quotesParts).innerJoin(recharges, eq(recharges.id, quotesParts.rechargeId)).where(and(...conds));
  const parOccupant = new Map<string, { du: number; jours: number }>();
  for (const { q, date } of dues) {
    if (!q.occupantId) continue;
    const jours = Math.floor((Date.now() - new Date(date).getTime()) / 86400_000);
    const cur = parOccupant.get(q.occupantId) ?? { du: 0, jours: 0 };
    parOccupant.set(q.occupantId, { du: cur.du + q.montant, jours: Math.max(cur.jours, jours) });
  }
  if (!parOccupant.size) return 0;
  const occ = await db.select().from(occupants).where(inArray(occupants.id, [...parOccupant.keys()]));
  let n = 0;
  for (const o of occ) {
    const { du, jours } = parOccupant.get(o.id)!;
    if (!o.telephone || !o.consentementNotifications) continue;
    const palier = occupantIds?.length ? "manuel" : String(paliers.filter((p) => jours >= p).pop() ?? "");
    if (!occupantIds?.length) {
      if (!palier || jours < palierMin) continue;
      const [deja] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.occupantId, o.id), eq(notifications.modele, `relance_${palier}`), sql`${notifications.creeLe} > now() - interval '20 days'`));
      if (deja) continue;
    }
    const corps = message ?? `${org.nom} : vous devez ${du.toLocaleString("fr-FR")} F d'électricité (quote-part Woyofal). Payez par Wave ou Orange Money : ${lienPayerOccupant(o.id)}`;
    await notifier(db, { organisationId: orgId, destinataire: o.telephone, occupantId: o.id, modele: `relance_${palier}`, corps });
    n++;
  }
  if (n) await traiterFile(db);
  return n;
}

r.get("/notifications", roles(...GESTION), async (c) => {
  const conds = [eq(notifications.organisationId, c.get("orgId"))];
  if (c.req.query("occupantId")) conds.push(eq(notifications.occupantId, c.req.query("occupantId")!));
  const rows = await c.get("db").select().from(notifications).where(and(...conds)).orderBy(desc(notifications.creeLe)).limit(500);
  return c.json(rows);
});

export { asc, lt };
export default r;
