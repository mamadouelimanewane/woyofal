/**
 * Rapport mensuel d'organisation (CDC v2 § 3.9, EF-BI-01/02/03) et export comptable (EF-BI-05).
 * Calculs purs à partir des recharges valides du mois ; PDF avec pdf-lib (même approche que la quittance).
 */
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Db } from "../db/index.js";
import { alertes, compteurs, organisations, recharges, sites } from "../db/schema.js";
import { num } from "./util.js";

export interface LigneSite {
  siteId: string; nom: string; type: string; surfaceM2: number | null; budget: number | null;
  depense: number; kwh: number; nbRecharges: number; nbCompteurs: number;
  ecartBudgetPct: number | null; coutM2: number | null; coutKwh: number | null;
  depenseMoisPrecedent: number; variationPct: number | null; derniereRecharge: string | null; joursSansRecharge: number | null;
}

export interface RapportMensuel {
  organisation: { id: string; nom: string; type: string };
  mois: string; debut: string; fin: string; genereLe: string;
  total: { depense: number; kwh: number; nbRecharges: number; coutKwh: number | null; depenseMoisPrecedent: number; variationPct: number | null; budget: number | null; tva: number; redevances: number };
  sites: LigneSite[];
  top: LigneSite[];
  alertes: { type: string; message: string; declencheeLe: string; traitee: boolean }[];
  tendance: { mois: string; depense: number; kwh: number }[];
  signaux: string[];
  /** Comparaison entre sites du même type (EF-BI-02) : écart de chaque site à la moyenne de son groupe. */
  comparaison: { type: string; nbSites: number; moyenneDepense: number; moyenneCoutM2: number | null; sites: { siteId: string; nom: string; depense: number; coutM2: number | null; ecartPct: number | null; ecartM2Pct: number | null }[] }[];
}

