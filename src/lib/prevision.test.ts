import { describe, expect, it } from "vitest";
import { prevoir } from "./prevision";

describe("prévision de recharge", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  it("estime la consommation journalière et les jours restants", () => {
    // 4 recharges de 60 kWh sur 55 jours → 4,36 kWh/jour ; dernière il y a 10 jours → solde ≈ 16 kWh → 3 jours
    const r = [0, 15, 30, 45].map((j) => ({ date: new Date(now.getTime() - (55 - j) * 86400_000), kwh: 60 })).reverse();
    const p = prevoir(r, now)!;
    expect(p.kwhParJour).toBeCloseTo(240 / 55, 1);
    expect(p.joursRestants).toBeGreaterThanOrEqual(2);
    expect(p.joursRestants).toBeLessThanOrEqual(5);
    expect(p.dateZero).toMatch(/^2026-(09|10)-/);
    expect(p.kwhPourFinDeMois).toBeGreaterThanOrEqual(0);
  });
  it("solde à zéro quand la dernière recharge est ancienne", () => {
    const r = [{ date: new Date(now.getTime() - 40 * 86400_000), kwh: 20 }, { date: new Date(now.getTime() - 80 * 86400_000), kwh: 20 }];
    const p = prevoir(r, now)!;
    expect(p.soldeEstime).toBe(0);
    expect(p.joursRestants).toBe(0);
  });
  it("null sans recharge", () => { expect(prevoir([], now)).toBeNull(); });
});
