/**
 * Routes publiques (sans compte) : quittance PDF, page de paiement d'un occupant, suivi d'un
 * paiement, simulateur de fournisseur (démo) et webhooks Wave / Orange Money.
 * Les liens sont signés (HMAC) : voir server/lib/paiement.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { alertes, compteurLots, compteurs, lots, occupants, organisations, paiementsEnLigne, paiementsOccupant, quotesParts, recharges, sites, smsEntrants, utilisateurs } from "../db/schema.js";
import { desc } from "drizzle-orm";
import { notifier } from "../lib/notifications.js";
import { auditer } from "../lib/audit.js";
import { uid, urlPublique } from "../lib/util.js";
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
/** Portail occupant (Lot 3, EF-OCC-09) : ce que je dois, mon historique, les recharges de mon lot, mes préférences. */
r.get("/public/occupants/:id", async (c) => {
  const id = c.req.param("id");
  if (!verifier(`occupant:${id}`, c.req.query("t"))) return c.json({ erreur: "Lien invalide" }, 403);
  const db = c.get("db");
  const [o] = await db.select().from(occupants).where(eq(occupants.id, id));
  if (!o) return c.json({ erreur: "Occupant inconnu" }, 404);
  const [org] = await db.select({ nom: organisations.nom, contact: organisations.contact }).from(organisations).where(eq(organisations.id, o.organisationId));
  const [lot] = await db.select().from(lots).where(eq(lots.id, o.lotId));
  const [site] = await db.select({ nom: sites.nom }).from(sites).where(eq(sites.id, lot.siteId));
  const toutes = await db.select({ q: quotesParts, date: recharges.date, montantRecharge: recharges.montant, kwh: recharges.kwh, compteur: compteurs.libelle, numero: compteurs.numero })
    .from(quotesParts).innerJoin(recharges, eq(recharges.id, quotesParts.rechargeId)).innerJoin(compteurs, eq(compteurs.id, recharges.compteurId))
    .where(eq(quotesParts.occupantId, o.id)).orderBy(desc(recharges.date)).limit(200);
  const dues = toutes.filter((x) => x.q.statut === "due");
  const paiements = await db.select().from(paiementsOccupant).where(eq(paiementsOccupant.occupantId, o.id)).orderBy(desc(paiementsOccupant.date)).limit(50);
  const enCours = await db.select().from(paiementsEnLigne).where(and(eq(paiementsEnLigne.occupantId, o.id), eq(paiementsEnLigne.statut, "en_attente")));
  // Compteurs desservant mon lot, avec leurs dernières recharges (transparence sur le compteur partagé)
  const mesCompteurs = await db.select({ c: compteurs }).from(compteurLots).innerJoin(compteurs, eq(compteurs.id, compteurLots.compteurId)).where(eq(compteurLots.lotId, o.lotId));
  const ids = mesCompteurs.map((x) => x.c.id);
  const dernieres = ids.length ? await db.select().from(recharges).where(and(inArray(recharges.compteurId, ids), eq(recharges.statut, "valide"))).orderBy(desc(recharges.date)).limit(30) : [];
  const declarations = await db.select().from(smsEntrants).where(and(eq(smsEntrants.organisationId, o.organisationId), eq(smsEntrants.expediteur, `occupant:${o.id}`))).orderBy(desc(smsEntrants.recuLe)).limit(10);
  const ligne = (x: (typeof toutes)[number]) => ({ id: x.q.id, montant: x.q.montant, statut: x.q.statut, date: x.date, montantRecharge: x.montantRecharge, kwh: Number(x.kwh), compteur: x.compteur ?? x.numero, datePaiement: x.q.datePaiement, moyen: x.q.moyenPaiement, quittanceNumero: x.q.quittanceNumero });
  return c.json({
    occupant: { nom: o.nom, lot: lot.reference, site: site.nom, dateEntree: o.dateEntree, dateSortie: o.dateSortie, caution: o.caution, consentementNotifications: o.consentementNotifications },
    organisation: org,
    dues: dues.map(ligne).sort((a, b) => (a.date < b.date ? -1 : 1)),
    total: dues.reduce((a, x) => a + x.q.montant, 0),
    historique: toutes.filter((x) => x.q.statut !== "due").map(ligne),
    paiements: paiements.map((p) => ({ id: p.id, date: p.date, montant: p.montant, moyen: p.moyen, quittanceNumero: p.quittanceNumero, quittanceUrl: p.quittanceUrl })),
    compteurs: mesCompteurs.map((x) => ({ id: x.c.id, numero: x.c.numero, libelle: x.c.libelle, partage: x.c.partage, regle: x.c.regleRepartition, recharges: dernieres.filter((r) => r.compteurId === x.c.id).slice(0, 10).map((r) => ({ id: r.id, date: r.date, montant: r.montant, kwh: Number(r.kwh), maPart: toutes.find((t) => t.q.rechargeId === r.id)?.q.montant ?? null })) })),
    declarations: declarations.map((d) => ({ id: d.id, date: d.recuLe, statut: d.statut, analyse: d.analyse })),
    moyens: moyensDisponibles(),
    paiementEnCours: enCours[0]?.id ?? null,
  });
});

