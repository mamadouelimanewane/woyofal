/**
 * Détection serveur des alertes (CDC v2 § 3.8) : budget 80 / 100 %, inactivité, recharge anormale,
 * redevance non payée en fin de mois. Idempotent par clé (type-cible-période) ; les nouvelles alertes
 * sont notifiées par e-mail aux gestionnaires et administrateurs.
 */
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { alertes, compteurs, organisations, recharges, sites, utilisateurs } from "../db/schema.js";
import { notifier } from "./notifications.js";
import { num, uid, urlPublique } from "./util.js";

export interface AlerteDetectee { cle: string; type: string; siteId: string | null; compteurId: string | null; message: string }

const mois = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function detecterAlertes(db: Db, orgId: string, maintenant = new Date()): Promise<AlerteDetectee[]> {
  const out: AlerteDetectee[] = [];
  const m = mois(maintenant);
  const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));
  const debutHist = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 3, 1));
  const [ss, cs, rs] = await Promise.all([
    db.select().from(sites).where(and(eq(sites.organisationId, orgId), isNull(sites.archiveLe))),
    db.select().from(compteurs).where(and(eq(compteurs.organisationId, orgId), isNull(compteurs.archiveLe), eq(compteurs.statut, "actif"))),
    db.select().from(recharges).where(and(eq(recharges.organisationId, orgId), eq(recharges.statut, "valide"), gte(recharges.date, debutHist))).orderBy(desc(recharges.date)),
  ]);
  const jourDuMois = maintenant.getUTCDate();
  const joursMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 0)).getUTCDate();

  for (const s of ss) {
    const cptSite = cs.filter((c) => c.siteId === s.id);
    const ids = new Set(cptSite.map((c) => c.id));
    const duMois = rs.filter((r) => ids.has(r.compteurId) && r.date >= debutMois);
    const dep = duMois.reduce((a, r) => a + r.montant, 0);
    // Budget
    if (s.budgetMensuel) {
      const ratio = dep / s.budgetMensuel;
      if (ratio >= 1) out.push({ cle: `budget100-${s.id}-${m}`, type: "budget_100", siteId: s.id, compteurId: null, message: `${s.nom} : budget mensuel dépassé (${Math.round(ratio * 100)} % — ${dep.toLocaleString("fr-FR")} F pour ${s.budgetMensuel.toLocaleString("fr-FR")} F)` });
      else if (ratio >= 0.8) out.push({ cle: `budget80-${s.id}-${m}`, type: "budget_80", siteId: s.id, compteurId: null, message: `${s.nom} : ${Math.round(ratio * 100)} % du budget mensuel consommé` });
    }
    for (const c of cptSite) {
      const hist = rs.filter((r) => r.compteurId === c.id);
      const derniere = hist[0];
      // Inactivité : seuil du site, sinon 1,5 × cadence moyenne des 6 dernières recharges (min. 12 jours)
      const recentes = hist.slice(0, 6);
      const cadence = recentes.length >= 2 ? (recentes[0].date.getTime() - recentes[recentes.length - 1].date.getTime()) / 86400_000 / (recentes.length - 1) : 15;
      const seuil = s.joursInactiviteAlerte ?? Math.max(12, Math.round(cadence * 1.5));
      const joursSans = derniere ? Math.floor((maintenant.getTime() - derniere.date.getTime()) / 86400_000) : null;
      if (joursSans != null && joursSans >= seuil) out.push({ cle: `inactif-${c.id}-${m}`, type: "inactif", siteId: s.id, compteurId: c.id, message: `${s.nom} — ${c.libelle ?? c.numero} : aucune recharge depuis ${joursSans} jours (seuil ${seuil})` });
      // Anomalie : recharge > moyenne glissante 3 mois × 1,6 (EF-ALERT-03), ou mois projeté > 150 % de la moyenne mensuelle
      const avant = hist.filter((r) => r.date < debutMois);
      if (avant.length >= 3) {
        const moy = avant.reduce((a, r) => a + r.montant, 0) / avant.length;
        const grosse = duMois.filter((r) => r.compteurId === c.id).find((r) => r.montant > moy * 1.6 && r.montant >= 5000);
        if (grosse) out.push({ cle: `anomalie-${c.id}-${grosse.id}`, type: "anomalie", siteId: s.id, compteurId: c.id, message: `${s.nom} — ${c.libelle ?? c.numero} : recharge de ${grosse.montant.toLocaleString("fr-FR")} F, ${Math.round((grosse.montant / moy - 1) * 100)} % au-dessus de la moyenne` });
        const moyMensuelle = avant.reduce((a, r) => a + r.montant, 0) / 3;
        const projete = (duMois.filter((r) => r.compteurId === c.id).reduce((a, r) => a + r.montant, 0) * joursMois) / jourDuMois;
        if (jourDuMois >= 7 && moyMensuelle > 0 && projete > moyMensuelle * 1.5) out.push({ cle: `derive-${c.id}-${m}`, type: "anomalie", siteId: s.id, compteurId: c.id, message: `${s.nom} — ${c.libelle ?? c.numero} : dépense projetée +${Math.round((projete / moyMensuelle - 1) * 100)} % vs moyenne 3 mois` });
      }
      // Fin de mois : aucune recharge ce mois → redevance non réglée, cumul le mois prochain
      if (jourDuMois >= joursMois - 3 && !duMois.some((r) => r.compteurId === c.id) && hist.length > 0) out.push({ cle: `redevance-${c.id}-${m}`, type: "redevance", siteId: s.id, compteurId: c.id, message: `${s.nom} — ${c.libelle ?? c.numero} : aucune recharge ce mois, la redevance sera prélevée sur la prochaine` });
    }
  }
  return out;
}

/** Enregistre les alertes nouvelles (clé inconnue) et notifie les responsables. Retourne le nombre de nouvelles. */
export async function enregistrerAlertes(db: Db, orgId: string, detectees: AlerteDetectee[]): Promise<number> {
  if (!detectees.length) return 0;
  const existantes = await db.select({ cle: alertes.cle }).from(alertes).where(eq(alertes.organisationId, orgId));
  const connues = new Set(existantes.map((x) => x.cle));
  const nouvelles = detectees.filter((a) => !connues.has(a.cle));
  if (!nouvelles.length) return 0;
  await db.insert(alertes).values(nouvelles.map((a) => ({ id: uid(), organisationId: orgId, siteId: a.siteId, compteurId: a.compteurId, type: a.type, message: a.message, cle: a.cle }))).onConflictDoNothing();
  const [org] = await db.select({ nom: organisations.nom }).from(organisations).where(eq(organisations.id, orgId));
  const destinataires = await db.select().from(utilisateurs).where(and(eq(utilisateurs.organisationId, orgId), eq(utilisateurs.actif, true), sql`${utilisateurs.role} in ('admin', 'gestionnaire')`));
  const corps = `${org.nom} — ${nouvelles.length} nouvelle(s) alerte(s) KURAÑ :\n${nouvelles.map((a) => `• ${a.message}`).join("\n")}\n\nVoir : ${urlPublique()}/alertes`;
  for (const u of destinataires) {
    if (u.email) await notifier(db, { organisationId: orgId, destinataire: u.email, modele: "alertes", corps, canal: "email" });
  }
  return nouvelles.length;
}

export async function alertesOuvertes(db: Db, orgId: string) {
  return db.select().from(alertes).where(and(eq(alertes.organisationId, orgId), isNull(alertes.traiteeLe))).orderBy(desc(alertes.declencheeLe));
}

export { lt, num };
