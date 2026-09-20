/**
 * Quittance PDF (EF-OCC-04) générée avec pdf-lib (pur JS, sans police externe : compatible serverless).
 * L'URL publique est signée (HMAC du numéro) pour être envoyée par WhatsApp / SMS sans compte.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface DonneesQuittance {
  numero: string;
  date: Date;
  montant: number;
  moyen: string;
  reference?: string | null;
  organisation: { nom: string; ninea?: string | null; contact?: string | null };
  occupant: { nom: string; telephone?: string | null };
  lot: string;
  site: string;
  lignes: { date: Date; compteur: string; rechargeMontant: number; quotePart: number }[];
  soldeRestant: number;
}

const secret = () => process.env.JWT_SECRET ?? "kuran-dev-secret-ne-pas-utiliser-en-prod";

export function signerQuittance(numero: string): string {
  return createHmac("sha256", secret()).update(`quittance:${numero}`).digest("base64url").slice(0, 32);
}

export function verifierSignature(numero: string, t: string | undefined): boolean {
  if (!t) return false;
  const a = Buffer.from(signerQuittance(numero));
  const b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function urlQuittance(base: string, numero: string): string {
  return `${base}/api/quittances/${encodeURIComponent(numero)}/pdf?t=${signerQuittance(numero)}`;
}

const F = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} F`;
const D = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Africa/Dakar" });
/** WinAnsi ne couvre pas tous les caractères : on remplace ceux qui feraient échouer pdf-lib. */
const txt = (s: string) =>
  s.replace(/[—–]/g, "-").replace(/…/g, "...").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/→/g, "->").replace(/[  ]/g, " ").replace(/[^\x00-\xff]/g, "?");

export async function genererQuittancePdf(q: DonneesQuittance): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Quittance ${q.numero}`);
  pdf.setAuthor("KURAÑ");
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const teal = rgb(0.06, 0.46, 0.43);
  const gris = rgb(0.4, 0.45, 0.5);
  const noir = rgb(0.1, 0.12, 0.15);
  let y = 790;
  const t = (s: string, x: number, size = 10, f = font, color = noir) => page.drawText(txt(s), { x, y, size, font: f, color });
  const droite = (s: string, xFin: number, size = 10, f = font, color = noir) => page.drawText(txt(s), { x: xFin - f.widthOfTextAtSize(txt(s), size), y, size, font: f, color });

  // En-tête
  t("KURAÑ", 50, 22, bold, teal);
  droite("QUITTANCE D'ÉLECTRICITÉ", 545, 14, bold, noir);
  y -= 18;
  t("Gestion de parc de compteurs Woyofal", 50, 9, font, gris);
  droite(`N° ${q.numero}`, 545, 11, bold, teal);
  y -= 30;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: teal });
  y -= 24;

  // Émetteur / destinataire
  t("ÉMETTEUR", 50, 8, bold, gris);
  t("OCCUPANT", 320, 8, bold, gris);
  y -= 14;
  t(q.organisation.nom, 50, 11, bold);
  t(q.occupant.nom, 320, 11, bold);
  y -= 14;
  if (q.organisation.ninea) { t(`NINEA ${q.organisation.ninea}`, 50, 9, font, gris); }
  t(`${q.site} — ${q.lot}`, 320, 9, font, gris);
  y -= 13;
  if (q.organisation.contact) t(q.organisation.contact, 50, 9, font, gris);
  if (q.occupant.telephone) t(`+${q.occupant.telephone}`, 320, 9, font, gris);
  y -= 30;

  // Montant
  page.drawRectangle({ x: 50, y: y - 34, width: 495, height: 50, color: rgb(0.94, 0.98, 0.97), borderColor: teal, borderWidth: 0.5 });
  y -= 6;
  t("Reçu la somme de", 62, 9, font, gris);
  droite(`Payé le ${D(q.date)} · ${q.moyen}${q.reference ? ` · réf. ${q.reference}` : ""}`, 533, 9, font, gris);
  y -= 20;
  t(F(q.montant), 62, 20, bold, teal);
  y -= 44;

  // Détail
  t("DÉTAIL", 50, 8, bold, gris);
  y -= 16;
  const cols = { date: 50, compteur: 130, recharge: 400, part: 545 };
  t("Recharge du", cols.date, 8, bold, gris);
  t("Compteur", cols.compteur, 8, bold, gris);
  droite("Recharge totale", cols.recharge + 60, 8, bold, gris);
  droite("Quote-part", cols.part, 8, bold, gris);
  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: gris });
  for (const l of q.lignes) {
    y -= 16;
    t(D(l.date), cols.date, 10);
    t(l.compteur.slice(0, 48), cols.compteur, 10);
    droite(F(l.rechargeMontant), cols.recharge + 60, 10, font, gris);
    droite(F(l.quotePart), cols.part, 10, bold);
  }
  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: gris });
  y -= 18;
  t("Solde restant dû après ce paiement", 50, 10, font, gris);
  droite(F(q.soldeRestant), 545, 11, bold, q.soldeRestant > 0 ? rgb(0.7, 0.2, 0.2) : teal);

  // Pied
  y = 70;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: gris });
  y -= 14;
  t(`Quittance générée par KURAÑ le ${D(new Date())}. Ce document atteste du paiement de la part d'électricité prépayée (Woyofal) indiquée ci-dessus.`, 50, 7.5, font, gris);
  y -= 11;
  t(`Vérification : ${q.numero}`, 50, 7.5, font, gris);

  return pdf.save();
}