/** L'occupant déclare une recharge qu'il a faite lui-même sur le compteur partagé : mise en attente de validation par le gestionnaire. */
r.post("/public/occupants/:id/declarer", async (c) => {
  const id = c.req.param("id");
  if (!verifier(`occupant:${id}`, c.req.query("t"))) return c.json({ erreur: "Lien invalide" }, 403);
  const b = z.object({ montant: z.number().int().min(500), compteurId: z.string().optional(), kwh: z.number().positive().optional(), date: z.string().optional(), texteSms: z.string().max(500).optional(), commentaire: z.string().max(300).optional() }).parse(await c.req.json());
  const db = c.get("db");
  const [o] = await db.select().from(occupants).where(eq(occupants.id, id));
  if (!o) return c.json({ erreur: "Occupant inconnu" }, 404);
  const mes = await db.select({ c: compteurs }).from(compteurLots).innerJoin(compteurs, eq(compteurs.id, compteurLots.compteurId)).where(eq(compteurLots.lotId, o.lotId));
  const cpt = mes.find((x) => x.c.id === b.compteurId)?.c ?? (mes.length === 1 ? mes[0].c : null);
  if (!cpt) return c.json({ erreur: "Précisez le compteur" }, 400);
  const brut = `Déclaration de ${o.nom} : recharge de ${b.montant.toLocaleString("fr-FR")} F sur le compteur ${cpt.libelle ?? cpt.numero}${b.kwh ? ` (${b.kwh} kWh)` : ""}${b.date ? ` le ${b.date}` : ""}${b.commentaire ? ` — ${b.commentaire}` : ""}${b.texteSms ? `\nSMS : ${b.texteSms}` : ""}`;
  const smsId = uid();
  await db.insert(smsEntrants).values({ id: smsId, organisationId: o.organisationId, brut, expediteur: `occupant:${o.id}`, analyse: { montant: b.montant, compteur: cpt.numero, kwh: b.kwh, declaration: true, occupantId: o.id, date: b.date }, statut: "en_attente" });
  const gest = await db.select().from(utilisateurs).where(and(eq(utilisateurs.organisationId, o.organisationId), eq(utilisateurs.actif, true), sql`${utilisateurs.role} in ('admin', 'gestionnaire') and ${utilisateurs.email} is not null`));
  for (const u of gest) await notifier(db, { organisationId: o.organisationId, destinataire: u.email!, modele: "declaration_recharge", corps: `Recharge déclarée par un occupant à valider\n${brut}\n\nValider : ${urlPublique()}/recharges`, canal: "email" });
  await auditer(db, { organisationId: o.organisationId, action: "declaration_occupant", entite: "sms_entrant", entiteId: smsId, apres: { occupant: o.id, montant: b.montant, compteur: cpt.numero } });
  return c.json({ ok: true, id: smsId, message: "Déclaration transmise à votre gestionnaire pour validation." }, 201);
});

/** Signalement d'un problème (compteur coupé, contestation, fuite) : alerte visible par le gestionnaire + e-mail. */
r.post("/public/occupants/:id/signaler", async (c) => {
  const id = c.req.param("id");
  if (!verifier(`occupant:${id}`, c.req.query("t"))) return c.json({ erreur: "Lien invalide" }, 403);
  const { message } = z.object({ message: z.string().min(5).max(500) }).parse(await c.req.json());
  const db = c.get("db");
  const [o] = await db.select().from(occupants).where(eq(occupants.id, id));
  if (!o) return c.json({ erreur: "Occupant inconnu" }, 404);
  const [lot] = await db.select().from(lots).where(eq(lots.id, o.lotId));
  const [site] = await db.select().from(sites).where(eq(sites.id, lot.siteId));
  const cle = `incident-${o.id}-${Date.now()}`;
  await db.insert(alertes).values({ id: uid(), organisationId: o.organisationId, siteId: site.id, compteurId: null, type: "incident", message: `${site.nom} — ${lot.reference} · ${o.nom} : ${message}`, cle });
  const gest = await db.select().from(utilisateurs).where(and(eq(utilisateurs.organisationId, o.organisationId), eq(utilisateurs.actif, true), sql`${utilisateurs.role} in ('admin', 'gestionnaire') and ${utilisateurs.email} is not null`));
  for (const u of gest) await notifier(db, { organisationId: o.organisationId, destinataire: u.email!, modele: "incident", corps: `Signalement d'un occupant\n${site.nom} — ${lot.reference} · ${o.nom} (${o.telephone ?? "sans téléphone"}) : ${message}\n\nVoir : ${urlPublique()}/alertes`, canal: "email" });
  return c.json({ ok: true, message: "Signalement transmis à votre gestionnaire." }, 201);
});

r.post("/public/occupants/:id/notifications", async (c) => {
  const id = c.req.param("id");
  if (!verifier(`occupant:${id}`, c.req.query("t"))) return c.json({ erreur: "Lien invalide" }, 403);
  const { consentement } = z.object({ consentement: z.boolean() }).parse(await c.req.json());
  const db = c.get("db");
  const [o] = await db.update(occupants).set({ consentementNotifications: consentement, modifieLe: new Date() }).where(eq(occupants.id, id)).returning();
  if (!o) return c.json({ erreur: "Occupant inconnu" }, 404);
  await auditer(db, { organisationId: o.organisationId, action: consentement ? "notifications_activees" : "notifications_desactivees", entite: "occupant", entiteId: o.id });
  return c.json({ ok: true, consentement });
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
