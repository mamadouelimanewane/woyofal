/**
 * Instantané complet de l'organisation courante, au format attendu par le store du client
 * (src/store/useStore.ts). Une organisation reste petite (quelques centaines de lignes) :
 * un seul appel au chargement, puis rafraîchissement après chaque mutation.
 */
import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { uid } from "../lib/util";
import { alertes, compteurLots, compteurs, lots, occupants, organisations, quotesParts, recharges, relevesSousCompteur, sites, smsEntrants, utilisateurs } from "../db/schema";
import { GESTION, TOUS, authentifie, roles, siteAutorise, type Vars } from "../lib/auth";
import { grilles } from "../lib/tarif-service";
import { num } from "../lib/util";
import { publicUser } from "./auth";

const r = new Hono<Vars>();
r.use(authentifie);

r.get("/snapshot", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const orgId = c.get("orgId");
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
  if (!org) return c.json({ erreur: "Organisation inconnue" }, 404);
  const [us, ss, ls, cs, cl, os, rs, qp, rl, al, g, smsAttente] = await Promise.all([
    db.select().from(utilisateurs).where(eq(utilisateurs.organisationId, orgId)),
    db.select().from(sites).where(and(eq(sites.organisationId, orgId), isNull(sites.archiveLe))),
    db.select().from(lots).where(and(eq(lots.organisationId, orgId), isNull(lots.archiveLe))),
    db.select().from(compteurs).where(and(eq(compteurs.organisationId, orgId), isNull(compteurs.archiveLe))),
    db.select().from(compteurLots).where(eq(compteurLots.organisationId, orgId)),
    db.select().from(occupants).where(and(eq(occupants.organisationId, orgId), isNull(occupants.archiveLe))),
    db.select().from(recharges).where(and(eq(recharges.organisationId, orgId), eq(recharges.statut, "valide"))).orderBy(desc(recharges.date)).limit(20000),
    db.select().from(quotesParts).where(eq(quotesParts.organisationId, orgId)),
    db.select().from(relevesSousCompteur).where(eq(relevesSousCompteur.organisationId, orgId)),
    db.select().from(alertes).where(eq(alertes.organisationId, orgId)),
    grilles(db),
    db.select().from(smsEntrants).where(and(eq(smsEntrants.organisationId, orgId), eq(smsEntrants.statut, "en_attente"))),
  ]);
  const sitesVisibles = ss.filter((s) => siteAutorise(c, s.id));
  const siteIds = new Set(sitesVisibles.map((s) => s.id));
  const lotsVisibles = ls.filter((l) => siteIds.has(l.siteId));
  const lotIds = new Set(lotsVisibles.map((l) => l.id));
  const cptVisibles = cs.filter((x) => siteIds.has(x.siteId));
  const cptIds = new Set(cptVisibles.map((x) => x.id));
  return c.json({
    organisation: { id: org.id, nom: org.nom, type: org.type, plan: org.plan, ninea: org.ninea ?? undefined, statut: org.statut, finEssai: org.finEssai, parametres: org.parametres },
    utilisateurs: us.map(publicUser),
    sites: sitesVisibles.map((s) => ({ id: s.id, organisationId: s.organisationId, nom: s.nom, type: s.type, adresse: s.adresse ?? "", surfaceM2: s.surfaceM2 ?? undefined, budgetMensuel: s.budgetMensuel ?? undefined, responsable: s.responsable ?? undefined })),
    lots: lotsVisibles.map((l) => ({ id: l.id, siteId: l.siteId, reference: l.reference, surfaceM2: l.surfaceM2 ?? undefined, etage: l.etage ?? undefined })),
    compteurs: cptVisibles.map((x) => ({ id: x.id, siteId: x.siteId, numero: x.numero, libelle: x.libelle ?? undefined, typeTarif: x.typeTarif, puissanceKva: x.puissanceKva == null ? undefined : num(x.puissanceKva), statut: x.statut, partage: x.partage })),
    rattachements: cl.filter((x) => cptIds.has(x.compteurId)).map((x) => ({ compteurId: x.compteurId, lotId: x.lotId, forfait: x.forfait ?? undefined })),
    regles: cptVisibles.map((x) => ({ compteurId: x.id, regle: x.regleRepartition })),
    occupants: os.filter((o) => lotIds.has(o.lotId)).map((o) => ({ id: o.id, lotId: o.lotId, nom: o.nom, telephone: o.telephone ?? "", dateEntree: o.dateEntree, dateSortie: o.dateSortie ?? undefined, caution: o.caution ?? undefined })),
    recharges: rs.filter((x) => cptIds.has(x.compteurId)).map((x) => ({ id: x.id, compteurId: x.compteurId, date: x.date.toISOString(), montant: x.montant, kwh: num(x.kwh), redevance: x.redevance, energie: x.energie, taxeCommunale: x.taxeCommunale, tva: x.tva, trancheAtteinte: x.trancheAtteinte, canal: x.canal, codeRecharge: x.codeRecharge ?? undefined, referencePaiement: x.referencePaiement ?? undefined, saisiPar: x.saisiPar ?? "", note: x.note ?? undefined })),
    quotesParts: qp.filter((x) => lotIds.has(x.lotId)).map((x) => ({ id: x.id, rechargeId: x.rechargeId, occupantId: x.occupantId ?? "", lotId: x.lotId, montant: x.montant, statut: x.statut, datePaiement: x.datePaiement?.toISOString().slice(0, 10), moyenPaiement: x.moyenPaiement ?? undefined, quittanceNumero: x.quittanceNumero ?? undefined })),
    releves: rl.filter((x) => lotIds.has(x.lotId)).map((x) => ({ id: x.id, lotId: x.lotId, date: x.date, index: num(x.index) })),
    alertesTraitees: al.filter((a) => a.traiteeLe).map((a) => a.cle),
    grilles: g,
    smsEnAttente: smsAttente.length,
  });
});

/** Marque traitée une alerte calculée côté client (clé idempotente type-cible-période). */
r.post("/alertes/:cle/traiter", roles(...GESTION), async (c) => {
  const cle = c.req.param("cle");
  const { commentaire } = z.object({ commentaire: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const db = c.get("db");
  const [type] = cle.split("-");
  await db.insert(alertes).values({ id: uid(), organisationId: c.get("orgId"), type, message: cle, cle, traiteeLe: new Date(), traiteePar: c.get("user").id, commentaire })
    .onConflictDoUpdate({ target: [alertes.organisationId, alertes.cle], set: { traiteeLe: new Date(), traiteePar: c.get("user").id, commentaire } });
  return c.json({ ok: true });
});

export default r;
