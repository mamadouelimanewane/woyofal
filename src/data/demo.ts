import type { Compteur, CompteurLot, Lot, Occupant, Organisation, RegleCompteur, ReleveSousCompteur, Site, Utilisateur } from "../types";

/** Jeu de données de démonstration : un bailleur (Immo) et une chaîne de pharmacies (Entreprise). */

export const ORGANISATIONS: Organisation[] = [
  { id: "org-immo", nom: "Gérance Keur Gorgui", type: "immo", plan: "immo", ninea: "008123456" },
  { id: "org-ent", nom: "Pharmacies Ndiaye & Fils", type: "entreprise", plan: "entreprise", ninea: "004567890" },
];

export const UTILISATEURS: Utilisateur[] = [
  { id: "u-admin-immo", organisationId: "org-immo", role: "admin", nom: "Awa Sarr", telephone: "77 123 45 67" },
  { id: "u-agent-immo", organisationId: "org-immo", role: "agent", nom: "Modou Fall (gardien)", telephone: "76 987 65 43" },
  { id: "u-admin-ent", organisationId: "org-ent", role: "admin", nom: "Dr Ibrahima Ndiaye", telephone: "78 111 22 33" },
  { id: "u-daf-ent", organisationId: "org-ent", role: "lecture", nom: "Fatou Diop (DAF)", telephone: "77 444 55 66" },
];

export const SITES: Site[] = [
  { id: "s-imm1", organisationId: "org-immo", nom: "Immeuble Sérigne Fallou", type: "immeuble", adresse: "Sacré-Cœur 3, Dakar", surfaceM2: 620 },
  { id: "s-cour1", organisationId: "org-immo", nom: "Cour commune Médina", type: "cour commune", adresse: "Rue 22 x 31, Médina", surfaceM2: 280 },
  ...["Sacré-Cœur", "Liberté 6", "Ouakam", "Pikine", "Guédiawaye", "Rufisque", "Thiès", "Mbour"].map((q, i) => ({
    id: `s-ph${i + 1}`,
    organisationId: "org-ent",
    nom: `Pharmacie ${q}`,
    type: "pharmacie",
    adresse: q,
    surfaceM2: 60 + i * 12,
    budgetMensuel: 90000 + (i % 3) * 20000,
    responsable: ["M. Ba", "Mme Sy", "M. Diallo", "Mme Ndour", "M. Gueye", "Mme Faye", "M. Sow", "Mme Kane"][i],
  })),
];

export const LOTS: Lot[] = [
  // Immeuble : 6 appartements avec compteur individuel + parties communes
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `l-imm-${n}`, siteId: "s-imm1", reference: `Appt ${n}`, surfaceM2: n % 2 ? 85 : 110, etage: String(Math.ceil(n / 2)) })),
  // Cour commune : 5 ménages sur un seul compteur
  ...["Chambre 1", "Chambre 2", "Chambre 3", "Studio", "Boutique"].map((r, i) => ({ id: `l-cour-${i + 1}`, siteId: "s-cour1", reference: r, surfaceM2: [20, 20, 25, 35, 30][i] })),
  // Pharmacies : un lot par site
  ...SITES.filter((s) => s.organisationId === "org-ent").map((s) => ({ id: `l-${s.id}`, siteId: s.id, reference: "Officine" })),
];

export const COMPTEURS: Compteur[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `k-imm-${n}`, siteId: "s-imm1", numero: `1421003${String(4560 + n).padStart(4, "0")}`, libelle: `Appt ${n}`, typeTarif: "DPP" as const, puissanceKva: 3.3, statut: "actif" as const, partage: false })),
  { id: "k-imm-com", siteId: "s-imm1", numero: "14210034599", libelle: "Parties communes (ascenseur, éclairage)", typeTarif: "DPP", puissanceKva: 6.6, statut: "actif", partage: true },
  { id: "k-cour", siteId: "s-cour1", numero: "14210034567", libelle: "Compteur unique cour", typeTarif: "DPP", puissanceKva: 6.6, statut: "actif", partage: true },
  ...SITES.filter((s) => s.organisationId === "org-ent").map((s, i) => ({ id: `k-${s.id}`, siteId: s.id, numero: `1420001${String(1122 + i).padStart(4, "0")}`, libelle: "Officine", typeTarif: "PRO" as const, puissanceKva: 10, statut: "actif" as const, partage: false })),
];

