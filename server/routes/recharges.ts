/** Recharges, ingestion SMS, relevés, cumul de période (CDC v2 § 3.3 – 3.5). */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { compteurs, ecartsCalcul, occupants, organisations, quotesParts, recharges, relevesSousCompteur, smsEntrants } from "../db/schema.js";
import { ECRITURE, GESTION, TOUS, authentifie, roles, siteAutorise, type Vars } from "../lib/auth.js";
import { auditer } from "../lib/audit.js";
import { notifier } from "../lib/notifications.js";
import { analyserSms, calculerPourCompteur, cumulPeriode, repartirRecharge } from "../lib/tarif-service.js";
import { introuvable, invalide, num, uid } from "../lib/util.js";
import { resteAvantTranche } from "../../src/lib/tarif.js";
import type { Db } from "../db/index.js";

const r = new Hono<Vars>();

const RechargeBody = z.object({
  compteurId: z.string(),
  date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  montant: z.number().int().positive(),
  canal: z.enum(["sms", "ocr", "manuel", "api"]).default("manuel"),
  operateur: z.string().optional(),
  codeRecharge: z.string().optional(),
  referencePaiement: z.string().optional(),
  kwhTicket: z.number().positive().optional(),
  justificatifUrl: z.string().optional(),
  smsBrut: z.string().optional(),
  note: z.string().optional(),
  refacturer: z.boolean().optional(),
});

interface Creation { org: string; user: string | null; body: z.infer<typeof RechargeBody> }

/** Cœur métier partagé entre la saisie et l'ingestion SMS. */
async function creerRecharge(db: Db, { org, user, body }: Creation) {
  const [cpt] = await db.select().from(compteurs).where(and(eq(compteurs.id, body.compteurId), eq(compteurs.organisationId, org)));
  if (!cpt) introuvable("Compteur inconnu");
  const dateISO = body.date.length === 10 ? `${body.date}T12:00:00+00:00` : body.date;
  const date = new Date(dateISO);

  // EF-RECH-06 : doublons
  if (body.codeRecharge) {
    const [dup] = await db.select({ id: recharges.id }).from(recharges).where(and(eq(recharges.organisationId, org), eq(recharges.codeRecharge, body.codeRecharge), eq(recharges.statut, "valide")));
    if (dup) throw new HTTPException(409, { message: "Recharge déjà enregistrée (même code)" });
  }
  const [proche] = await db.select({ id: recharges.id }).from(recharges).where(and(eq(recharges.compteurId, cpt.id), eq(recharges.montant, body.montant), eq(recharges.statut, "valide"), gte(recharges.date, new Date(date.getTime() - 120_000)), lte(recharges.date, new Date(date.getTime() + 120_000))));
  if (proche) throw new HTTPException(409, { message: "Recharge identique enregistrée à la même heure (doublon probable)" });

  const { detail, cumul } = await calculerPourCompteur(db, cpt.id, dateISO, body.montant);
  let kwh = detail.kwh;
  let ecart: { kwhCalcule: number; kwhTicket: number; ecartPct: number } | null = null;
  // RG-05 : la valeur du ticket prime si l'écart dépasse 3 %
  if (body.kwhTicket) {
    const pct = detail.kwh > 0 ? Math.abs(body.kwhTicket - detail.kwh) / detail.kwh * 100 : 100;
    if (pct > 3) { ecart = { kwhCalcule: detail.kwh, kwhTicket: body.kwhTicket, ecartPct: Math.round(pct * 100) / 100 }; kwh = body.kwhTicket; }
  }

  const id = uid();
  const [rec] = await db.insert(recharges).values({
    id, organisationId: org, compteurId: cpt.id, date, periode: cumul.periode, montant: body.montant, kwh: kwh.toFixed(2),
    redevance: detail.redevance, energie: detail.energie, taxeCommunale: detail.taxeCommunale, tva: detail.tva, trancheAtteinte: detail.trancheAtteinte,
    grilleId: cumul.grille.id, canal: body.canal, operateur: body.operateur, codeRecharge: body.codeRecharge, referencePaiement: body.referencePaiement,
    kwhTicket: body.kwhTicket?.toFixed(2), justificatifUrl: body.justificatifUrl, smsBrut: body.smsBrut, note: body.note, saisiPar: user, creePar: user,
  }).returning();
  if (ecart) await db.insert(ecartsCalcul).values({ id: uid(), rechargeId: id, kwhCalcule: ecart.kwhCalcule.toFixed(2), kwhTicket: ecart.kwhTicket.toFixed(2), ecartPct: ecart.ecartPct.toFixed(2), grilleId: cumul.grille.id });

  // EF-REP-03 : quotes-parts
  let parts: (typeof quotesParts.$inferSelect)[] = [];
  if (cpt.partage || body.refacturer) {
    const calc = await repartirRecharge(db, org, cpt.id, cpt.regleRepartition, body.montant, dateISO);
    if (calc.length) {
      parts = await db.insert(quotesParts).values(calc.map((p) => ({ id: uid(), organisationId: org, rechargeId: id, occupantId: p.occupantId, lotId: p.lotId, montant: p.montant, creePar: user }))).returning();
      await notifierQuotesParts(db, org, cpt, parts, body.montant);
    }
  }
  await auditer(db, { organisationId: org, utilisateurId: user, action: "creer", entite: "recharge", entiteId: id, apres: { compteur: cpt.numero, montant: body.montant, kwh, canal: body.canal } });
  return { recharge: { ...rec, kwh: num(rec.kwh), kwhTicket: rec.kwhTicket == null ? null : num(rec.kwhTicket) }, quotesParts: parts, ecart, cumulApres: { kwh: cumul.kwh + kwh, nb: cumul.nb + 1, periode: cumul.periode } };
}

