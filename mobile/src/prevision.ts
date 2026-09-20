/**
 * Prévision de recharge (partagée client / serveur).
 * Sans lecture du compteur, on estime le solde : les gens rechargent quand le compteur est presque vide,
 * donc solde ≈ kWh de la dernière recharge − consommation journalière × jours écoulés.
 * La consommation journalière = kWh achetés sur les 90 derniers jours / 90 (ou depuis la première recharge).
 */
export interface RechargePourPrevision { date: string | Date; kwh: number }

export interface Prevision {
  /** kWh consommés par jour en moyenne (sur les 90 derniers jours). */
  kwhParJour: number;
  /** Solde estimé aujourd'hui, en kWh (borné à 0). */
  soldeEstime: number;
  /** Jours restants estimés avant zéro (null si aucune donnée). */
  joursRestants: number | null;
  /** Date estimée de coupure. */
  dateZero: string | null;
  /** Fiabilité : nombre de recharges utilisées pour la moyenne. */
  nbRecharges: number;
  /** kWh recommandés pour tenir jusqu'à la fin du mois. */
  kwhPourFinDeMois: number;
}

export function prevoir(recharges: RechargePourPrevision[], maintenant = new Date()): Prevision | null {
  const tri = recharges.map((r) => ({ date: new Date(r.date), kwh: r.kwh })).filter((r) => !isNaN(r.date.getTime()) && r.date <= maintenant).sort((a, b) => b.date.getTime() - a.date.getTime());
  if (tri.length === 0) return null;
  const fenetre = 90 * 86400_000;
  const debut = new Date(maintenant.getTime() - fenetre);
  const recentes = tri.filter((r) => r.date >= debut);
  const base = recentes.length >= 2 ? recentes : tri.slice(0, 6);
  const plusAncienne = base[base.length - 1].date;
  const jours = Math.max(7, (maintenant.getTime() - plusAncienne.getTime()) / 86400_000);
  const kwhAchetes = base.reduce((a, r) => a + r.kwh, 0);
  const kwhParJour = kwhAchetes / jours;
  if (!(kwhParJour > 0)) return null;
  const derniere = tri[0];
  const joursDepuis = (maintenant.getTime() - derniere.date.getTime()) / 86400_000;
  const soldeEstime = Math.max(0, derniere.kwh - kwhParJour * joursDepuis);
  const joursRestants = Math.floor(soldeEstime / kwhParJour);
  const dateZero = new Date(maintenant.getTime() + joursRestants * 86400_000);
  const finMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0, 23, 59);
  const joursAvantFinMois = Math.max(0, (finMois.getTime() - maintenant.getTime()) / 86400_000);
  return {
    kwhParJour: Math.round(kwhParJour * 100) / 100,
    soldeEstime: Math.round(soldeEstime * 10) / 10,
    joursRestants,
    dateZero: dateZero.toISOString().slice(0, 10),
    nbRecharges: base.length,
    kwhPourFinDeMois: Math.max(0, Math.ceil(kwhParJour * joursAvantFinMois - soldeEstime)),
  };
}
