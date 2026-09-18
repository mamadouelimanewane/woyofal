import { describe, expect, it } from "vitest";
import { GRILLE_2026, calculerRecharge, clePeriode, montantPourKwh, resteAvantTranche } from "./tarif";
import { repartir } from "./repartition";
import { parserSms, EXEMPLE_SMS } from "./sms";

const g = GRILLE_2026;

describe("calculerRecharge", () => {
  it("prélève la redevance sur la première recharge du mois", () => {
    const r = calculerRecharge(5000, g, { kwhCumulePeriode: 0, premiereRechargeDuMois: true });
    expect(r.redevance).toBe(1155);
    // 3845 F d'énergie TTC en T1 (82 × 1,025)
    expect(r.kwh).toBeCloseTo(3845 / (82 * 1.025), 1);
    expect(r.tva).toBe(0);
    expect(r.trancheAtteinte).toBe(1);
  });

  it("ne prélève pas la redevance ensuite", () => {
    const r = calculerRecharge(5000, g, { kwhCumulePeriode: 10, premiereRechargeDuMois: false });
    expect(r.redevance).toBe(0);
  });

  it("franchit les tranches et applique la TVA au-delà du seuil", () => {
    const r = calculerRecharge(50000, g, { kwhCumulePeriode: 0, premiereRechargeDuMois: false });
    expect(r.trancheAtteinte).toBe(3);
    expect(r.tva).toBeGreaterThan(0);
    // Cohérence : montant = énergie + taxe + tva (à l'arrondi près)
    expect(r.energie + r.taxeCommunale + r.tva).toBeCloseTo(50000, -1);
  });

  it("montantPourKwh est l'inverse de calculerRecharge", () => {
    const opts = { kwhCumulePeriode: 120, premiereRechargeDuMois: true };
    const montant = montantPourKwh(100, g, opts);
    const r = calculerRecharge(montant, g, opts);
    expect(r.kwh).toBeCloseTo(100, 0);
  });

  it("indique les kWh restants avant la tranche suivante", () => {
    expect(resteAvantTranche(120, g)).toEqual({ tranche: 1, kwhRestants: 30 });
    expect(resteAvantTranche(300, g).kwhRestants).toBeNull();
  });

  it("calcule la clé de période", () => {
    expect(clePeriode("2026-03-15T10:00:00Z", "mois")).toBe("2026-03");
    expect(clePeriode("2026-04-15T10:00:00Z", "bimestre")).toBe("2026-03");
  });
});

describe("repartir", () => {
  const lots = [
    { id: "a", siteId: "s", reference: "A", surfaceM2: 60 },
    { id: "b", siteId: "s", reference: "B", surfaceM2: 40 },
    { id: "c", siteId: "s", reference: "C" },
  ];
  const ratt = [
    { compteurId: "k", lotId: "a" },
    { compteurId: "k", lotId: "b" },
    { compteurId: "k", lotId: "c", forfait: 2000 },
  ];
  const occupants = [{ id: "o1", lotId: "a", nom: "X", telephone: "77", dateEntree: "2026-01-01" }];

  it("parts égales, somme exacte", () => {
    const p = repartir(10000, { regle: "egal", rattachements: ratt, lots, occupants, releves: [], dateRecharge: "2026-09-01" });
    expect(p.map((x) => x.montant)).toEqual([3333, 3333, 3334]);
    expect(p[0].occupantId).toBe("o1");
    expect(p[1].occupantId).toBeNull();
  });

  it("prorata surface", () => {
    const p = repartir(10000, { regle: "surface", rattachements: ratt.slice(0, 2), lots, occupants, releves: [], dateRecharge: "2026-09-01" });
    expect(p.map((x) => x.montant)).toEqual([6000, 4000]);
  });

  it("sous-compteurs", () => {
    const releves = [
      { id: "1", lotId: "a", date: "2026-08-01", index: 100 },
      { id: "2", lotId: "a", date: "2026-08-31", index: 130 },
      { id: "3", lotId: "b", date: "2026-08-01", index: 500 },
      { id: "4", lotId: "b", date: "2026-08-31", index: 510 },
    ];
    const p = repartir(4000, { regle: "sous_compteur", rattachements: ratt.slice(0, 2), lots, occupants, releves, dateRecharge: "2026-09-01" });
    expect(p.map((x) => x.montant)).toEqual([3000, 1000]);
  });

  it("forfait + solde", () => {
    const p = repartir(9000, { regle: "forfait", rattachements: ratt, lots, occupants, releves: [], dateRecharge: "2026-09-01" });
    // forfaits = 2000, solde 7000 / 3
    expect(p.reduce((s, x) => s + x.montant, 0)).toBe(9000);
    expect(p[2].montant).toBeGreaterThan(p[0].montant);
  });
});

describe("parserSms", () => {
  it("extrait opérateur, montant, compteur, kWh, code et référence", () => {
    const p = parserSms(EXEMPLE_SMS);
    expect(p.operateur).toBe("wave");
    expect(p.montant).toBe(10000);
    expect(p.compteur).toBe("14210034567");
    expect(p.kwh).toBe(98.5);
    expect(p.codes).toEqual(["12345678901234567890"]);
    expect(p.reference).toBe("WV8H2K9Q");
  });

  it("supporte les formats Orange Money", () => {
    const p = parserSms("Orange Money: Achat Woyofal reussi. Montant: 2.500 F CFA. Compteur: 14200011122. Token 0987 6543 2109 8765 4321. Ref OM123456");
    expect(p.operateur).toBe("orange");
    expect(p.montant).toBe(2500);
    expect(p.compteur).toBe("14200011122");
    expect(p.codes[0]).toHaveLength(20);
  });
});
