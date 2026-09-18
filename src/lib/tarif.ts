import type { DetailTarif, GrilleTarifaire } from "../types";

/**
 * Grille en vigueur au 1er janvier 2026 (CRSE). Valeurs administrables :
 * la grille est versionnée par date d'effet, jamais recalculée rétroactivement.
 * Le taux de taxe communale est indicatif — à confirmer sur le PDF CRSE.
 */
export const GRILLE_2026: GrilleTarifaire = {
  id: "grille-2026-01",
  dateEffet: "2026-01-01",
  libelle: "CRSE — 1er janvier 2026",
  tranche1: 82,
  tranche2: 136.49,
  tranche3: 159.36,
  seuilT1: 150,
  seuilT2: 250,
  redevance: 1155,
  seuilTva: 250,
  tauxTva: 0.18,
  tauxTaxeCommunale: 0.025,
  periode: "mois",
};

export function grilleEnVigueur(grilles: GrilleTarifaire[], dateISO: string): GrilleTarifaire {
  const date = dateISO.slice(0, 10);
  const applicables = grilles
    .filter((g) => g.dateEffet <= date)
    .sort((a, b) => (a.dateEffet < b.dateEffet ? 1 : -1));
  return applicables[0] ?? grilles[0] ?? GRILLE_2026;
}

/** Clé de période (mois ou bimestre) servant à cumuler les kWh d'un compteur. */
export function clePeriode(dateISO: string, periode: GrilleTarifaire["periode"]): string {
  const d = new Date(dateISO);
  const mois = d.getMonth();
  const m = periode === "bimestre" ? Math.floor(mois / 2) * 2 : mois;
  return `${d.getFullYear()}-${String(m + 1).padStart(2, "0")}`;
}

interface Segment {
  kwhMax: number; // longueur du segment en kWh (Infinity pour le dernier)
  prixHT: number;
  tva: boolean;
}

/** Découpe l'échelle des kWh en segments homogènes (prix HT constant, TVA constante). */
function segments(g: GrilleTarifaire, kwhDeja: number): Segment[] {
  const bornes = Array.from(new Set([g.seuilT1, g.seuilT2, g.seuilTva])).sort((a, b) => a - b);
  const out: Segment[] = [];
  let debut = kwhDeja;
  for (const borne of [...bornes, Infinity]) {
    if (borne <= debut) continue;
    const prixHT = debut < g.seuilT1 ? g.tranche1 : debut < g.seuilT2 ? g.tranche2 : g.tranche3;
    out.push({ kwhMax: borne - debut, prixHT, tva: debut >= g.seuilTva });
    debut = borne;
  }
  return out;
}

export interface OptionsCalcul {
  /** kWh déjà achetés sur la période pour ce compteur (détermine la tranche de départ). */
  kwhCumulePeriode: number;
  /** true si c'est la première recharge de la période (redevance prélevée). */
  premiereRechargeDuMois: boolean;
}

/** Montant TTC payé → kWh crédités, avec détail redevance / énergie / taxes. */
export function calculerRecharge(montant: number, g: GrilleTarifaire, opts: OptionsCalcul): DetailTarif {
  const redevance = opts.premiereRechargeDuMois ? Math.min(g.redevance, montant) : 0;
  let reste = montant - redevance;
  let kwh = 0;
  let energie = 0;
  let taxeCommunale = 0;
  let tva = 0;

  for (const s of segments(g, opts.kwhCumulePeriode)) {
    if (reste <= 0) break;
    const coefTaxes = 1 + g.tauxTaxeCommunale + (s.tva ? g.tauxTva : 0);
    const prixTTC = s.prixHT * coefTaxes;
    const kwhPossibles = reste / prixTTC;
    const kwhPris = Math.min(kwhPossibles, s.kwhMax);
    const energieSeg = kwhPris * s.prixHT;
    kwh += kwhPris;
    energie += energieSeg;
    taxeCommunale += energieSeg * g.tauxTaxeCommunale;
    if (s.tva) tva += energieSeg * g.tauxTva;
    reste -= kwhPris * prixTTC;
  }

  const total = opts.kwhCumulePeriode + kwh;
  const trancheAtteinte: 1 | 2 | 3 = total <= g.seuilT1 ? 1 : total <= g.seuilT2 ? 2 : 3;

  return {
    kwh: round(kwh, 2),
    redevance,
    energie: round(energie),
    taxeCommunale: round(taxeCommunale),
    tva: round(tva),
    trancheAtteinte,
  };
}

/** kWh souhaités → montant TTC à payer (simulation "combien pour X kWh ?"). */
export function montantPourKwh(kwhVoulus: number, g: GrilleTarifaire, opts: OptionsCalcul): number {
  let montant = opts.premiereRechargeDuMois ? g.redevance : 0;
  let reste = kwhVoulus;
  for (const s of segments(g, opts.kwhCumulePeriode)) {
    if (reste <= 0) break;
    const kwhPris = Math.min(reste, s.kwhMax);
    montant += kwhPris * s.prixHT * (1 + g.tauxTaxeCommunale + (s.tva ? g.tauxTva : 0));
    reste -= kwhPris;
  }
  return Math.ceil(montant);
}

/** Montant à acheter pour atteindre exactement la fin de la tranche 1 (conseil "rester en T1"). */
export function resteAvantTranche(kwhCumule: number, g: GrilleTarifaire): { tranche: 1 | 2 | 3; kwhRestants: number | null } {
  if (kwhCumule < g.seuilT1) return { tranche: 1, kwhRestants: g.seuilT1 - kwhCumule };
  if (kwhCumule < g.seuilT2) return { tranche: 2, kwhRestants: g.seuilT2 - kwhCumule };
  return { tranche: 3, kwhRestants: null };
}

function round(n: number, dec = 0): number {
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}

export const fmtF = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
export const fmtKwh = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kWh`;
