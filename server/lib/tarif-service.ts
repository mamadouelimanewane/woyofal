/**
 * Pont entre la base et le moteur tarifaire pur (src/lib/tarif.ts) et la répartition
 * (src/lib/repartition.ts) : grille en vigueur, cumul de période, quotes-parts.
 */
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "../db";
import { compteurLots, grillesTarifaires, lots, occupants, patternsSms, recharges, relevesSousCompteur } from "../db/schema";
import { GRILLE_2026, calculerRecharge, clePeriode, grilleEnVigueur } from "../../src/lib/tarif";
import { repartir, type PartCalculee } from "../../src/lib/repartition";
import { parserSms, type SmsParse } from "../../src/lib/sms";
import type { GrilleTarifaire } from "../../src/types";
import { num, uid } from "./util";

export function versGrille(g: typeof grillesTarifaires.$inferSelect): GrilleTarifaire {
  return { id: g.id, dateEffet: g.dateEffet, libelle: g.libelle, tranche1: num(g.tranche1), tranche2: num(g.tranche2), tranche3: num(g.tranche3), seuilT1: g.seuilT1, seuilT2: g.seuilT2, redevance: g.redevance, seuilTva: g.seuilTva, tauxTva: num(g.tauxTva), tauxTaxeCommunale: num(g.tauxTaxeCommunale), periode: g.periode as "mois" | "bimestre" };
}

/** Toutes les grilles (la grille CRSE 2026 est insérée si la table est vide). */
export async function grilles(db: Db): Promise<GrilleTarifaire[]> {
  let rows = await db.select().from(grillesTarifaires).orderBy(asc(grillesTarifaires.dateEffet));
  if (rows.length === 0) {
    const g = GRILLE_2026;
    await db.insert(grillesTarifaires).values({ id: g.id, dateEffet: g.dateEffet, libelle: g.libelle, tranche1: String(g.tranche1), tranche2: String(g.tranche2), tranche3: String(g.tranche3), seuilT1: g.seuilT1, seuilT2: g.seuilT2, redevance: g.redevance, seuilTva: g.seuilTva, tauxTva: String(g.tauxTva), tauxTaxeCommunale: String(g.tauxTaxeCommunale), periode: g.periode });
    rows = await db.select().from(grillesTarifaires).orderBy(asc(grillesTarifaires.dateEffet));
  }
  return rows.map(versGrille);
}

export interface Cumul { kwh: number; montant: number; nb: number; periode: string; grille: GrilleTarifaire }

/** Cumul du compteur sur la période de la date (recharges valides strictement antérieures si `avant`). */
export async function cumulPeriode(db: Db, compteurId: string, dateISO: string, avant = false): Promise<Cumul> {
  const grille = grilleEnVigueur(await grilles(db), dateISO);
  const periode = clePeriode(dateISO, grille.periode);
  const conds = [eq(recharges.compteurId, compteurId), eq(recharges.periode, periode), eq(recharges.statut, "valide")];
  if (avant) conds.push(lt(recharges.date, new Date(dateISO)));
  const rows = await db.select({ kwh: recharges.kwh, montant: recharges.montant }).from(recharges).where(and(...conds));
  return { kwh: rows.reduce((a, r) => a + num(r.kwh), 0), montant: rows.reduce((a, r) => a + r.montant, 0), nb: rows.length, periode, grille };
}

export async function calculerPourCompteur(db: Db, compteurId: string, dateISO: string, montant: number) {
  const cumul = await cumulPeriode(db, compteurId, dateISO, true);
  const detail = calculerRecharge(montant, cumul.grille, { kwhCumulePeriode: cumul.kwh, premiereRechargeDuMois: cumul.nb === 0 });
  return { detail, cumul };
}

/** Quotes-parts d'une recharge sur un compteur partagé (EF-REP-03), lots vacants imputés au propriétaire (EF-REP-06). */
export async function repartirRecharge(db: Db, orgId: string, compteurId: string, regle: string, montant: number, dateISO: string): Promise<PartCalculee[]> {
  const ratt = await db.select().from(compteurLots).where(and(eq(compteurLots.compteurId, compteurId), eq(compteurLots.organisationId, orgId)));
  if (ratt.length === 0) return [];
  const lotIds = ratt.map((r) => r.lotId);
  const [lotsRows, occRows, relRows] = await Promise.all([
    db.select().from(lots).where(inArray(lots.id, lotIds)),
    db.select().from(occupants).where(inArray(occupants.lotId, lotIds)),
    db.select().from(relevesSousCompteur).where(inArray(relevesSousCompteur.lotId, lotIds)),
  ]);
  return repartir(montant, {
    regle: regle as any,
    rattachements: ratt.map((r) => ({ compteurId: r.compteurId, lotId: r.lotId, forfait: r.forfait ?? undefined })),
    lots: lotsRows.map((l) => ({ id: l.id, siteId: l.siteId, reference: l.reference, surfaceM2: l.surfaceM2 ?? undefined, etage: l.etage ?? undefined })),
    occupants: occRows.map((o) => ({ id: o.id, lotId: o.lotId, nom: o.nom, telephone: o.telephone ?? "", dateEntree: o.dateEntree, dateSortie: o.dateSortie ?? undefined, caution: o.caution ?? undefined })),
    releves: relRows.map((r) => ({ id: r.id, lotId: r.lotId, date: r.date, index: num(r.index) })),
    dateRecharge: dateISO,
  });
}

/** Parsing SMS : patterns versionnés en base d'abord (EF-RECH-04), repli sur les regex génériques du client. */
export async function analyserSms(db: Db, texte: string): Promise<SmsParse & { pattern?: string }> {
  const patterns = await db.select().from(patternsSms).where(eq(patternsSms.actif, true));
  for (const p of patterns) {
    let rx: RegExp;
    try { rx = new RegExp(p.regex, "i"); } catch { continue; }
    const m = texte.replace(/ /g, " ").match(rx);
    if (!m) continue;
    const lire = (champ: string) => { const i = p.champsMap[champ]; return i != null ? m[i] : undefined; };
    const nombre = (s?: string) => (s ? Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : undefined);
    const code = lire("code")?.replace(/[\s-]/g, "");
    return { operateur: p.operateur as SmsParse["operateur"], montant: nombre(lire("montant")), compteur: lire("compteur"), kwh: nombre(lire("kwh")), codes: code ? [code] : [], reference: lire("reference"), date: lire("date"), brut: texte, pattern: `${p.operateur}#${p.version}` };
  }
  return parserSms(texte);
}

export { uid };
