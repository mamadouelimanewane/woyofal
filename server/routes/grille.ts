/** Grille tarifaire en lecture + simulateur public (EF-TARIF-02/04). */
import { Hono } from "hono";
import { z } from "zod";
import type { Vars } from "../lib/auth.js";
import { grilles } from "../lib/tarif-service.js";
import { calculerRecharge, grilleEnVigueur, montantPourKwh } from "../../src/lib/tarif.js";

const r = new Hono<Vars>();

r.get("/grille", async (c) => c.json(await grilles(c.get("db"))));

r.post("/grille/simuler", async (c) => {
  const b = z.object({ montant: z.number().positive().optional(), kwh: z.number().positive().optional(), kwhCumule: z.number().nonnegative().default(0), premiereDuMois: z.boolean().default(true), date: z.string().optional() }).parse(await c.req.json());
  const g = grilleEnVigueur(await grilles(c.get("db")), b.date ?? new Date().toISOString());
  const opts = { kwhCumulePeriode: b.kwhCumule, premiereRechargeDuMois: b.premiereDuMois };
  if (b.montant) return c.json({ grille: g.libelle, ...calculerRecharge(b.montant, g, opts) });
  if (b.kwh) return c.json({ grille: g.libelle, montant: montantPourKwh(b.kwh, g, opts) });
  return c.json({ erreur: "montant ou kwh requis" }, 400);
});

export default r;
