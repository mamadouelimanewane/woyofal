/** Rapports mensuels, export comptable, alertes persistées (Lot 2 — CDC v2 § 3.8 / 3.9). */
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { alertes, compteurs, recharges } from "../db/schema.js";
import { GESTION, TOUS, authentifie, roles, siteAutorise, type Vars } from "../lib/auth.js";
import { alertesOuvertes, detecterAlertes, enregistrerAlertes } from "../lib/alertes.js";
import { exportComptableCsv, libelleMois, rapportMensuel, rapportPdf } from "../lib/rapport.js";
import { invalide, introuvable } from "../lib/util.js";
import { auditer } from "../lib/audit.js";

const r = new Hono<Vars>();
r.use(authentifie);

const Mois = z.string().regex(/^\d{4}-\d{2}$/);

r.get("/rapports/mensuel/:mois", roles(...TOUS), async (c) => {
  const mois = Mois.safeParse(c.req.param("mois"));
  if (!mois.success) invalide("Format AAAA-MM attendu");
  const rap = await rapportMensuel(c.get("db"), c.get("orgId"), mois.data);
  rap.sites = rap.sites.filter((s) => siteAutorise(c, s.siteId));
  rap.top = rap.sites.slice(0, 10);
  return c.json(rap);
});

r.get("/rapports/mensuel/:mois/pdf", roles(...TOUS), async (c) => {
  const mois = Mois.safeParse(c.req.param("mois"));
  if (!mois.success) invalide("Format AAAA-MM attendu");
  const rap = await rapportMensuel(c.get("db"), c.get("orgId"), mois.data);
  const pdf = await rapportPdf(rap);
  return c.body(new Uint8Array(pdf) as Uint8Array<ArrayBuffer>, 200, { "content-type": "application/pdf", "content-disposition": `inline; filename="kuran-rapport-${mois.data}.pdf"` });
});

/** Export comptable OHADA (6052 / 4452 / contrepartie) — CSV ; `detail=1` pour une écriture par recharge. */
r.get("/exports/comptable/:mois", roles(...GESTION, "lecture"), async (c) => {
  const mois = Mois.safeParse(c.req.param("mois"));
  if (!mois.success) invalide("Format AAAA-MM attendu");
  const db = c.get("db");
  const rap = await rapportMensuel(db, c.get("orgId"), mois.data);
  const cs = await db.select({ id: compteurs.id, siteId: compteurs.siteId, libelle: compteurs.libelle, numero: compteurs.numero }).from(compteurs).where(eq(compteurs.organisationId, c.get("orgId")));
  const rs = await db.select().from(recharges).where(and(eq(recharges.organisationId, c.get("orgId")), eq(recharges.statut, "valide"), gte(recharges.date, new Date(rap.debut)), lt(recharges.date, new Date(rap.fin))));
  const lignes = rs.map((x) => { const cpt = cs.find((k) => k.id === x.compteurId)!; return { siteId: cpt.siteId, date: x.date, montant: x.montant, tva: x.tva, compteur: cpt.libelle ?? cpt.numero }; });
  const csv = exportComptableCsv(rap, lignes, c.req.query("detail") === "1", c.req.query("contrepartie") ?? "5711");
  await auditer(db, { organisationId: c.get("orgId"), utilisateurId: c.get("user").id, action: "export_comptable", entite: "rapport", entiteId: mois.data });
  return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="kuran-comptable-${mois.data}.csv"` });
});

/** Liste des mois disponibles (depuis la première recharge). */
r.get("/rapports", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const [premiere] = await db.select({ date: recharges.date }).from(recharges).where(eq(recharges.organisationId, c.get("orgId"))).orderBy(recharges.date).limit(1);
  const out: string[] = [];
  if (premiere) {
    const d = new Date(Date.UTC(premiere.date.getUTCFullYear(), premiere.date.getUTCMonth(), 1));
    const now = new Date();
    while (d <= now) { out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); d.setUTCMonth(d.getUTCMonth() + 1); }
  }
  return c.json(out.reverse().map((m) => ({ mois: m, libelle: libelleMois(m) })));
});

// ---------- Alertes persistées ----------
r.get("/alertes", roles(...TOUS), async (c) => {
  const db = c.get("db");
  const rows = c.req.query("toutes") === "1"
    ? await db.select().from(alertes).where(eq(alertes.organisationId, c.get("orgId"))).orderBy(desc(alertes.declencheeLe)).limit(500)
    : await alertesOuvertes(db, c.get("orgId"));
  return c.json(rows.filter((a) => !a.siteId || siteAutorise(c, a.siteId)));
});

/** Lance la détection maintenant (sinon faite par le cron quotidien). */
r.post("/alertes/detecter", roles(...GESTION), async (c) => {
  const db = c.get("db");
  const detectees = await detecterAlertes(db, c.get("orgId"));
  const nouvelles = await enregistrerAlertes(db, c.get("orgId"), detectees);
  return c.json({ detectees: detectees.length, nouvelles });
});

r.patch("/alertes/:id", roles(...GESTION), async (c) => {
  const b = z.object({ traitee: z.boolean().optional(), commentaire: z.string().optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [a] = await db.update(alertes).set({ ...(b.traitee === true ? { traiteeLe: new Date(), traiteePar: c.get("user").id } : b.traitee === false ? { traiteeLe: null, traiteePar: null } : {}), ...(b.commentaire !== undefined ? { commentaire: b.commentaire } : {}) }).where(and(eq(alertes.id, c.req.param("id")), eq(alertes.organisationId, c.get("orgId")))).returning();
  if (!a) introuvable();
  return c.json(a);
});

export default r;