export const RATTACHEMENTS: CompteurLot[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ compteurId: `k-imm-${n}`, lotId: `l-imm-${n}` })),
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ compteurId: "k-imm-com", lotId: `l-imm-${n}` })),
  ...[1, 2, 3, 4, 5].map((n) => ({ compteurId: "k-cour", lotId: `l-cour-${n}` })),
  ...SITES.filter((s) => s.organisationId === "org-ent").map((s) => ({ compteurId: `k-${s.id}`, lotId: `l-${s.id}` })),
];

export const REGLES: RegleCompteur[] = [
  { compteurId: "k-imm-com", regle: "surface" },
  { compteurId: "k-cour", regle: "sous_compteur" },
];

const NOMS = ["Mariama Diallo", "Cheikh Ndao", "Aïssatou Ba", "Ousmane Sy", "Ndèye Fatou Gueye", "Pape Malick Seck", "Khady Thiam", "Abdou Karim Dieng", "Sokhna Mbaye", "Lamine Cissé", "Bineta Sène"];

export const OCCUPANTS: Occupant[] = [
  ...[1, 2, 3, 4, 5, 6].map((n, i) => ({ id: `o-imm-${n}`, lotId: `l-imm-${n}`, nom: NOMS[i], telephone: `77 ${200 + n} 00 0${n}`, dateEntree: "2025-0" + ((n % 8) + 1) + "-01", caution: 25000 })),
  ...[1, 2, 3, 4, 5].map((n, i) => ({ id: `o-cour-${n}`, lotId: `l-cour-${n}`, nom: NOMS[6 + i], telephone: `76 ${300 + n} 11 1${n}`, dateEntree: "2025-03-15", caution: 10000 })),
];

/** Relevés de sous-compteurs de la cour (index mensuels). */
export const RELEVES: ReleveSousCompteur[] = (() => {
  const out: ReleveSousCompteur[] = [];
  const base = [1200, 980, 1540, 2100, 3300];
  const conso = [28, 22, 35, 48, 90];
  for (let m = 0; m < 7; m++) {
    const date = `2026-${String(3 + m).padStart(2, "0")}-01`;
    base.forEach((b, i) => out.push({ id: `rl-${m}-${i}`, lotId: `l-cour-${i + 1}`, date, index: b + conso[i] * m }));
  }
  return out;
})();

/** Recharges à générer au démarrage (le store calcule tarif + quotes-parts). */
export interface RechargeDemo {
  compteurId: string;
  date: string;
  montant: number;
  canal: "sms" | "manuel";
}

export function rechargesDemo(): RechargeDemo[] {
  const out: RechargeDemo[] = [];
  const today = new Date();
  // 6 mois d'historique, en s'arrêtant avant aujourd'hui
  for (let m = 5; m >= 0; m--) {
    const y = today.getFullYear();
    const mo = today.getMonth() - m;
    const jour = (j: number) => new Date(y, mo, j, 9 + (j % 8), 15).toISOString();
    const dernierJourValide = (j: number) => new Date(y, mo, j) < today;

    // Appartements : 2 recharges/mois
    for (let n = 1; n <= 6; n++) {
      if (dernierJourValide(3)) out.push({ compteurId: `k-imm-${n}`, date: jour(3), montant: 5000 + n * 1000, canal: "sms" });
      if (dernierJourValide(18)) out.push({ compteurId: `k-imm-${n}`, date: jour(18), montant: 4000 + n * 500, canal: "sms" });
    }
    // Parties communes : 1/mois
    if (dernierJourValide(5)) out.push({ compteurId: "k-imm-com", date: jour(5), montant: 24000, canal: "manuel" });
    // Cour commune : 2/mois
    if (dernierJourValide(2)) out.push({ compteurId: "k-cour", date: jour(2), montant: 20000, canal: "sms" });
    if (dernierJourValide(16)) out.push({ compteurId: "k-cour", date: jour(16), montant: 15000, canal: "sms" });
    // Pharmacies : 3 à 4 recharges/mois, dérive sur Pikine (site 4) au dernier mois, Mbour (site 8) inactif ce mois
    for (let i = 1; i <= 8; i++) {
      const facteur = i === 4 && m === 0 ? 1.8 : 1;
      const jours = [4, 12, 20, 27];
      jours.forEach((j, idx) => {
        if (i === 8 && m === 0) return;
        if (idx === 3 && i % 2 === 0) return;
        if (dernierJourValide(j)) out.push({ compteurId: `k-s-ph${i}`, date: jour(j), montant: Math.round((22000 + i * 1500) * facteur), canal: idx === 0 ? "manuel" : "sms" });
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
