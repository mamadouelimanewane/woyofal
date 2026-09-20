/** Routes publiques signées : quittance PDF (lien envoyé aux occupants par WhatsApp / SMS). */
import { Hono } from "hono";
import type { Vars } from "../lib/auth.js";
import { genererQuittancePdf, verifierSignature } from "../lib/quittance-pdf.js";
import { donneesQuittance } from "./occupants.js";

const r = new Hono<Vars>();

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

export default r;