const bornes = (mois: string) => {
  const [a, m] = mois.split("-").map(Number);
  return { debut: new Date(Date.UTC(a, m - 1, 1)), fin: new Date(Date.UTC(a, m, 1)) };
};
const moisPrecedent = (mois: string) => { const [a, m] = mois.split("-").map(Number); const d = new Date(Date.UTC(a, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const pct = (v: number, ref: number) => (ref > 0 ? Math.round(((v - ref) / ref) * 1000) / 10 : null);

export async function rapportMensuel(db: Db, orgId: string, mois: string): Promise<RapportMensuel> {
  if (!/^\d{4}-\d{2}$/.test(mois)) throw new Error("Format AAAA-MM attendu");
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
  const { debut, fin } = bornes(mois);
  const prec = bornes(moisPrecedent(mois));
  const [ss, cs, rs, rsPrec, al] = await Promise.all([
    db.select().from(sites).where(and(eq(sites.organisationId, orgId), isNull(sites.archiveLe))),
    db.select().from(compteurs).where(and(eq(compteurs.organisationId, orgId), isNull(compteurs.archiveLe))),
    db.select().from(recharges).where(and(eq(recharges.organisationId, orgId), eq(recharges.statut, "valide"), gte(recharges.date, debut), lt(recharges.date, fin))),
    db.select({ compteurId: recharges.compteurId, montant: recharges.montant }).from(recharges).where(and(eq(recharges.organisationId, orgId), eq(recharges.statut, "valide"), gte(recharges.date, prec.debut), lt(recharges.date, prec.fin))),
    db.select().from(alertes).where(and(eq(alertes.organisationId, orgId), gte(alertes.declencheeLe, debut), lt(alertes.declencheeLe, fin))),
  ]);
  const siteDuCompteur = new Map(cs.map((c) => [c.id, c.siteId]));
  const derniere = await db.select({ compteurId: recharges.compteurId, date: recharges.date }).from(recharges).where(and(eq(recharges.organisationId, orgId), eq(recharges.statut, "valide"), lt(recharges.date, fin))).orderBy(desc(recharges.date)).limit(5000);
  const derniereParSite = new Map<string, Date>();
  for (const d of derniere) { const sid = siteDuCompteur.get(d.compteurId); if (sid && !derniereParSite.has(sid)) derniereParSite.set(sid, d.date); }

  const lignes: LigneSite[] = ss.map((s) => {
    const mes = rs.filter((r) => siteDuCompteur.get(r.compteurId) === s.id);
    const depense = mes.reduce((a, r) => a + r.montant, 0);
    const kwh = Math.round(mes.reduce((a, r) => a + num(r.kwh), 0) * 10) / 10;
    const depPrec = rsPrec.filter((r) => siteDuCompteur.get(r.compteurId) === s.id).reduce((a, r) => a + r.montant, 0);
    const der = derniereParSite.get(s.id) ?? null;
    return {
      siteId: s.id, nom: s.nom, type: s.type, surfaceM2: s.surfaceM2, budget: s.budgetMensuel,
      depense, kwh, nbRecharges: mes.length, nbCompteurs: cs.filter((c) => c.siteId === s.id && c.statut === "actif").length,
      ecartBudgetPct: s.budgetMensuel ? Math.round(((depense - s.budgetMensuel) / s.budgetMensuel) * 1000) / 10 : null,
      coutM2: s.surfaceM2 ? Math.round(depense / s.surfaceM2) : null,
      coutKwh: kwh ? Math.round(depense / kwh) : null,
      depenseMoisPrecedent: depPrec, variationPct: pct(depense, depPrec),
      derniereRecharge: der?.toISOString() ?? null,
      joursSansRecharge: der ? Math.floor((Math.min(Date.now(), fin.getTime()) - der.getTime()) / 86400_000) : null,
    };
  }).sort((a, b) => b.depense - a.depense);

  const depense = lignes.reduce((a, l) => a + l.depense, 0);
  const kwh = Math.round(lignes.reduce((a, l) => a + l.kwh, 0) * 10) / 10;
  const depPrec = rsPrec.reduce((a, r) => a + r.montant, 0);
  const budgets = lignes.filter((l) => l.budget).map((l) => l.budget!);

  // Tendance 12 mois
  const tendance: RapportMensuel["tendance"] = [];
  const [a0, m0] = mois.split("-").map(Number);
  const depuis = new Date(Date.UTC(a0, m0 - 12, 1));
  const hist = await db.select({ date: recharges.date, montant: recharges.montant, kwh: recharges.kwh }).from(recharges).where(and(eq(recharges.organisationId, orgId), eq(recharges.statut, "valide"), gte(recharges.date, depuis), lt(recharges.date, fin)));
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(a0, m0 - 1 - i, 1));
    const cle = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const sel = hist.filter((r) => r.date >= d && r.date < f);
    tendance.push({ mois: cle, depense: sel.reduce((x, r) => x + r.montant, 0), kwh: Math.round(sel.reduce((x, r) => x + num(r.kwh), 0)) });
  }

  const signaux: string[] = [];
  for (const l of lignes) {
    if (l.ecartBudgetPct != null && l.ecartBudgetPct > 0) signaux.push(`${l.nom} : budget dépassé de ${l.ecartBudgetPct} % (${l.depense.toLocaleString("fr-FR")} F pour ${l.budget!.toLocaleString("fr-FR")} F)`);
    if (l.variationPct != null && l.variationPct >= 50 && l.depense > 20000) signaux.push(`${l.nom} : +${l.variationPct} % par rapport au mois précédent`);
    if (l.nbCompteurs > 0 && l.nbRecharges === 0) signaux.push(`${l.nom} : aucune recharge ce mois (${l.joursSansRecharge ?? "?"} jours sans recharge)`);
  }

  // Comparaison entre sites comparables (même type, au moins 2 sites)
  const parType = new Map<string, LigneSite[]>();
  for (const l of lignes) parType.set(l.type, [...(parType.get(l.type) ?? []), l]);
  const comparaison: RapportMensuel["comparaison"] = [];
  for (const [type, grp] of parType) {
    if (grp.length < 2) continue;
    const moyenneDepense = grp.reduce((a, l) => a + l.depense, 0) / grp.length;
    const avecM2 = grp.filter((l) => l.coutM2 != null);
    const moyenneCoutM2 = avecM2.length >= 2 ? avecM2.reduce((a, l) => a + l.coutM2!, 0) / avecM2.length : null;
    comparaison.push({
      type, nbSites: grp.length, moyenneDepense: Math.round(moyenneDepense), moyenneCoutM2: moyenneCoutM2 == null ? null : Math.round(moyenneCoutM2),
      sites: grp.map((l) => ({ siteId: l.siteId, nom: l.nom, depense: l.depense, coutM2: l.coutM2, ecartPct: pct(l.depense, moyenneDepense), ecartM2Pct: moyenneCoutM2 && l.coutM2 != null ? pct(l.coutM2, moyenneCoutM2) : null })).sort((a, b) => (b.ecartPct ?? 0) - (a.ecartPct ?? 0)),
    });
    for (const x of grp) {
      const e = moyenneCoutM2 && x.coutM2 != null ? pct(x.coutM2, moyenneCoutM2) : pct(x.depense, moyenneDepense);
      if (e != null && e >= 40 && x.depense >= 20000) signaux.push(`${x.nom} : ${moyenneCoutM2 && x.coutM2 != null ? "coût au m²" : "dépense"} ${e > 0 ? "+" : ""}${e} % par rapport aux autres ${type}s`);
    }
  }

  return {
    organisation: { id: org.id, nom: org.nom, type: org.type },
    mois, debut: debut.toISOString(), fin: fin.toISOString(), genereLe: new Date().toISOString(),
    total: { depense, kwh, nbRecharges: rs.length, coutKwh: kwh ? Math.round(depense / kwh) : null, depenseMoisPrecedent: depPrec, variationPct: pct(depense, depPrec), budget: budgets.length ? budgets.reduce((a, b) => a + b, 0) : null, tva: rs.reduce((a, r) => a + r.tva, 0), redevances: rs.reduce((a, r) => a + r.redevance, 0) },
    sites: lignes,
    top: lignes.slice(0, 10),
    alertes: al.map((x) => ({ type: x.type, message: x.message, declencheeLe: x.declencheeLe.toISOString(), traitee: !!x.traiteeLe })),
    tendance,
    signaux,
    comparaison,
  };
}

// ---------- PDF ----------
const F = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`;
const txt = (s: string) => s.replace(/[—–]/g, "-").replace(/…/g, "...").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[  ]/g, " ").replace(/[^\x00-\xff]/g, "?");
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const libelleMois = (m: string) => { const [a, mm] = m.split("-").map(Number); return `${MOIS[mm - 1]} ${a}`; };

export async function rapportPdf(r: RapportMensuel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rapport ${r.organisation.nom} — ${libelleMois(r.mois)}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const teal = rgb(0.06, 0.46, 0.43), gris = rgb(0.4, 0.45, 0.5), noir = rgb(0.1, 0.12, 0.15), rouge = rgb(0.7, 0.2, 0.2);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const t = (s: string, x: number, size = 10, f = font, color = noir) => page.drawText(txt(s), { x, y, size, font: f, color });
  const droite = (s: string, xFin: number, size = 10, f = font, color = noir) => page.drawText(txt(s), { x: xFin - f.widthOfTextAtSize(txt(s), size), y, size, font: f, color });
  const ligne = () => page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: gris });
  const nouvellePage = () => { page = pdf.addPage([595, 842]); y = 790; };

  t("KURAÑ", 50, 20, bold, teal);
  droite("RAPPORT MENSUEL", 545, 14, bold);
  y -= 16; t(r.organisation.nom, 50, 11, bold); droite(libelleMois(r.mois), 545, 11, bold, teal);
  y -= 22; page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: teal });

  // KPI
  y -= 30;
  const kpi = [["Dépense du mois", F(r.total.depense)], ["Énergie achetée", `${r.total.kwh.toLocaleString("fr-FR")} kWh`], ["Coût moyen du kWh", r.total.coutKwh ? `${r.total.coutKwh} F` : "-"], ["Vs mois précédent", r.total.variationPct == null ? "-" : `${r.total.variationPct > 0 ? "+" : ""}${r.total.variationPct} %`]];
  kpi.forEach(([l, v], i) => { const x = 50 + i * 124; page.drawText(txt(l), { x, y: y + 12, size: 7.5, font, color: gris }); page.drawText(txt(v), { x, y: y - 6, size: 14, font: bold, color: i === 3 && (r.total.variationPct ?? 0) > 20 ? rouge : teal }); });
  y -= 30;
  t(`${r.total.nbRecharges} recharges · redevances ${F(r.total.redevances)} · TVA ${F(r.total.tva)}${r.total.budget ? ` · budget total ${F(r.total.budget)}` : ""}`, 50, 8.5, font, gris);

  // Signaux
  if (r.signaux.length) {
    y -= 26; t("POINTS D'ATTENTION", 50, 8, bold, gris);
    for (const s of r.signaux.slice(0, 8)) { y -= 14; t(`• ${s}`, 56, 9.5, font, rouge); }
  }

  // Tableau sites
  y -= 28; t("SITES", 50, 8, bold, gris); y -= 14;
  const col = { nom: 50, cpt: 250, rech: 290, dep: 370, bud: 440, var: 495, m2: 545 };
  t("Site", col.nom, 8, bold, gris); droite("Cpt", col.cpt + 15, 8, bold, gris); droite("Rech.", col.rech + 20, 8, bold, gris); droite("Dépense", col.dep + 30, 8, bold, gris); droite("Budget", col.bud + 30, 8, bold, gris); droite("Var.", col.var + 15, 8, bold, gris); droite("F/m²", col.m2, 8, bold, gris);
  y -= 5; ligne();
  for (const l of r.sites) {
    if (y < 80) { nouvellePage(); }
    y -= 14;
    t(l.nom.slice(0, 40), col.nom, 9);
    droite(String(l.nbCompteurs), col.cpt + 15, 9);
    droite(String(l.nbRecharges), col.rech + 20, 9);
    droite(F(l.depense), col.dep + 30, 9, bold);
    droite(l.budget ? F(l.budget) : "-", col.bud + 30, 9, font, l.ecartBudgetPct != null && l.ecartBudgetPct > 0 ? rouge : noir);
    droite(l.variationPct == null ? "-" : `${l.variationPct > 0 ? "+" : ""}${l.variationPct} %`, col.var + 15, 9, font, (l.variationPct ?? 0) >= 50 ? rouge : noir);
    droite(l.coutM2 != null ? String(l.coutM2) : "-", col.m2, 9);
  }
  y -= 6; ligne();

  // Tendance
  if (y < 200) nouvellePage();
  y -= 26; t("TENDANCE 12 MOIS", 50, 8, bold, gris); y -= 8;
  const max = Math.max(...r.tendance.map((x) => x.depense), 1);
  const h = 90, w = 495 / 12;
  r.tendance.forEach((m, i) => {
    const hb = (m.depense / max) * h;
    page.drawRectangle({ x: 50 + i * w + 4, y: y - h - 4 + (h - hb), width: w - 8, height: hb, color: i === 11 ? teal : rgb(0.75, 0.87, 0.85) });
    page.drawText(m.mois.slice(5), { x: 50 + i * w + 10, y: y - h - 16, size: 7, font, color: gris });
  });
  y -= h + 30;

  // Pied
  y = 40; t(`Rapport généré par KURAÑ le ${new Date(r.genereLe).toLocaleDateString("fr-FR")} - ${r.organisation.nom} - ${libelleMois(r.mois)}`, 50, 7.5, font, gris);
  return pdf.save();
}

// ---------- Export comptable (OHADA) ----------
/**
 * Une écriture par site et par mois : 6052 Électricité (HT = énergie + redevance + taxe communale), 4452 TVA déductible,
 * contrepartie 5xx (mobile money / caisse). Colonnes lisibles par Cabinet 360 et les logiciels de comptabilité courants.
 */
export function exportComptableCsv(r: RapportMensuel, rechargesDuMois: { siteId: string; date: Date; montant: number; tva: number; compteur: string }[], parRecharge: boolean, compteContrepartie = "5711"): string {
  const sep = ";";
  const dateFin = new Date(r.fin); dateFin.setUTCDate(dateFin.getUTCDate() - 1);
  const dj = (d: Date) => d.toISOString().slice(0, 10);
  const lignes: string[][] = [["date", "journal", "piece", "compte", "libelle", "section_analytique", "debit", "credit"]];
  const push = (date: string, piece: string, compte: string, libelle: string, section: string, debit: number, credit: number) => lignes.push([date, "AC", piece, compte, libelle, section, debit ? String(debit) : "", credit ? String(credit) : ""]);
  if (parRecharge) {
    rechargesDuMois.forEach((x, i) => {
      const site = r.sites.find((s) => s.siteId === x.siteId);
      const piece = `WOY-${r.mois}-${String(i + 1).padStart(4, "0")}`;
      const ht = x.montant - x.tva;
      push(dj(x.date), piece, "6052", `Électricité Woyofal ${x.compteur}`, site?.nom ?? "", ht, 0);
      if (x.tva) push(dj(x.date), piece, "4452", `TVA déductible Woyofal ${x.compteur}`, site?.nom ?? "", x.tva, 0);
      push(dj(x.date), piece, compteContrepartie, `Recharge Woyofal ${x.compteur}`, site?.nom ?? "", 0, x.montant);
    });
  } else {
    for (const s of r.sites.filter((x) => x.depense > 0)) {
      const tva = rechargesDuMois.filter((x) => x.siteId === s.siteId).reduce((a, x) => a + x.tva, 0);
      const piece = `WOY-${r.mois}-${s.nom.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase()}`;
      push(dj(dateFin), piece, "6052", `Électricité Woyofal ${libelleMois(r.mois)} - ${s.nom}`, s.nom, s.depense - tva, 0);
      if (tva) push(dj(dateFin), piece, "4452", `TVA déductible électricité ${libelleMois(r.mois)} - ${s.nom}`, s.nom, tva, 0);
      push(dj(dateFin), piece, compteContrepartie, `Recharges Woyofal ${libelleMois(r.mois)} - ${s.nom}`, s.nom, 0, s.depense);
    }
  }
  return "﻿" + lignes.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(sep)).join("\r\n");
}
