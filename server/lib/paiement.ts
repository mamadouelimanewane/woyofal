/**
 * Paiement en ligne — Wave Checkout et Orange Money Web Payment (Sénégal).
 *
 * Trois modes selon les variables d'environnement :
 *   - Wave        : WAVE_API_KEY (+ WAVE_WEBHOOK_SECRET pour vérifier les webhooks)
 *   - Orange Money: OM_CLIENT_ID, OM_CLIENT_SECRET, OM_MERCHANT_KEY, OM_ENV=dev|prod
 *   - Simulation  : sans clés, la page /api/public/paiements/:id/simulateur remplace le fournisseur
 *                   (démo et pilotes). PAIEMENT_SIMULATION=1 force ce mode même avec des clés.
 *
 * Références : https://docs.wave.com/business (checkout sessions, Wave-Signature)
 *              https://developer.orange.com/apis/om-webpay (webpayment, transactionstatus, notif_url)
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { facturesAbonnement, occupants, organisations, paiementsEnLigne, quotesParts } from "../db/schema.js";
import { enregistrerPaiementOccupant } from "./recouvrement.js";
import { auditer } from "./audit.js";
import { prochainNumero, uid, urlPublique } from "./util.js";

export type Moyen = "wave" | "om";
export type PaiementEnLigne = typeof paiementsEnLigne.$inferSelect;

export function modeSimulation(moyen: Moyen): boolean {
  if (process.env.PAIEMENT_SIMULATION === "1") return true;
  if (moyen === "wave") return !process.env.WAVE_API_KEY;
  return !(process.env.OM_CLIENT_ID && process.env.OM_CLIENT_SECRET && process.env.OM_MERCHANT_KEY);
}

export function moyensDisponibles(): { moyen: Moyen; libelle: string; simulation: boolean }[] {
  return [
    { moyen: "wave", libelle: "Wave", simulation: modeSimulation("wave") },
    { moyen: "om", libelle: "Orange Money", simulation: modeSimulation("om") },
  ];
}

// ---------- Signatures des liens publics ----------
const secret = () => process.env.JWT_SECRET ?? "kuran-dev-secret-ne-pas-utiliser-en-prod";
export const signer = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url").slice(0, 32);
export function verifier(s: string, t: string | undefined): boolean {
  if (!t) return false;
  const a = Buffer.from(signer(s));
  const b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const lienPayerOccupant = (occupantId: string) => `${urlPublique()}/payer/${occupantId}?t=${signer(`occupant:${occupantId}`)}`;

// ---------- Création d'un paiement ----------
interface Creation {
  organisationId: string;
  type: "quote_part" | "abonnement";
  montant: number;
  moyen: Moyen;
  occupantId?: string;
  quotesPartsIds?: string[];
  periodicite?: "mensuel" | "annuel";
  libelle: string;
}

export async function creerPaiement(db: Db, c: Creation): Promise<PaiementEnLigne> {
  const id = uid();
  const retour = `${urlPublique()}/paiement/${id}`;
  let externeId: string | null = null;
  let notifToken: string | null = null;
  let urlPaiement: string;

  if (modeSimulation(c.moyen)) {
    urlPaiement = `${urlPublique()}/api/public/paiements/${id}/simulateur?t=${signer(`sim:${id}`)}`;
  } else if (c.moyen === "wave") {
    const r = await fetch("https://api.wave.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WAVE_API_KEY}`, "content-type": "application/json", "idempotency-key": id },
      body: JSON.stringify({ amount: String(c.montant), currency: "XOF", client_reference: id, success_url: `${retour}?statut=succes`, error_url: `${retour}?statut=erreur` }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.wave_launch_url) throw new Error(`Wave : ${j.message ?? j.code ?? r.status}`);
    externeId = j.id;
    urlPaiement = j.wave_launch_url;
  } else {
    const token = await jetonOrange();
    const env = process.env.OM_ENV === "prod" ? "sn" : "dev";
    const r = await fetch(`https://api.orange.com/orange-money-webpay/${env}/v1/webpayment`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        merchant_key: process.env.OM_MERCHANT_KEY, currency: env === "dev" ? "OUV" : "XOF", order_id: id, amount: c.montant,
        return_url: `${retour}?statut=succes`, cancel_url: `${retour}?statut=annule`, notif_url: `${urlPublique()}/api/webhooks/orange`, lang: "fr", reference: c.libelle.slice(0, 40),
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.payment_url) throw new Error(`Orange Money : ${j.message ?? j.description ?? r.status}`);
    externeId = j.pay_token;
    notifToken = j.notif_token;
    urlPaiement = j.payment_url;
  }

  const [p] = await db.insert(paiementsEnLigne).values({
    id, organisationId: c.organisationId, type: c.type, occupantId: c.occupantId ?? null, quotesPartsIds: c.quotesPartsIds ?? [], periodicite: c.periodicite ?? null,
    montant: c.montant, moyen: c.moyen, externeId, notifToken, urlPaiement,
  }).returning();
  return p;
}

let jetonOrangeCache: { token: string; expire: number } | null = null;
async function jetonOrange(): Promise<string> {
  if (jetonOrangeCache && jetonOrangeCache.expire > Date.now()) return jetonOrangeCache.token;
  const basic = Buffer.from(`${process.env.OM_CLIENT_ID}:${process.env.OM_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://api.orange.com/oauth/v3/token", { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: "grant_type=client_credentials" });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Orange OAuth : ${j.error_description ?? r.status}`);
  jetonOrangeCache = { token: j.access_token, expire: Date.now() + (Number(j.expires_in ?? 3600) - 60) * 1000 };
  return j.access_token;
}

// ---------- Vérification du statut auprès du fournisseur ----------
export async function verifierAupresFournisseur(db: Db, p: PaiementEnLigne): Promise<PaiementEnLigne> {
  if (p.statut !== "en_attente" || modeSimulation(p.moyen as Moyen) || !p.externeId) return p;
  try {
    if (p.moyen === "wave") {
      const r = await fetch(`https://api.wave.com/v1/checkout/sessions/${p.externeId}`, { headers: { authorization: `Bearer ${process.env.WAVE_API_KEY}` } });
      const j: any = await r.json();
      if (j.payment_status === "succeeded") return confirmerPaiement(db, p.id, j.transaction_id ?? j.id);
      if (j.checkout_status === "expired" || j.payment_status === "cancelled") return marquer(db, p.id, "expire");
    } else {
      const env = process.env.OM_ENV === "prod" ? "sn" : "dev";
      const r = await fetch(`https://api.orange.com/orange-money-webpay/${env}/v1/transactionstatus`, {
        method: "POST", headers: { authorization: `Bearer ${await jetonOrange()}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ order_id: p.id, amount: p.montant, pay_token: p.externeId }),
      });
      const j: any = await r.json();
      if (j.status === "SUCCESS") return confirmerPaiement(db, p.id, j.txnid);
      if (j.status === "FAILED" || j.status === "EXPIRED") return marquer(db, p.id, "echec");
    }
  } catch (e: any) {
    await db.update(paiementsEnLigne).set({ erreur: String(e?.message ?? e) }).where(eq(paiementsEnLigne.id, p.id));
  }
  return p;
}

async function marquer(db: Db, id: string, statut: string): Promise<PaiementEnLigne> {
  const [p] = await db.update(paiementsEnLigne).set({ statut }).where(eq(paiementsEnLigne.id, id)).returning();
  return p;
}

// ---------- Confirmation : applique les effets métier (idempotent) ----------
export async function confirmerPaiement(db: Db, id: string, reference?: string | null): Promise<PaiementEnLigne> {
  const [p] = await db.select().from(paiementsEnLigne).where(eq(paiementsEnLigne.id, id));
  if (!p) throw new Error("Paiement inconnu");
  if (p.statut === "paye") return p;
  const moyen = p.moyen as Moyen;

  if (p.type === "quote_part" && p.occupantId) {
    const [o] = await db.select().from(occupants).where(eq(occupants.id, p.occupantId));
    // Seules les quotes-parts encore dues sont réglées (une régularisation manuelle entre-temps est tolérée).
    const dues = await db.select({ id: quotesParts.id }).from(quotesParts).where(and(eq(quotesParts.occupantId, p.occupantId), eq(quotesParts.statut, "due")));
    const ids = p.quotesPartsIds.filter((x) => dues.some((d) => d.id === x));
    let paiementOccupantId: string | null = null;
    if (o && ids.length) {
      const res = await enregistrerPaiementOccupant(db, { organisationId: p.organisationId, occupant: o, quotesPartsIds: ids, moyen, reference: reference ?? undefined, date: new Date(), utilisateurId: null });
      paiementOccupantId = res.paiement.id;
    }
    const [maj] = await db.update(paiementsEnLigne).set({ statut: "paye", payeLe: new Date(), reference: reference ?? null, paiementOccupantId }).where(eq(paiementsEnLigne.id, id)).returning();
    return maj;
  }

  if (p.type === "abonnement") {
    const [org] = await db.select().from(organisations).where(eq(organisations.id, p.organisationId));
    const numero = await prochainNumero(db, p.organisationId, "facture");
    const debut = org?.finEssai && org.statut === "essai" && org.finEssai > new Date() ? org.finEssai : new Date();
    const echeance = new Date(debut);
    if (p.periodicite === "annuel") echeance.setFullYear(echeance.getFullYear() + 1); else echeance.setMonth(echeance.getMonth() + 1);
    const periode = `${debut.toISOString().slice(0, 10)} → ${echeance.toISOString().slice(0, 10)}`;
    const [f] = await db.insert(facturesAbonnement).values({ id: uid(), organisationId: p.organisationId, numero, periode, montant: p.montant, statut: "payee", referencePaiement: reference ?? null }).returning();
    await db.update(organisations).set({ statut: "actif", finEssai: echeance, modifieLe: new Date() }).where(eq(organisations.id, p.organisationId));
    await auditer(db, { organisationId: p.organisationId, action: "abonnement_paye", entite: "organisation", entiteId: p.organisationId, apres: { montant: p.montant, moyen, periode, facture: numero } });
    const [maj] = await db.update(paiementsEnLigne).set({ statut: "paye", payeLe: new Date(), reference: reference ?? null, factureId: f.id }).where(eq(paiementsEnLigne.id, id)).returning();
    return maj;
  }
  return marquer(db, id, "paye");
}

// ---------- Webhooks ----------
/** Wave : en-tête `Wave-Signature: t=<timestamp>,v1=<hmac>` avec HMAC-SHA256(secret, `${t}.${corps}`). */
export function verifierSignatureWave(corps: string, entete: string | undefined): boolean {
  const s = process.env.WAVE_WEBHOOK_SECRET;
  if (!s) return process.env.NODE_ENV !== "production"; // en dev sans secret, on accepte
  if (!entete) return false;
  const parts = Object.fromEntries(entete.split(",").map((x) => x.trim().split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  const attendu = createHmac("sha256", s).update(`${parts.t}.${corps}`).digest("hex");
  const a = Buffer.from(attendu);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function traiterWebhookWave(db: Db, evenement: any): Promise<string> {
  const data = evenement?.data ?? evenement;
  const id: string | undefined = data?.client_reference;
  if (!id) return "ignore";
  if (evenement?.type === "checkout.session.completed" || data?.payment_status === "succeeded") {
    await confirmerPaiement(db, id, data.transaction_id ?? data.id);
    return "paye";
  }
  return "ignore";
}

/** Orange : notif_url reçoit { status, notif_token, txnid } ; le notif_token doit être celui de la session. */
export async function traiterWebhookOrange(db: Db, corps: any): Promise<string> {
  const token = corps?.notif_token;
  if (!token) return "ignore";
  const [p] = await db.select().from(paiementsEnLigne).where(eq(paiementsEnLigne.notifToken, token));
  if (!p) return "inconnu";
  if (corps.status === "SUCCESS") { await confirmerPaiement(db, p.id, corps.txnid); return "paye"; }
  if (corps.status === "FAILED") { await marquer(db, p.id, "echec"); return "echec"; }
  return "ignore";
}

export const nouveauNumeroSimulation = () => `SIM-${randomBytes(4).toString("hex").toUpperCase()}`;
