/** Enregistrement d'un paiement d'occupant (manuel ou en ligne) : quittance numérotée, quotes-parts soldées, notification. */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { occupants, organisations, paiementsOccupant, quotesParts } from "../db/schema.js";
import { auditer } from "./audit.js";
import { notifier } from "./notifications.js";
import { urlQuittance } from "./quittance-pdf.js";
import { invalide, prochainNumero, uid, urlPublique } from "./util.js";

export interface PaiementOccupantInput {
  organisationId: string;
  occupant: typeof occupants.$inferSelect;
  quotesPartsIds: string[];
  moyen: string;
  reference?: string;
  date: Date;
  utilisateurId: string | null;
}

export async function enregistrerPaiementOccupant(db: Db, i: PaiementOccupantInput) {
  const qps = await db.select().from(quotesParts).where(and(inArray(quotesParts.id, i.quotesPartsIds), eq(quotesParts.occupantId, i.occupant.id), eq(quotesParts.statut, "due")));
  if (qps.length !== i.quotesPartsIds.length) invalide("Une des quotes-parts n'est pas due ou n'appartient pas à cet occupant");
  const montant = qps.reduce((a, q) => a + q.montant, 0);
  const numero = await prochainNumero(db, i.organisationId, "quittance");
  const quittanceUrl = urlQuittance(urlPublique(), numero);
  const [paiement] = await db.insert(paiementsOccupant).values({ id: uid(), organisationId: i.organisationId, occupantId: i.occupant.id, montant, date: i.date, moyen: i.moyen, reference: i.reference, quittanceNumero: numero, quittanceUrl, quotesPartsIds: qps.map((q) => q.id), creePar: i.utilisateurId }).returning();
  await db.update(quotesParts).set({ statut: "payee", datePaiement: i.date, moyenPaiement: i.moyen, referencePaiement: i.reference, quittanceNumero: numero, modifieLe: new Date(), modifiePar: i.utilisateurId }).where(inArray(quotesParts.id, qps.map((q) => q.id)));
  await auditer(db, { organisationId: i.organisationId, utilisateurId: i.utilisateurId, action: "payer", entite: "occupant", entiteId: i.occupant.id, apres: { montant, moyen: i.moyen, quittance: numero, enLigne: i.utilisateurId === null } });
  if (i.occupant.telephone && i.occupant.consentementNotifications) {
    const [org] = await db.select({ nom: organisations.nom, p: organisations.parametres }).from(organisations).where(eq(organisations.id, i.organisationId));
    const corps = org.p?.langue === "wo"
      ? `${org.nom} : jot nanu sa fey bu ${montant.toLocaleString("fr-FR")} F (${i.moyen}). Quittance n° ${numero} : ${quittanceUrl}`
      : `${org.nom} : paiement de ${montant.toLocaleString("fr-FR")} F reçu (${i.moyen}). Quittance n° ${numero} : ${quittanceUrl}`;
    await notifier(db, { organisationId: i.organisationId, destinataire: i.occupant.telephone, occupantId: i.occupant.id, modele: "quittance", corps });
  }
  return { paiement, quittanceNumero: numero, quittanceUrl, montant };
}
