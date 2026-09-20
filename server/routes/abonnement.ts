/** Abonnement de l'organisation (CDC v2 § 3.10 / § 8) : calcul du montant, paiement Wave / Orange Money, factures. */
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { compteurs, facturesAbonnement, organisations, paiementsEnLigne, sites } from "../db/schema.js";
import { TOUS, authentifie, roles, type Vars } from "../lib/auth.js";
import { creerPaiement, modeSimulation, moyensDisponibles } from "../lib/paiement.js";
import type { Db } from "../db/index.js";

const r = new Hono<Vars>();
r.use(authentifie);

/** Grille tarifaire des plans (CDC v2 § 8). Montants mensuels en FCFA. */
export function tarifPlan(plan: string, nbCompteurs: number, nbSites: number): { mensuel: number; detail: string } {
  switch (plan) {
    case "starter": return { mensuel: 10000, detail: "Starter — 6 à 20 compteurs" };
    case "immo": {
      const paliers: [number, number][] = [[80, 40000], [200, 90000], [500, 200000]];
      const palier = paliers.find(([max]) => nbCompteurs <= max);
      const unitaire = nbCompteurs * 600;
      // Le client paie le moins cher des deux formules (par compteur ou forfait de palier).
      if (palier && palier[1] < unitaire) return { mensuel: palier[1], detail: `Immo — forfait jusqu'à ${palier[0]} compteurs` };
      return { mensuel: unitaire, detail: `Immo — ${nbCompteurs} compteurs × 600 F` };
    }
    case "entreprise": { const n = Math.max(10, nbSites); return { mensuel: n * 3000, detail: `Entreprise — ${n} sites × 3 000 F (minimum 10)` }; }
    case "groupe": return { mensuel: 0, detail: "Groupe — sur devis" };
    default: return { mensuel: 0, detail: "Gratuit — jusqu'à 5 compteurs" };
  }
}

/** Plan recommandé selon l'usage réel (le plan choisi ne peut pas être inférieur). */
export function planRecommande(type: string, nbCompteurs: number, nbSites: number): string {
  if (type === "entreprise") return nbSites > 5 || nbCompteurs > 20 ? "entreprise" : nbCompteurs > 5 ? "starter" : "gratuit";
  if (nbCompteurs <= 5) return "gratuit";
  if (nbCompteurs <= 20) return "starter";
  return "immo";
}

export async function usage(db: Db, orgId: string) {
  const [{ nbCompteurs }] = await db.select({ nbCompteurs: sql<number>`count(*)::int` }).from(compteurs).where(and(eq(compteurs.organisationId, orgId), isNull(compteurs.archiveLe), eq(compteurs.statut, "actif")));
  const [{ nbSites }] = await db.select({ nbSites: sql<number>`count(*)::int` }).from(sites).where(and(eq(sites.organisationId, orgId), isNull(sites.archiveLe)));
  return { nbCompteurs, nbSites };
}

r.get("/abonnement", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const orgId = c.get("orgId");
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
  const u = await usage(db, orgId);
  const recommande = planRecommande(org.type, u.nbCompteurs, u.nbSites);
  const ordre = ["gratuit", "starter", "immo", "entreprise", "groupe"];
  const planEffectif = ordre.indexOf(org.plan) >= ordre.indexOf(recommande) ? org.plan : recommande;
  const t = tarifPlan(planEffectif, u.nbCompteurs, u.nbSites);
  const factures = await db.select().from(facturesAbonnement).where(eq(facturesAbonnement.organisationId, orgId)).orderBy(desc(facturesAbonnement.creeLe)).limit(24);
  const enAttente = await db.select().from(paiementsEnLigne).where(and(eq(paiementsEnLigne.organisationId, orgId), eq(paiementsEnLigne.type, "abonnement"), eq(paiementsEnLigne.statut, "en_attente"))).orderBy(desc(paiementsEnLigne.creeLe)).limit(1);
  return c.json({
    plan: org.plan, planEffectif, planRecommande: recommande, statut: org.statut, echeance: org.finEssai, usage: u,
    mensuel: t.mensuel, annuel: Math.round(t.mensuel * 12 * 0.85), detail: t.detail,
    moyens: moyensDisponibles(), factures, paiementEnAttente: enAttente[0] ? { id: enAttente[0].id, url: enAttente[0].urlPaiement } : null,
  });
});

r.post("/abonnement/payer", roles("admin"), async (c) => {
  const b = z.object({ moyen: z.enum(["wave", "om"]), periodicite: z.enum(["mensuel", "annuel"]).default("mensuel"), plan: z.enum(["starter", "immo", "entreprise"]).optional() }).parse(await c.req.json());
  const db = c.get("db");
  const orgId = c.get("orgId");
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
  const u = await usage(db, orgId);
  const plan = b.plan ?? (org.plan === "gratuit" ? planRecommande(org.type, u.nbCompteurs, u.nbSites) : org.plan);
  const t = tarifPlan(plan, u.nbCompteurs, u.nbSites);
  if (t.mensuel <= 0) return c.json({ erreur: "Ce plan ne se règle pas en ligne" }, 400);
  const montant = b.periodicite === "annuel" ? Math.round(t.mensuel * 12 * 0.85) : t.mensuel;
  if (plan !== org.plan) await db.update(organisations).set({ plan, modifieLe: new Date(), modifiePar: c.get("user").id }).where(eq(organisations.id, orgId));
  try {
    const p = await creerPaiement(db, { organisationId: orgId, type: "abonnement", montant, moyen: b.moyen, periodicite: b.periodicite, libelle: `KURAÑ ${plan} ${b.periodicite}` });
    return c.json({ id: p.id, url: p.urlPaiement, montant, plan, simulation: modeSimulation(b.moyen) }, 201);
  } catch (e: any) {
    return c.json({ erreur: `Le fournisseur de paiement n'a pas répondu : ${e?.message ?? e}` }, 502);
  }
});

export default r;
