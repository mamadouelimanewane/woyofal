/**
 * Plan Groupe / Cabinet (EF-BI-06) : un même utilisateur (même téléphone) rattaché à plusieurs
 * organisations peut basculer de l'une à l'autre et consolider leurs chiffres.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { compteurs, organisations, quotesParts, sites, utilisateurs } from "../db/schema.js";
import { TOUS, authentifie, emettreJetons, roles, type Vars } from "../lib/auth.js";
import { rapportMensuel } from "../lib/rapport.js";
import { auditer } from "../lib/audit.js";
import { invalide } from "../lib/util.js";
import type { Db } from "../db/index.js";

const r = new Hono<Vars>();
r.use(authentifie);

/** Toutes les organisations accessibles à l'utilisateur courant (même numéro de téléphone, compte actif). */
async function mesOrganisations(db: Db, telephone: string) {
  return db
    .select({ id: organisations.id, nom: organisations.nom, type: organisations.type, plan: organisations.plan, statut: organisations.statut, role: utilisateurs.role, utilisateurId: utilisateurs.id })
    .from(utilisateurs)
    .innerJoin(organisations, eq(organisations.id, utilisateurs.organisationId))
    .where(and(eq(utilisateurs.telephone, telephone), eq(utilisateurs.actif, true)));
}

r.get("/mes-organisations", async (c) => {
  const user = c.get("user");
  const liste = await mesOrganisations(c.get("db"), user.telephone);
  return c.json(liste.map((o) => ({ ...o, courante: o.id === c.get("orgId") })));
});

/** Bascule vers une autre organisation : nouveaux jetons pour le compte correspondant. */
r.post("/basculer", async (c) => {
  const { organisationId } = z.object({ organisationId: z.string() }).parse(await c.req.json());
  const db = c.get("db");
  const user = c.get("user");
  const cible = (await mesOrganisations(db, user.telephone)).find((o) => o.id === organisationId);
  if (!cible) invalide("Organisation inaccessible");
  const [compte] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, cible.utilisateurId));
  const jetons = await emettreJetons(db, compte);
  await auditer(db, { organisationId, utilisateurId: compte.id, action: "basculer", entite: "organisation", entiteId: organisationId });
  return c.json(jetons);
});

/** Consolidation multi-organisations pour un mois : totaux par organisation et global. */
r.get("/groupe/consolidation/:mois", roles(...TOUS), async (c) => {
  const mois = c.req.param("mois");
  if (!/^\d{4}-\d{2}$/.test(mois)) invalide("Format AAAA-MM attendu");
  const db = c.get("db");
  const orgs = await mesOrganisations(db, c.get("user").telephone);
  const lignes = [];
  for (const o of orgs) {
    if (!["admin", "gestionnaire", "lecture", "superadmin"].includes(o.role)) continue;
    const rap = await rapportMensuel(db, o.id, mois);
    const [{ nbSites }] = await db.select({ nbSites: sql<number>`count(*)::int` }).from(sites).where(and(eq(sites.organisationId, o.id), isNull(sites.archiveLe)));
    const [{ nbCompteurs }] = await db.select({ nbCompteurs: sql<number>`count(*)::int` }).from(compteurs).where(and(eq(compteurs.organisationId, o.id), isNull(compteurs.archiveLe), eq(compteurs.statut, "actif")));
    const [{ du }] = await db.select({ du: sql<number>`coalesce(sum(${quotesParts.montant}), 0)::int` }).from(quotesParts).where(and(eq(quotesParts.organisationId, o.id), eq(quotesParts.statut, "due")));
    lignes.push({ organisationId: o.id, nom: o.nom, type: o.type, plan: o.plan, role: o.role, nbSites, nbCompteurs, depense: rap.total.depense, kwh: rap.total.kwh, nbRecharges: rap.total.nbRecharges, variationPct: rap.total.variationPct, budget: rap.total.budget, quotesPartsDues: du, signaux: rap.signaux.length, alertes: rap.alertes.filter((a) => !a.traitee).length });
  }
  const total = { depense: lignes.reduce((a, l) => a + l.depense, 0), kwh: Math.round(lignes.reduce((a, l) => a + l.kwh, 0) * 10) / 10, nbRecharges: lignes.reduce((a, l) => a + l.nbRecharges, 0), nbSites: lignes.reduce((a, l) => a + l.nbSites, 0), nbCompteurs: lignes.reduce((a, l) => a + l.nbCompteurs, 0), quotesPartsDues: lignes.reduce((a, l) => a + l.quotesPartsDues, 0) };
  return c.json({ mois, organisations: lignes.sort((a, b) => b.depense - a.depense), total });
});

export default r;
