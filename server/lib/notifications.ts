/**
 * File de notifications (CDC v2 § 3.7) : chaque message est d'abord enregistré, puis traité
 * par `traiterFile()` (appelée après l'insertion et par le cron /api/admin/notifications/traiter).
 * WhatsApp Business : WHATSAPP_TOKEN + WHATSAPP_PHONE_ID ; repli SMS ; sinon reste "en_attente".
 */
import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { notifications, organisations } from "../db/schema.js";
import { envoyerSms } from "./sms.js";

export type Canal = "whatsapp" | "sms" | "email";

export async function notifier(db: Db, n: { organisationId: string; destinataire: string; occupantId?: string | null; modele: string; corps: string; canal?: Canal }): Promise<string> {
  const id = randomUUID();
  await db.insert(notifications).values({ id, organisationId: n.organisationId, destinataire: n.destinataire, occupantId: n.occupantId ?? null, modele: n.modele, corps: n.corps, canal: n.canal ?? "whatsapp" });
  return id;
}

function dansPlageHoraire(debut = 8, fin = 21): boolean {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Africa/Dakar" }).format(new Date()));
  return h >= debut && h < fin;
}

async function envoyerWhatsApp(telephone: string, corps: string): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: telephone, type: "text", text: { body: corps } }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** E-mail via Resend (RESEND_API_KEY, EMAIL_FROM). Sujet = première ligne du corps. */
export async function envoyerEmail(destinataire: string, sujet: string, corps: string): Promise<boolean> {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) return false;
  try {
    const lignes = corps.split(/\r?\n/).map((l) => l.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>'));
    const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">${lignes.join("<br>")}<br><br><span style="color:#888;font-size:12px">KURAÑ — gestion de parc de compteurs Woyofal</span></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${cle}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "KURAÑ <kuran@resend.dev>", to: [destinataire], subject: sujet, html, text: corps }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Traite jusqu'à `max` notifications en attente. Retourne le nombre envoyé. */
export async function traiterFile(db: Db, max = 50): Promise<{ envoyees: number; echecs: number; reportees: number }> {
  const stats = { envoyees: 0, echecs: 0, reportees: 0 };
  const attente = await db.select().from(notifications).where(and(eq(notifications.statut, "en_attente"), lt(notifications.tentatives, 3))).limit(max);
  for (const n of attente) {
    const [org] = await db.select({ p: organisations.parametres }).from(organisations).where(eq(organisations.id, n.organisationId));
    if (n.canal !== "email" && !dansPlageHoraire(org?.p?.heureDebutEnvoi, org?.p?.heureFinEnvoi)) { stats.reportees++; continue; }
    let ok = false;
    let canal = n.canal;
    if (canal === "whatsapp") {
      ok = await envoyerWhatsApp(n.destinataire, n.corps);
      if (!ok) { canal = "sms"; ok = await envoyerSms(n.destinataire, n.corps); }
    } else if (canal === "sms") ok = await envoyerSms(n.destinataire, n.corps);
    else if (canal === "email") ok = await envoyerEmail(n.destinataire, n.corps.split(/\r?\n/)[0].slice(0, 120), n.corps);
    await db.update(notifications).set(
      ok ? { statut: "envoye", canal, envoyeLe: new Date(), tentatives: n.tentatives + 1 } : { tentatives: n.tentatives + 1, erreur: "aucun canal disponible", statut: n.tentatives + 1 >= 3 ? "echec" : "en_attente" },
    ).where(eq(notifications.id, n.id));
    ok ? stats.envoyees++ : stats.echecs++;
  }
  return stats;
}
