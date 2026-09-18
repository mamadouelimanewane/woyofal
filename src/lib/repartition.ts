import type { CompteurLot, Lot, Occupant, RegleRepartition, ReleveSousCompteur } from "../types";

export interface PartCalculee {
  lotId: string;
  occupantId: string | null;
  montant: number;
  base: string; // explication lisible ("1/6", "42 m²", "index +120 kWh", "forfait")
}

export interface ContexteRepartition {
  regle: RegleRepartition;
  rattachements: CompteurLot[];
  lots: Lot[];
  occupants: Occupant[];
  releves: ReleveSousCompteur[];
  dateRecharge: string;
}

/** Occupant en place dans un lot à une date donnée (le plus récent non sorti). */
export function occupantDuLot(lotId: string, occupants: Occupant[], dateISO: string): Occupant | null {
  const date = dateISO.slice(0, 10);
  return (
    occupants
      .filter((o) => o.lotId === lotId && o.dateEntree <= date && (!o.dateSortie || o.dateSortie >= date))
      .sort((a, b) => (a.dateEntree < b.dateEntree ? 1 : -1))[0] ?? null
  );
}

/** Consommation d'un sous-compteur = différence entre les deux derniers index avant la date. */
function consoSousCompteur(lotId: string, releves: ReleveSousCompteur[], dateISO: string): number {
  const r = releves
    .filter((x) => x.lotId === lotId && x.date <= dateISO)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (r.length < 2) return 0;
  return Math.max(0, r[0].index - r[1].index);
}

/**
 * Répartit un montant entre les lots rattachés à un compteur partagé.
 * Les arrondis sont poussés sur la dernière part pour que la somme soit exacte.
 */
export function repartir(montant: number, ctx: ContexteRepartition): PartCalculee[] {
  const lignes = ctx.rattachements
    .map((r) => ({ r, lot: ctx.lots.find((l) => l.id === r.lotId) }))
    .filter((x): x is { r: CompteurLot; lot: Lot } => !!x.lot);
  if (lignes.length === 0) return [];

  let poids: { lotId: string; poids: number; base: string; fixe?: number }[];

  switch (ctx.regle) {
    case "surface": {
      poids = lignes.map(({ lot }) => ({ lotId: lot.id, poids: lot.surfaceM2 ?? 0, base: `${lot.surfaceM2 ?? 0} m²` }));
      if (poids.every((p) => p.poids === 0)) poids = poids.map((p) => ({ ...p, poids: 1, base: "parts égales (surfaces absentes)" }));
      break;
    }
    case "sous_compteur": {
      poids = lignes.map(({ lot }) => {
        const kwh = consoSousCompteur(lot.id, ctx.releves, ctx.dateRecharge);
        return { lotId: lot.id, poids: kwh, base: `index +${kwh} kWh` };
      });
      if (poids.every((p) => p.poids === 0)) poids = poids.map((p) => ({ ...p, poids: 1, base: "parts égales (relevés absents)" }));
      break;
    }
    case "forfait": {
      // Chaque lot paie son forfait ; le solde (positif) est réparti à parts égales.
      const totalForfaits = lignes.reduce((s, { r }) => s + (r.forfait ?? 0), 0);
      const solde = Math.max(0, montant - totalForfaits);
      poids = lignes.map(({ r, lot }) => ({ lotId: lot.id, poids: 1, base: `forfait ${r.forfait ?? 0} F + solde`, fixe: (r.forfait ?? 0) + solde / lignes.length }));
      break;
    }
    case "egal":
    default:
      poids = lignes.map(({ lot }) => ({ lotId: lot.id, poids: 1, base: `1/${lignes.length}` }));
  }

  const totalPoids = poids.reduce((s, p) => s + p.poids, 0) || 1;
  const parts: PartCalculee[] = poids.map((p) => ({
    lotId: p.lotId,
    occupantId: occupantDuLot(p.lotId, ctx.occupants, ctx.dateRecharge)?.id ?? null,
    montant: Math.round(p.fixe ?? (montant * p.poids) / totalPoids),
    base: p.base,
  }));

  const ecart = montant - parts.reduce((s, p) => s + p.montant, 0);
  if (ecart !== 0 && parts.length) parts[parts.length - 1].montant += ecart;
  return parts;
}

export const LIBELLE_REGLE: Record<RegleRepartition, string> = {
  egal: "Parts égales",
  surface: "Prorata surface (m²)",
  sous_compteur: "Prorata sous-compteurs (index)",
  forfait: "Forfait par lot + solde réparti",
};
