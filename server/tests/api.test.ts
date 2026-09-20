/**
 * Tests d'intégration de l'API sur PGlite en mémoire (critères CA-02 → CA-08 du CDC v2).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../app.js";

type Json = Record<string, any>;

async function api(path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; json: Json }> {
  const res = await app.request(`http://localhost/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const texte = await res.text();
  return { status: res.status, json: texte ? JSON.parse(texte) : {} };
}

async function inscrire(tel: string, nomOrg: string, type: "immo" | "entreprise" = "immo") {
  const otp = await api("/auth/otp/request", { body: { telephone: tel } });
  expect(otp.status).toBe(200);
  expect(otp.json.devCode).toMatch(/^\d{6}$/);
  const ins = await api("/auth/inscription", { body: { telephone: tel, code: otp.json.devCode, nom: "Admin " + nomOrg, organisation: { nom: nomOrg, type } } });
  expect(ins.status).toBe(201);
  return { token: ins.json.accessToken as string, refresh: ins.json.refreshToken as string, orgId: ins.json.organisationId as string };
}

let A: { token: string; refresh: string; orgId: string };
let B: { token: string; refresh: string; orgId: string };
let siteId: string;
const lotIds: string[] = [];
let compteurId: string;
let occupant1: string;
let rechargeId: string;
let cleApi: string;

beforeAll(async () => {
  A = await inscrire("77 123 45 67", "SCI Almadies");
  B = await inscrire("78 000 00 00", "Pharmacies Sud", "entreprise");
});

describe("santé et auth", () => {
  it("répond sur /sante", async () => {
    const r = await api("/sante");
    expect(r.json).toMatchObject({ ok: true, base: "pglite" });
  });

  it("refuse sans jeton", async () => {
    expect((await api("/sites")).status).toBe(401);
  });

  it("OTP : code faux refusé, 3 essais max", async () => {
    const otp = await api("/auth/otp/request", { body: { telephone: "771234567" } });
    for (let i = 0; i < 3; i++) expect((await api("/auth/otp/verify", { body: { telephone: "771234567", code: "000000" } })).status).toBe(401);
    // même le bon code est refusé après 3 tentatives
    expect((await api("/auth/otp/verify", { body: { telephone: "771234567", code: otp.json.devCode } })).status).toBe(401);
  });

  it("OTP : connexion d'un compte existant + refresh avec rotation", async () => {
    const otp = await api("/auth/otp/request", { body: { telephone: "771234567" } });
    const v = await api("/auth/otp/verify", { body: { telephone: "771234567", code: otp.json.devCode } });
    expect(v.status).toBe(200);
    expect(v.json.utilisateur.role).toBe("admin");
    const r1 = await api("/auth/refresh", { body: { refreshToken: v.json.refreshToken } });
    expect(r1.status).toBe(200);
    const r2 = await api("/auth/refresh", { body: { refreshToken: v.json.refreshToken } });
    expect(r2.status).toBe(401); // l'ancien refresh est révoqué
  });

  it("mot de passe + login e-mail", async () => {
    await api("/auth/mot-de-passe", { token: A.token, body: { motDePasse: "motdepasse-solide" } });
    // l'admin n'a pas d'e-mail : on en ajoute un via inscription d'un autre compte
    const otp = await api("/auth/otp/request", { body: { telephone: "760000000" } });
    const ins = await api("/auth/inscription", { body: { telephone: "760000000", code: otp.json.devCode, nom: "Gérant Mail", email: "gerant@exemple.sn", motDePasse: "motdepasse-solide", organisation: { nom: "SCI Mail", type: "immo" } } });
    expect(ins.status).toBe(201);
    expect((await api("/auth/login", { body: { email: "gerant@exemple.sn", motDePasse: "mauvais-mot-de-passe" } })).status).toBe(401);
    expect((await api("/auth/login", { body: { email: "gerant@exemple.sn", motDePasse: "motdepasse-solide" } })).status).toBe(200);
  });
});

describe("parc (CA-01)", () => {
  it("crée site, lots, compteur partagé, occupants", async () => {
    const s = await api("/sites", { token: A.token, body: { nom: "Résidence Almadies", type: "immeuble", adresse: "Almadies, Dakar" } });
    expect(s.status).toBe(201);
    siteId = s.json.id;
    for (const [ref, surface] of [["A1", 60], ["A2", 90], ["A3", 50]] as const) {
      const l = await api("/lots", { token: A.token, body: { siteId, reference: ref, surfaceM2: surface } });
      expect(l.status).toBe(201);
      lotIds.push(l.json.id);
    }
    expect((await api("/compteurs", { token: A.token, body: { siteId, numero: "1421003456", lotIds } })).status).toBe(400); // 10 chiffres
    const c = await api("/compteurs", { token: A.token, body: { siteId, numero: "14210034567", libelle: "Compteur commun", lotIds } });
    expect(c.status).toBe(201);
    expect(c.json.partage).toBe(true);
    compteurId = c.json.id;
    expect((await api("/compteurs", { token: A.token, body: { siteId, numero: "14210034567", lotIds: [] } })).status).toBe(400); // doublon numéro

    const o1 = await api("/occupants", { token: A.token, body: { lotId: lotIds[0], nom: "Awa Ndiaye", telephone: "77 111 22 33", dateEntree: "2026-01-01", caution: 20000 } });
    const o2 = await api("/occupants", { token: A.token, body: { lotId: lotIds[1], nom: "Moussa Fall", telephone: "78 444 55 66", dateEntree: "2026-03-01" } });
    expect(o1.status).toBe(201);
    expect(o2.status).toBe(201);
    occupant1 = o1.json.id;
    // A3 reste vacant → sa part ira au propriétaire
  });

  it("import JSON avec rapport d'erreurs ligne par ligne", async () => {
    const sim = await api("/parc/import", { token: A.token, body: { simuler: true, sites: [{ nom: "Cité Keur Gorgui" }], lots: [{ site: "Cité Keur Gorgui", reference: "B1" }, { site: "Inconnu", reference: "X" }], compteurs: [{ site: "Cité Keur Gorgui", numero: "14200000001", lots: ["B1"] }, { site: "Cité Keur Gorgui", numero: "123", lots: [] }] } });
    expect(sim.status).toBe(422);
    expect(sim.json.erreurs).toHaveLength(2);
    const ok = await api("/parc/import", { token: A.token, body: { sites: [{ nom: "Cité Keur Gorgui" }], lots: [{ site: "Cité Keur Gorgui", reference: "B1" }], compteurs: [{ site: "Cité Keur Gorgui", numero: "14200000001", lots: ["B1"] }], occupants: [{ site: "Cité Keur Gorgui", lot: "B1", nom: "Fatou Sow", telephone: "770000001" }] } });
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({ importe: true, sites: 1, lots: 1, compteurs: 1, occupants: 1 });
  });

  it("cloisonne les organisations (CA-08)", async () => {
    expect((await api(`/compteurs/${compteurId}/repartition`, { token: B.token, method: "PUT", body: { regle: "surface" } })).status).toBe(404);
    expect((await api("/recharges", { token: B.token, body: { compteurId, date: "2026-09-03", montant: 5000 } })).status).toBe(404);
    const sitesB = await api("/sites", { token: B.token });
    expect(sitesB.json).toHaveLength(0);
  });
});

describe("recharges et répartition (CA-02, CA-03, CA-07)", () => {
  it("parse un SMS Wave et retrouve le compteur", async () => {
    const p = await api("/recharges/parse", { token: A.token, body: { texte: "Wave: Vous avez acheté du crédit Woyofal de 10 000 FCFA pour le compteur 14210034567. Code: 1234 5678 9012 3456 7890. 98.5 kWh. Ref: WV8H2K9Q" } });
    expect(p.json).toMatchObject({ operateur: "wave", montant: 10000, compteur: "14210034567", kwh: 98.5, compteurId });
    expect(p.json.codes[0]).toBe("12345678901234567890");
  });

  it("recharge 30 000 F le 3 du mois : redevance déduite, 3 quotes-parts = 30 000 F, lot vacant au propriétaire", async () => {
    const r = await api("/recharges", { token: A.token, body: { compteurId, date: "2026-09-03T10:00:00+00:00", montant: 30000, canal: "manuel", codeRecharge: "11112222333344445555" } });
    expect(r.status).toBe(201);
    rechargeId = r.json.recharge.id;
    expect(r.json.recharge.redevance).toBe(1155);
    expect(r.json.recharge.kwh).toBeGreaterThan(200);
    expect(r.json.recharge.periode).toBe("2026-09");
    const parts = r.json.quotesParts;
    expect(parts).toHaveLength(3);
    expect(parts.reduce((a: number, p: Json) => a + p.montant, 0)).toBe(30000);
    expect(parts.filter((p: Json) => p.occupantId === null)).toHaveLength(1);
  });

  it("refuse le doublon par code et par proximité (EF-RECH-06)", async () => {
    expect((await api("/recharges", { token: A.token, body: { compteurId, date: "2026-09-04", montant: 5000, codeRecharge: "11112222333344445555" } })).status).toBe(409);
    expect((await api("/recharges", { token: A.token, body: { compteurId, date: "2026-09-03T10:01:00+00:00", montant: 30000 } })).status).toBe(409);
  });

  it("deuxième recharge du mois : pas de redevance, tranche supérieure", async () => {
    const r = await api("/recharges", { token: A.token, body: { compteurId, date: "2026-09-15T09:00:00+00:00", montant: 10000 } });
    expect(r.status).toBe(201);
    expect(r.json.recharge.redevance).toBe(0);
    expect(r.json.recharge.trancheAtteinte).toBeGreaterThanOrEqual(2);
    const mois = await api(`/compteurs/${compteurId}/mois/2026-09`, { token: A.token });
    expect(mois.json.nb).toBe(2);
    expect(mois.json.montant).toBe(40000);
  });

  it("règle prorata surface : 60/90/50", async () => {
    await api(`/compteurs/${compteurId}/repartition`, { token: A.token, method: "PUT", body: { regle: "surface" } });
    const sim = await api("/recharges/simuler", { token: A.token, body: { compteurId, montant: 20000, date: "2026-10-01T08:00:00Z" } });
    expect(sim.status).toBe(200);
    expect(sim.json.detail.redevance).toBe(1155); // nouveau mois
    const montants = sim.json.quotesParts.map((p: Json) => p.montant).sort((a: number, b: number) => a - b);
    expect(montants).toEqual([5000, 6000, 9000]);
  });

  it("changement de grille : le passé est inchangé, le futur suit la nouvelle grille (CA-07)", async () => {
    // seul le super-admin peut ajouter une grille
    expect((await api("/admin/grille", { token: A.token, body: {} })).status).toBe(403);
    const avant = await api(`/compteurs/${compteurId}/mois/2026-09`, { token: A.token });
    const { dbTest: _d, db } = await import("../db");
    const { utilisateurs } = await import("../db/schema");
    const d = await db();
    const { randomUUID } = await import("node:crypto");
    await d.insert(utilisateurs).values({ id: randomUUID(), organisationId: null, role: "superadmin", nom: "Root", telephone: "221700000000" });
    const otp = await api("/auth/otp/request", { body: { telephone: "700000000" } });
    const v = await api("/auth/otp/verify", { body: { telephone: "700000000", code: otp.json.devCode } });
    const root = v.json.accessToken;
    const g = await api("/admin/grille", { token: root, body: { dateEffet: "2026-11-01", libelle: "Test +10 %", tranche1: 90.2, tranche2: 150.14, tranche3: 175.3, seuilT1: 150, seuilT2: 250, redevance: 1300, seuilTva: 250, tauxTva: 0.18, tauxTaxeCommunale: 0.025 } });
    expect(g.status).toBe(201);
    const apres = await api(`/compteurs/${compteurId}/mois/2026-09`, { token: A.token });
    expect(apres.json.kwh).toBe(avant.json.kwh);
    const sim = await api("/recharges/simuler", { token: A.token, body: { compteurId, montant: 10000, date: "2026-11-05T08:00:00Z" } });
    expect(sim.json.detail.redevance).toBe(1300);
    expect(sim.json.grille).toBe("Test +10 %");
  });
});

describe("recouvrement (CA-04, CA-05, CA-06)", () => {
  it("paiement de quotes-parts : quittance numérotée, solde", async () => {
    const compte = await api(`/occupants/${occupant1}/compte`, { token: A.token });
    expect(compte.json.solde).toBeGreaterThan(0);
    // on règle la quote-part de la première recharge (celle qui sera annulée ensuite)
    const dues = compte.json.quotesParts.filter((q: Json) => q.statut === "due" && q.rechargeId === rechargeId).map((q: Json) => q.id);
    const p = await api(`/occupants/${occupant1}/paiements`, { token: A.token, body: { quotesPartsIds: [dues[0]], moyen: "wave", reference: "WV123" } });
    expect(p.status).toBe(201);
    expect(p.json.quittanceNumero).toMatch(/^Q-\d{4}-000001$/);
    const q = await api(`/quittances/${p.json.quittanceNumero}`, { token: A.token });
    expect(q.status).toBe(200);
    expect(q.json.lignes).toHaveLength(1);
    expect(q.json.occupant.nom).toBe("Awa Ndiaye");
    // PDF public signé (CA-04)
    expect(q.json.url).toContain(`/api/quittances/${p.json.quittanceNumero}/pdf?t=`);
    const pdf = await app.request(q.json.url.replace(/^https?:\/\/[^/]+/, "http://localhost"));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const octets = new Uint8Array(await pdf.arrayBuffer());
    expect(String.fromCharCode(...octets.slice(0, 5))).toBe("%PDF-");
    expect((await app.request(`http://localhost/api/quittances/${p.json.quittanceNumero}/pdf?t=faux`)).status).toBe(403);
    expect((await api(`/occupants/${occupant1}/paiements`, { token: A.token, body: { quotesPartsIds: [dues[0]], moyen: "especes" } })).status).toBe(400); // déjà payée
  });

  it("vue recouvrement et relance manuelle (mise en file, aucun canal configuré)", async () => {
    const r = await api("/recouvrement", { token: A.token });
    expect(r.json.total).toBeGreaterThan(0);
    expect(r.json.lignes.some((l: Json) => l.occupant === "Propriétaire (lot vacant)")).toBe(true);
    const rel = await api("/relances/envoyer", { token: A.token, body: { occupantIds: [occupant1] } });
    expect(rel.json.relances).toBe(1);
    const notifs = await api("/notifications", { token: A.token });
    expect(notifs.json.some((n: Json) => n.modele === "relance_manuel" && n.statut === "en_attente")).toBe(true);
  });

  it("annulation d'une recharge : les quotes-parts dues sont annulées, la payée conservée (RG-07)", async () => {
    const a = await api(`/recharges/${rechargeId}/annuler`, { token: A.token, body: { motif: "Erreur de compteur" } });
    expect(a.status).toBe(200);
    expect(a.json.quotesPartsPayeesConservees).toBe(1);
    expect(a.json.quotesPartsAnnulees).toBe(2);
    expect((await api(`/recharges/${rechargeId}/annuler`, { token: A.token, body: { motif: "encore" } })).status).toBe(404);
  });

  it("sortie d'un occupant : solde et caution", async () => {
    const s = await api(`/occupants/${occupant1}/sortie`, { token: A.token, body: { dateSortie: "2026-09-30" } });
    expect(s.status).toBe(200);
    expect(s.json.caution).toBe(20000);
    expect(typeof s.json.soldeApresCaution).toBe("number");
    expect((await api(`/occupants/${occupant1}/sortie`, { token: A.token, body: { dateSortie: "2026-10-01" } })).status).toBe(400);
  });
});

describe("ingestion SMS par clé d'organisation (EF-RECH-03/05)", () => {
  it("rattache un SMS au compteur, met en attente un compteur inconnu, détecte le doublon", async () => {
    const me = await api("/auth/me", { token: A.token });
    cleApi = me.json.organisation.cleApi;
    expect(cleApi).toBeTruthy();
    expect((await api("/recharges/sms", { headers: { "x-api-key": "mauvaise" }, body: { texte: "Wave: crédit Woyofal 5 000 FCFA compteur 14210034567" } })).status).toBe(401);
    const sms = "Orange Money: Achat Woyofal reussi. Compteur: 14210034567 Montant: 7000 FCFA Code: 9999 8888 7777 6666 5555 kWh: 52.1";
    const r1 = await api("/recharges/sms", { headers: { "x-api-key": cleApi }, body: { texte: sms, recuLe: "2026-09-20T08:00:00Z" } });
    expect(r1.status).toBe(201);
    expect(r1.json.statut).toBe("rattache");
    expect(r1.json.recharge.canal).toBe("sms");
    expect(r1.json.recharge.kwh).toBe(52.1); // RG-05 : le ticket prime (écart > 3 %)
    const r2 = await api("/recharges/sms", { headers: { "x-api-key": cleApi }, body: { texte: sms, recuLe: "2026-09-20T08:00:30Z" } });
    expect(r2.json.statut).toBe("doublon");
    const r3 = await api("/recharges/sms", { headers: { "x-api-key": cleApi }, body: { texte: "Wave: Vous avez acheté du crédit Woyofal de 3 000 FCFA pour le compteur 14299999999. Code: 1111 2222 3333 4444 5555." } });
    expect(r3.status).toBe(202);
    const attente = await api("/sms-entrants", { token: A.token });
    expect(attente.json).toHaveLength(1);
    const c = await api("/compteurs", { token: A.token, body: { siteId, numero: "14299999999", lotIds: [] } });
    const ratt = await api(`/sms-entrants/${attente.json[0].id}/rattacher`, { token: A.token, body: { compteurId: c.json.id } });
    expect(ratt.status).toBe(201);
    expect(ratt.json.recharge.montant).toBe(3000);
  });
});

describe("snapshot et grille publique", () => {
  it("renvoie l'instantané de l'organisation", async () => {
    const s = await api("/snapshot", { token: A.token });
    expect(s.status).toBe(200);
    expect(s.json.organisation.nom).toBe("SCI Almadies");
    expect(s.json.sites.length).toBe(2);
    expect(s.json.compteurs.length).toBe(3);
    expect(s.json.recharges.every((r: Json) => r.id !== rechargeId)).toBe(true); // annulée exclue
    expect(s.json.grilles.length).toBe(2);
  });

  it("simulateur public", async () => {
    const r = await api("/grille/simuler", { body: { montant: 5000, premiereDuMois: true, date: "2026-09-01" } });
    expect(r.json.redevance).toBe(1155);
    expect(r.json.kwh).toBeGreaterThan(40);
  });
});

describe("paiement en ligne Wave / Orange Money (mode simulation)", () => {
  let lien: string;
  let paiementId: string;

  it("expose la page publique de l'occupant avec ses quotes-parts dues", async () => {
    // Une nouvelle recharge partagée génère des dues pour Moussa Fall (lot A2)
    const r = await api("/recharges", { token: A.token, body: { compteurId, date: "2026-10-05T09:00:00+00:00", montant: 12000 } });
    expect(r.status).toBe(201);
    const occ = await api("/occupants", { token: A.token });
    const moussa = occ.json.find((o: Json) => o.nom === "Moussa Fall");
    const notifs = await api("/notifications", { token: A.token });
    const n = notifs.json.find((x: Json) => x.occupantId === moussa.id && x.modele === "quote_part");
    expect(n.corps).toMatch(/Payer : http:\/\/localhost[^ ]*\/payer\//);
    lien = n.corps.match(/\/payer\/([^\s?]+)\?t=([A-Za-z0-9_-]+)/)!.slice(1).join("?t=");
    expect((await api(`/public/occupants/${moussa.id}?t=faux`)).status).toBe(403);
    const page = await api(`/public/occupants/${lien}`);
    expect(page.status).toBe(200);
    expect(page.json.occupant.nom).toBe("Moussa Fall");
    expect(page.json.total).toBeGreaterThan(0);
    expect(page.json.moyens.every((m: Json) => m.simulation)).toBe(true);
  });

  it("lance un paiement Wave, le simulateur confirme, la quittance est émise", async () => {
    const page = await api(`/public/occupants/${lien}`);
    const [occId, t] = lien.split("?t=");
    const l2 = await api(`/public/occupants/${occId}/payer?t=${t}`, { body: { moyen: "wave" } });
    expect(l2.status).toBe(201);
    expect(l2.json.simulation).toBe(true);
    expect(l2.json.montant).toBe(page.json.total);
    paiementId = l2.json.id;
    const sim = await app.request(l2.json.url.replace(/^https?:\/\/[^/]+/, "http://localhost"));
    expect(sim.status).toBe(200);
    expect(await sim.text()).toContain("Wave");
    const post = await app.request(l2.json.url.replace(/^https?:\/\/[^/]+/, "http://localhost"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "resultat=succes" });
    expect(post.status).toBe(302);
    const suivi = await api(`/public/paiements/${paiementId}`);
    expect(suivi.json.statut).toBe("paye");
    expect(suivi.json.reference).toMatch(/^SIM-/);
    expect(suivi.json.quittanceUrl).toContain("/api/quittances/");
    const apres = await api(`/public/occupants/${lien}`);
    expect(apres.json.total).toBe(0);
    // idempotence : reconfirmer ne crée pas de seconde quittance
    const post2 = await app.request(l2.json.url.replace(/^https?:\/\/[^/]+/, "http://localhost"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "resultat=succes" });
    expect(post2.status).toBe(302);
    expect((await api(`/public/paiements/${paiementId}`)).json.statut).toBe("paye");
  });

  it("refuse de payer quand rien n'est dû", async () => {
    const [occId, t] = lien.split("?t=");
    expect((await api(`/public/occupants/${occId}/payer?t=${t}`, { body: { moyen: "om" } })).status).toBe(400);
  });

  it("abonnement : montant calculé selon l'usage, paiement Orange Money annuel, organisation active", async () => {
    const a = await api("/abonnement", { token: A.token });
    expect(a.status).toBe(200);
    expect(a.json.plan).toBe("gratuit");
    expect(a.json.usage.nbCompteurs).toBeGreaterThan(0);
    const p = await api("/abonnement/payer", { token: A.token, body: { moyen: "om", periodicite: "annuel", plan: "starter" } });
    expect(p.status).toBe(201);
    expect(p.json.montant).toBe(Math.round(10000 * 12 * 0.85));
    const post = await app.request(p.json.url.replace(/^https?:\/\/[^/]+/, "http://localhost"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "resultat=succes" });
    expect(post.status).toBe(302);
    const me = await api("/auth/me", { token: A.token });
    expect(me.json.organisation.statut).toBe("actif");
    expect(me.json.organisation.plan).toBe("starter");
    const a2 = await api("/abonnement", { token: A.token });
    expect(a2.json.factures).toHaveLength(1);
    expect(a2.json.factures[0].numero).toMatch(/^F-\d{4}-000001$/);
    expect(new Date(a2.json.echeance).getTime()).toBeGreaterThan(Date.now() + 360 * 86400_000);
    // organisation sans usage : le plan gratuit ne se paie pas, le plan Entreprise impose le minimum de 10 sites
    expect((await api("/abonnement/payer", { token: B.token, body: { moyen: "wave" } })).status).toBe(400);
    const pb = await api("/abonnement/payer", { token: B.token, body: { moyen: "wave", plan: "entreprise" } });
    expect(pb.status).toBe(201);
    expect(pb.json.montant).toBe(30000);
  });

  it("webhook Wave : confirme un paiement par client_reference (sans secret en test)", async () => {
    const [occId, t] = lien.split("?t=");
    await api("/recharges", { token: A.token, body: { compteurId, date: "2026-10-12T09:00:00+00:00", montant: 6000 } });
    const l = await api(`/public/occupants/${occId}/payer?t=${t}`, { body: { moyen: "wave" } });
    expect(l.status).toBe(201);
    const wh = await api("/webhooks/wave", { body: { type: "checkout.session.completed", data: { id: "cos-test", client_reference: l.json.id, payment_status: "succeeded", transaction_id: "T-WAVE-1" } } });
    expect(wh.json.res).toBe("paye");
    const suivi = await api(`/public/paiements/${l.json.id}`);
    expect(suivi.json).toMatchObject({ statut: "paye", reference: "T-WAVE-1" });
    // Orange : notif_token inconnu → ignoré
    const wo = await api("/webhooks/orange", { body: { status: "SUCCESS", notif_token: "inconnu", txnid: "X" } });
    expect(wo.json.res).toBe("inconnu");
  });
});

describe("Lot 2 : rapports, export comptable, alertes serveur, cron", () => {
  it("rapport mensuel : totaux, sites, signaux, PDF", async () => {
    // budget bas pour déclencher un dépassement
    await api(`/sites/${siteId}`, { token: A.token, method: "PATCH", body: { budgetMensuel: 10000 } });
    const r = await api("/rapports/mensuel/2026-09", { token: A.token });
    expect(r.status).toBe(200);
    expect(r.json.total.nbRecharges).toBeGreaterThan(0);
    expect(r.json.sites.length).toBe(2);
    const site = r.json.sites.find((s: Json) => s.siteId === siteId);
    expect(site.ecartBudgetPct).toBeGreaterThan(0);
    expect(r.json.signaux.some((s: string) => s.includes("budget dépassé"))).toBe(true);
    expect(r.json.tendance).toHaveLength(12);
    expect((await api("/rapports/mensuel/2026-9", { token: A.token })).status).toBe(400);
    const pdf = await app.request("http://localhost/api/rapports/mensuel/2026-09/pdf", { headers: { authorization: `Bearer ${A.token}` } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const liste = await api("/rapports", { token: A.token });
    expect(liste.json.some((m: Json) => m.mois === "2026-09")).toBe(true);
  });

  it("export comptable OHADA : écritures équilibrées, par site et par recharge", async () => {
    for (const detail of ["0", "1"]) {
      const res = await app.request(`http://localhost/api/exports/comptable/2026-09?detail=${detail}`, { headers: { authorization: `Bearer ${A.token}` } });
      expect(res.status).toBe(200);
      const csv = await res.text();
      const lignes = csv.replace(/^﻿/, "").split("\r\n").slice(1).map((l) => l.split(";").map((v) => v.replace(/^"|"$/g, "")));
      expect(lignes.length).toBeGreaterThan(2);
      const debit = lignes.reduce((a, l) => a + Number(l[6] || 0), 0);
      const credit = lignes.reduce((a, l) => a + Number(l[7] || 0), 0);
      expect(debit).toBe(credit);
      expect(lignes.some((l) => l[3] === "6052")).toBe(true);
      expect(lignes.some((l) => l[3] === "5711")).toBe(true);
    }
  });

  it("détection d'alertes serveur : budget dépassé, idempotence, traitement, e-mail aux gestionnaires", async () => {
    await api("/utilisateurs", { token: A.token, body: { nom: "Gestionnaire Mail", telephone: "770008888", email: "gestion@exemple.sn", role: "gestionnaire" } });
    const d = await api("/alertes/detecter", { token: A.token, body: {} });
    expect(d.status).toBe(200);
    expect(d.json.detectees).toBeGreaterThan(0);
    expect(d.json.nouvelles).toBeGreaterThan(0);
    const d2 = await api("/alertes/detecter", { token: A.token, body: {} });
    expect(d2.json.nouvelles).toBe(0); // idempotent
    const liste = await api("/alertes", { token: A.token });
    const budget = liste.json.find((a: Json) => a.type === "budget_100" && a.siteId === siteId);
    expect(budget).toBeTruthy();
    const maj = await api(`/alertes/${budget.id}`, { token: A.token, method: "PATCH", body: { traitee: true, commentaire: "Budget révisé" } });
    expect(maj.json.traiteeLe).toBeTruthy();
    expect((await api("/alertes", { token: A.token })).json.some((a: Json) => a.id === budget.id)).toBe(false);
    // l'organisation B ne voit rien
    expect((await api("/alertes", { token: B.token })).json).toHaveLength(0);
    const notifs = await api("/notifications", { token: A.token });
    const mail = notifs.json.find((n: Json) => n.modele === "alertes" && n.canal === "email");
    expect(mail.destinataire).toBe("gestion@exemple.sn");
    expect(mail.corps).toContain("budget");
  });

  it("cron quotidien : relances, alertes, rapport mensuel en file e-mail", async () => {
    // un administrateur avec e-mail pour recevoir le rapport
    await api("/utilisateurs", { token: A.token, body: { nom: "DAF", telephone: "770009999", email: "daf@exemple.sn", role: "lecture" } });
    const cron = await api("/admin/cron/quotidien?rapports=1", { body: {} });
    expect(cron.status).toBe(200);
    expect(cron.json.rapports).toBeGreaterThanOrEqual(0);
    const notifs = await api("/notifications", { token: A.token });
    const mail = notifs.json.find((n: Json) => n.modele === "rapport_mensuel" && n.canal === "email");
    if (mail) expect(mail.corps).toContain("rapport");
    expect(typeof cron.json.alertesNouvelles).toBe("number");
  });
});