async function notifierQuotesParts(db: Db, org: string, cpt: typeof compteurs.$inferSelect, parts: (typeof quotesParts.$inferSelect)[], montant: number) {
  const ids = parts.map((p) => p.occupantId).filter((x): x is string => !!x);
  if (!ids.length) return;
  const [o] = await db.select({ nom: organisations.nom, p: organisations.parametres }).from(organisations).where(eq(organisations.id, org));
  const occ = await db.select().from(occupants).where(inArray(occupants.id, ids));
  for (const p of parts) {
    const oc = occ.find((x) => x.id === p.occupantId);
    if (!oc?.telephone || !oc.consentementNotifications) continue;
    const corps = o.p?.langue === "wo"
      ? `${o.nom} : kurañ bu ${cpt.libelle ?? cpt.numero} ñu def ${montant.toLocaleString("fr-FR")} F. Sa wàll : ${p.montant.toLocaleString("fr-FR")} F.`
      : `${o.nom} : recharge de ${montant.toLocaleString("fr-FR")} F sur le compteur ${cpt.libelle ?? cpt.numero}. Votre quote-part : ${p.montant.toLocaleString("fr-FR")} F.`;
    await notifier(db, { organisationId: org, destinataire: oc.telephone, occupantId: oc.id, modele: "quote_part", corps });
  }
}

