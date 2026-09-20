/**
 * Routes publiques (sans compte) : quittance PDF, page de paiement d'un occupant, suivi d'un
 * paiement, simulateur de fournisseur (démo) et webhooks Wave / Orange Money.
 * Les liens sont signés (HMAC) : voir server/lib/paiement.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { compteurs, lots, occupants, organisations, paiementsEnLigne, quotesParts, recharges, sites } from "../db/schema.js";
import type { Vars } from "../lib/auth.js";
import { genererQuittancePdf, verifierSignature } from "../lib/quittance-pdf.js";
import { confirmerPaiement, creerPaiement, modeSimulation, moyensDisponibles, nouveauNumeroSimulation, signer, traiterWebhookOrange, traiterWebhookWave, verifier, verifierAupresFournisseur, verifierSignatureWave } from "../lib/paiement.js";
import { donneesQuittance } from "./occupants.js";

const r = new Hono<Vars>();

// ---------- Quittance PDF ----------
r.get("/quittances/:numero/pdf", async (c) => {
  const numero = c.req.param("numero");
  if (!verifierSignature(numero, c.req.query("t"))) return c.json({ erreur: "Lien invalide" }, 403);
  const d = await donneesQuittance(c.get("db"), numero);
  if (!d) return c.json({ erreur: "Quittance inconnue" }, 404);
  const pdf = await genererQuittancePdf({
    numero, date: d.paiement.date, montant: d.paiement.montant, moyen: d.paiement.moyen, reference: d.paiement.reference,
    organisation: d.organisation, occupant: { nom: d.occupant.nom, telephone: d.occupant.telephone }, lot: d.lot.reference, site: d.site.nom,
    lignes: d.lignes, soldeRestant: d.soldeRestant,
  });
  return c.body(new Uint8Array(pdf) as Uint8Array<ArrayBuffer>, 200, { "content-type": "application/pdf", "content-disposition": `inline; filename="quittance-${numero}.pdf"`, "cache-control": "private, max-age=3600" });
});

// ---------- Espace occupant : ce que je dois, payer ----------
r.get("/public/occupants/:id", async (c) => {
  const id = c.req.param("id");
  if (!verifier(`occupant:${id}`, c.req.query("t"))) return c.json({ erreur: "Lien invalide" }, 403);
  const db = c.get("db");
  const [o] = await db.select().from(occupants).where(eq(occupants.id, id));
  if (!o) return c.json({ erreur: "Occupant inconnu" }, 404);
  const [org] = await db.select({ nom: organisations.nom, contact: organisations.contact }).from(organisations).where(eq(organisations.id, o.organisationId));
  const [lot] = await db.select().from(lots).where(eq(lots.id, o.lotId));
  const [site] = await db.select({ nom: sites.nom }).from(sites).where(eq(sites.id, lot.siteId));
  const dues = await db.select({ q: quotesParts, date: recharges.date, montantRecharge: recharges.montant, compteur: compteurs.libelle, numero: compteurs.numero })
    .from(quotesParts).innerJoin(recharges, eq(recharges.id, quotesParts.rechargeId)).innerJoin(compteurs, eq(compteurs.id, recharges.compteurId))
    .where(and(eq(quotesParts.occupantId, o.id), eq(quotesParts.statut, "due")));
  const enCours = await db.select().from(paiementsEnLigne).where(and(eq(paiementsEnLigne.occupantId, o.id), eq(paiementsEnLigne.statut, "en_attente")));
  return c.json({
    occupant: { nom: o.nom, lot: lot.reference, site: site.nom },
    organisation: org,
    dues: dues.map((x) => ({ id: x.q.id, montant: x.q.montant, date: x.date, montantRecharge: x.montantRecharge, compteur: x.compteur ?? x.numero })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    total: dues.reduce((a, x) => a + x.q.montant, 0),
    moyens: moyensDisponibles(),
    paiementEnCours: enCours[0]?.id ?? null,
  });
});

r.post("/public/occupants/:id/payer", async (c) => {
  const id = c.req.param("id");
  if (!verifier(`occupant:${id}`, c.req.query("t"))) return c.json({ erreur: "Lien invalide" }, 403);
  const b = z.object({ moyen: z.enum(["wave", "om"]), quotesPartsIds: z.array(z.string()).optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [o] = await db.select().from(occupants).where(eq(occupants.id, id));
  if (!o) return c.json({ erreur: "Occupant inconnu" }, 404);
  const conds = [eq(quotesParts.occupantId, o.id), eq(quotesParts.statut, "due")];
  if (b.quotesPartsIds?.length) conds.push(inArray(quotesParts.id, b.quotesPartsIds));
  const dues = await db.select().from(quotesParts).where(and(...conds));
  if (!dues.length) return c.json({ erreur: "Rien à payer" }, 400);
  const montant = dues.reduce((a, q) => a + q.montant, 0);
  const [org] = await db.select({ nom: organisations.nom }).from(organisations).where(eq(organisations.id, o.organisationId));
  try {
    const p = await creerPaiement(db, { organisationId: o.organisationId, type: "quote_part", montant, moyen: b.moyen, occupantId: o.id, quotesPartsIds: dues.map((q) => q.id), libelle: `Électricité ${org.nom}` });
    return c.json({ id: p.id, url: p.urlPaiement, montant, simulation: modeSimulation(b.moyen) }, 201);
  } catch (e: any) {
    return c.json({ erreur: `Le fournisseur de paiement n'a pas répondu : ${e?.message ?? e}` }, 502);
  }
});

// ---------- Suivi d'un paiement (page de retour) ----------
r.get("/public/paiements/:id", async (c) => {
  const db = c.get("db");
  const [p0] = await db.select().from(paiementsEnLigne).where(eq(paiementsEnLigne.id, c.req.param("id")));
  if (!p0) return c.json({ erreur: "Paiement inconnu" }, 404);
  const p = await verifierAupresFournisseur(db, p0);
  let quittanceUrl: string | null = null;
  if (p.paiementOccupantId) {
    const { paiementsOccupant } = await import("../db/schema.js");
    const [po] = await db.select({ url: paiementsOccupant.quittanceUrl, numero: paiementsOccupant.quittanceNumero }).from(paiementsOccupant).where(eq(paiementsOccupant.id, p.paiementOccupantId));
    quittanceUrl = po?.url ?? null;
  }
  return c.json({ id: p.id, type: p.type, statut: p.statut, montant: p.montant, moyen: p.moyen, reference: p.reference, payeLe: p.payeLe, quittanceUrl, urlPaiement: p.statut === "en_attente" ? p.urlPaiement : null });
});

// ---------- Simulateur de fournisseur (démo / pilotes, uniquement sans clés) ----------
r.get("/public/paiements/:id/simulateur", async (c) => {
  const id = c.req.param("id");
  if (!verifier(`sim:${id}`, c.req.query("t"))) return c.text("Lien invalide", 403);
  const db = c.get("db");
  const [p] = await db.select().from(paiementsEnLigne).where(eq(paiementsEnLigne.id, id));
  if (!p) return c.text("Paiement inconnu", 404);
  if (!modeSimulation(p.moyen as any)) return c.text("Simulateur désactivé", 403);
  const couleur = p.moyen === "wave" ? "#1dc3f0" : "#ff7900";
  const nom = p.moyen === "wave" ? "Wave" : "Orange Money";
  const retour = `/paiement/${id}`;
  const deja = p.statut !== "en_attente";
  return c.html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nom} — simulation</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:${couleur};color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
.c{background:#fff;color:#111;border-radius:16px;padding:28px;width:min(92vw,380px);text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.25)}
h1{margin:0 0 4px;font-size:22px}.s{font-size:12px;color:#666;margin-bottom:18px}.m{font-size:34px;font-weight:800;margin:10px 0 18px}
button,a.b{display:block;width:100%;box-sizing:border-box;border:0;border-radius:10px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;margin-top:8px}
.p{background:${couleur};color:#fff}.a{background:#eee;color:#333}.bandeau{font-size:11px;background:#fff3cd;color:#664d03;border-radius:8px;padding:8px;margin-top:16px}</style></head>
<body><div class="c"><h1>${nom}</h1><div class="s">Paiement KURAÑ · ${p.type === "abonnement" ? "abonnement" : "quote-part d'électricité"}</div>
<div class="m">${p.montant.toLocaleString("fr-FR")} F</div>
${deja ? `<p>Ce paiement est déjà <strong>${p.statut}</strong>.</p><a class="b a" href="${retour}">Retour</a>` : `
<form method="post" action="/api/public/paiements/${id}/simulateur?t=${signer(`sim:${id}`)}"><button class="p" type="submit" name="resultat" value="succes">Confirmer le paiement</button><button class="a" type="submit" name="resultat" value="annule">Annuler</button></form>`}
<div class="bandeau">Mode simulation : aucun argent réel n'est débité. En production, cette page est remplacée par ${nom}.</div></div></body></html>`);
});

r.post("/public/paiements/:id/simulateur", async (c) => {
  const id = c.req.param("id");
  if (!verifier(`sim:${id}`, c.req.query("t"))) return c.text("Lien invalide", 403);
  const db = c.get("db");
  const [p] = await db.select().from(paiementsEnLigne).where(eq(paiementsEnLigne.id, id));
  if (!p || !modeSimulation(p.moyen as any)) return c.text("Refusé", 403);
  const form = await c.req.parseBody();
  if (form.resultat === "succes") await confirmerPaiement(db, id, nouveauNumeroSimulation());
  else await db.update(paiementsEnLigne).set({ statut: "echec", erreur: "annulé par l'utilisateur (simulation)" }).where(eq(paiementsEnLigne.id, id));
  return c.redirect(`/paiement/${id}?statut=${form.resultat === "succes" ? "succes" : "annule"}`);
});

// ---------- Webhooks fournisseurs ----------
r.post("/webhooks/wave", async (c) => {
  const corps = await c.req.text();
  if (!verifierSignatureWave(corps, c.req.header("wave-signature"))) return c.json({ erreur: "Signature invalide" }, 401);
  const res = await traiterWebhookWave(c.get("db"), JSON.parse(corps || "{}"));
  return c.json({ ok: true, res });
});

r.post("/webhooks/orange", async (c) => {
  const corps = await c.req.json().catch(() => ({}));
  const res = await traiterWebhookOrange(c.get("db"), corps);
  return c.json({ ok: true, res });
});

export default r;