// ---------- Ingestion SMS par clé d'organisation (EF-RECH-03), sans JWT ----------
r.post("/recharges/sms", async (c) => {
  const cle = c.req.header("x-api-key") ?? "";
  const b = z.object({ texte: z.string().min(10), expediteur: z.string().optional(), recuLe: z.string().optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [org] = cle ? await db.select().from(organisations).where(eq(organisations.cleApi, cle)) : [];
  if (!org) throw new HTTPException(401, { message: "Clé d'organisation invalide" });
  const analyse = await analyserSms(db, b.texte);
  const smsId = uid();
  const enregistrer = async (statut: string, rechargeId?: string) => db.insert(smsEntrants).values({ id: smsId, organisationId: org.id, brut: b.texte, expediteur: b.expediteur, analyse: analyse as any, statut, rechargeId });

  if (!analyse.compteur || !analyse.montant) { await enregistrer("en_attente"); return c.json({ statut: "en_attente", motif: "montant ou compteur non reconnu", analyse, smsId }, 202); }
  const [cpt] = await db.select().from(compteurs).where(and(eq(compteurs.organisationId, org.id), eq(compteurs.numero, analyse.compteur)));
  if (!cpt) { await enregistrer("en_attente"); return c.json({ statut: "en_attente", motif: `compteur ${analyse.compteur} inconnu`, analyse, smsId }, 202); }
  try {
    const res = await creerRecharge(db, { org: org.id, user: null, body: { compteurId: cpt.id, date: b.recuLe ?? new Date().toISOString(), montant: Math.round(analyse.montant), canal: "sms", operateur: analyse.operateur, codeRecharge: analyse.codes[0], referencePaiement: analyse.reference, kwhTicket: analyse.kwh, smsBrut: b.texte } });
    await enregistrer("rattache", res.recharge.id);
    return c.json({ statut: "rattache", ...res }, 201);
  } catch (e) {
    if (e instanceof HTTPException && e.status === 409) { await enregistrer("doublon"); return c.json({ statut: "doublon", analyse }, 200); }
    throw e;
  }
});

r.use(authentifie);

r.post("/recharges/parse", roles(...TOUS), async (c) => {
  const { texte } = z.object({ texte: z.string().min(5) }).parse(await c.req.json());
  const db = c.get("db");
  const analyse = await analyserSms(db, texte);
  const [cpt] = analyse.compteur ? await db.select({ id: compteurs.id, libelle: compteurs.libelle, siteId: compteurs.siteId }).from(compteurs).where(and(eq(compteurs.organisationId, c.get("orgId")), eq(compteurs.numero, analyse.compteur))) : [];
  return c.json({ ...analyse, compteurId: cpt?.id ?? null });
});

r.get("/recharges", roles(...TOUS), async (c) => {
  const q = c.req.query();
  const db = c.get("db");
  const conds = [eq(recharges.organisationId, c.get("orgId"))];
  if (q.compteurId) conds.push(eq(recharges.compteurId, q.compteurId));
  if (q.periode) conds.push(eq(recharges.periode, q.periode));
  if (q.depuis) conds.push(gte(recharges.date, new Date(q.depuis)));
  if (q.statut) conds.push(eq(recharges.statut, q.statut));
  const rows = await db.select().from(recharges).where(and(...conds)).orderBy(desc(recharges.date)).limit(Math.min(Number(q.limit ?? 500), 5000));
  return c.json(rows.map((x) => ({ ...x, kwh: num(x.kwh), kwhTicket: x.kwhTicket == null ? null : num(x.kwhTicket) })));
});

r.post("/recharges", roles(...ECRITURE), async (c) => {
  const body = RechargeBody.parse(await c.req.json());
  const db = c.get("db");
  const [cpt] = await db.select({ siteId: compteurs.siteId }).from(compteurs).where(and(eq(compteurs.id, body.compteurId), eq(compteurs.organisationId, c.get("orgId"))));
  if (!cpt || !siteAutorise(c, cpt.siteId)) introuvable("Compteur inconnu");
  return c.json(await creerRecharge(db, { org: c.get("orgId"), user: c.get("user").id, body }), 201);
});

/** Simulation sans enregistrement : tarif + quotes-parts prévisionnelles. */
r.post("/recharges/simuler", roles(...TOUS), async (c) => {
  const b = z.object({ compteurId: z.string(), montant: z.number().int().positive(), date: z.string().optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [cpt] = await db.select().from(compteurs).where(and(eq(compteurs.id, b.compteurId), eq(compteurs.organisationId, c.get("orgId"))));
  if (!cpt) introuvable("Compteur inconnu");
  const dateISO = b.date ?? new Date().toISOString();
  const { detail, cumul } = await calculerPourCompteur(db, cpt.id, dateISO, b.montant);
  const parts = cpt.partage ? await repartirRecharge(db, c.get("orgId"), cpt.id, cpt.regleRepartition, b.montant, dateISO) : [];
  return c.json({ detail, cumulAvant: { kwh: cumul.kwh, nb: cumul.nb, periode: cumul.periode }, grille: cumul.grille.libelle, quotesParts: parts });
});

/** EF-RECH-10 : annulation tracée ; les quotes-parts non payées sont annulées, les payées restent (RG-07). */
r.post("/recharges/:id/annuler", roles(...GESTION), async (c) => {
  const { motif } = z.object({ motif: z.string().min(3) }).parse(await c.req.json());
  const db = c.get("db");
  const [rec] = await db.update(recharges).set({ statut: "annulee", motifAnnulation: motif, modifieLe: new Date(), modifiePar: c.get("user").id }).where(and(eq(recharges.id, c.req.param("id")), eq(recharges.organisationId, c.get("orgId")), eq(recharges.statut, "valide"))).returning();
  if (!rec) introuvable("Recharge inconnue ou déjà annulée");
  const annulees = await db.update(quotesParts).set({ statut: "annulee", modifieLe: new Date() }).where(and(eq(quotesParts.rechargeId, rec.id), eq(quotesParts.statut, "due"))).returning({ id: quotesParts.id });
  const [{ payees }] = await db.select({ payees: sql<number>`count(*)::int` }).from(quotesParts).where(and(eq(quotesParts.rechargeId, rec.id), eq(quotesParts.statut, "payee")));
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "annuler", entite: "recharge", entiteId: rec.id, apres: { motif, quotesPartsAnnulees: annulees.length, quotesPartsPayeesConservees: payees } });
  return c.json({ ok: true, quotesPartsAnnulees: annulees.length, quotesPartsPayeesConservees: payees });
});

/** Position du compteur dans les tranches sur un mois (EF-RECH-08/09). */
r.get("/compteurs/:id/mois/:mois", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const [cpt] = await db.select().from(compteurs).where(and(eq(compteurs.id, c.req.param("id")), eq(compteurs.organisationId, c.get("orgId"))));
  if (!cpt) introuvable("Compteur inconnu");
  const mois = c.req.param("mois");
  if (!/^\d{4}-\d{2}$/.test(mois)) invalide("Format attendu AAAA-MM");
  const cumul = await cumulPeriode(db, cpt.id, `${mois}-15T12:00:00Z`);
  const conseil = resteAvantTranche(cumul.kwh, cumul.grille);
  const rows = await db.select().from(recharges).where(and(eq(recharges.compteurId, cpt.id), eq(recharges.periode, cumul.periode), eq(recharges.statut, "valide"))).orderBy(desc(recharges.date));
  return c.json({ compteur: cpt, periode: cumul.periode, kwh: Math.round(cumul.kwh * 100) / 100, montant: cumul.montant, nb: cumul.nb, coutMoyenKwh: cumul.kwh ? Math.round(cumul.montant / cumul.kwh) : null, tranche: conseil.tranche, kwhRestantsAvantTrancheSuivante: conseil.kwhRestants, grille: cumul.grille.libelle, recharges: rows.map((x) => ({ ...x, kwh: num(x.kwh) })) });
});

// ---------- SMS en attente de rattachement (EF-RECH-05) ----------
r.get("/sms-entrants", roles(...GESTION), async (c) => {
  const rows = await c.get("db").select().from(smsEntrants).where(and(eq(smsEntrants.organisationId, c.get("orgId")), eq(smsEntrants.statut, c.req.query("statut") ?? "en_attente"))).orderBy(desc(smsEntrants.recuLe)).limit(200);
  return c.json(rows);
});

r.post("/sms-entrants/:id/rattacher", roles(...GESTION), async (c) => {
  const b = z.object({ compteurId: z.string(), montant: z.number().int().positive().optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [sms] = await db.select().from(smsEntrants).where(and(eq(smsEntrants.id, c.req.param("id")), eq(smsEntrants.organisationId, c.get("orgId")), eq(smsEntrants.statut, "en_attente")));
  if (!sms) introuvable();
  const a = sms.analyse as any;
  const montant = b.montant ?? (a.montant ? Math.round(a.montant) : undefined);
  if (!montant) invalide("Montant requis");
  const res = await creerRecharge(db, { org: c.get("orgId"), user: c.get("user").id, body: { compteurId: b.compteurId, date: sms.recuLe.toISOString(), montant, canal: "sms", operateur: a.operateur, codeRecharge: a.codes?.[0], referencePaiement: a.reference, kwhTicket: a.kwh, smsBrut: sms.brut } });
  await db.update(smsEntrants).set({ statut: "rattache", rechargeId: res.recharge.id }).where(eq(smsEntrants.id, sms.id));
  return c.json(res, 201);
});

r.post("/sms-entrants/:id/ignorer", roles(...GESTION), async (c) => {
  const [sms] = await c.get("db").update(smsEntrants).set({ statut: "ignore" }).where(and(eq(smsEntrants.id, c.req.param("id")), eq(smsEntrants.organisationId, c.get("orgId")))).returning({ id: smsEntrants.id });
  if (!sms) introuvable();
  return c.json({ ok: true });
});

// ---------- Relevés de sous-compteurs (EF-REP-04) ----------
r.get("/releves", roles(...TOUS), async (c) => {
  const conds = [eq(relevesSousCompteur.organisationId, c.get("orgId"))];
  if (c.req.query("lotId")) conds.push(eq(relevesSousCompteur.lotId, c.req.query("lotId")!));
  const rows = await c.get("db").select().from(relevesSousCompteur).where(and(...conds)).orderBy(desc(relevesSousCompteur.date));
  return c.json(rows.map((x) => ({ ...x, index: num(x.index) })));
});

r.post("/releves", roles(...ECRITURE), async (c) => {
  const b = z.object({ lotId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), index: z.number().nonnegative() }).parse(await c.req.json());
  const db = c.get("db");
  const [dernier] = await db.select().from(relevesSousCompteur).where(and(eq(relevesSousCompteur.lotId, b.lotId), eq(relevesSousCompteur.organisationId, c.get("orgId")), lte(relevesSousCompteur.date, b.date))).orderBy(desc(relevesSousCompteur.date)).limit(1);
  if (dernier && num(dernier.index) > b.index) invalide(`Index inférieur au relevé précédent (${dernier.index} le ${dernier.date})`);
  const [rel] = await db.insert(relevesSousCompteur).values({ id: uid(), organisationId: c.get("orgId"), lotId: b.lotId, date: b.date, index: b.index.toFixed(2), saisiPar: c.get("user").id }).returning();
  return c.json({ ...rel, index: num(rel.index) }, 201);
});

export default r;
