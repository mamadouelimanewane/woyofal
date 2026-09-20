/**
 * Schéma KURAÑ — CDC v2 § 6.2. Toutes les tables métier portent organisation_id :
 * c'est la clé de cloisonnement (voir server/lib/auth.ts, helper `scope`).
 * Montants en FCFA entiers, kWh en numérique 2 décimales (RG-12).
 */
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const orgId = () => text("organisation_id").notNull();
const horodatage = {
  creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
  creePar: text("cree_par"),
  modifieLe: timestamp("modifie_le", { withTimezone: true }).defaultNow().notNull(),
  modifiePar: text("modifie_par"),
  archiveLe: timestamp("archive_le", { withTimezone: true }),
};

export const organisations = pgTable("organisations", {
  id: id(),
  nom: text("nom").notNull(),
  type: text("type").notNull(), // immo | entreprise
  plan: text("plan").notNull().default("gratuit"), // gratuit | starter | immo | entreprise | groupe
  ninea: text("ninea"),
  contact: text("contact"),
  logoUrl: text("logo_url"),
  /** Clé d'ingestion SMS (EF-RECH-03), régénérable. */
  cleApi: text("cle_api").notNull(),
  finEssai: timestamp("fin_essai", { withTimezone: true }),
  statut: text("statut").notNull().default("essai"), // essai | actif | lecture_seule | resilie
  parametres: jsonb("parametres").$type<ParametresOrganisation>().notNull().default({}),
  ...horodatage,
});

export interface ParametresOrganisation {
  relances?: number[]; // jours après échéance, ex. [3, 7, 15]
  heureDebutEnvoi?: number;
  heureFinEnvoi?: number;
  langue?: "fr" | "wo";
  canaux?: Array<"whatsapp" | "sms" | "email">;
}

export const utilisateurs = pgTable(
  "utilisateurs",
  {
    id: id(),
    organisationId: text("organisation_id"), // null pour le super-admin
    role: text("role").notNull(), // superadmin | admin | gestionnaire | agent | occupant | lecture
    nom: text("nom").notNull(),
    telephone: text("telephone").notNull(),
    email: text("email"),
    motDePasseHash: text("mot_de_passe_hash"),
    sitesAutorises: jsonb("sites_autorises").$type<string[]>().notNull().default([]),
    actif: boolean("actif").notNull().default(true),
    ...horodatage,
  },
  (t) => [uniqueIndex("utilisateurs_tel_org").on(t.telephone, t.organisationId), index("utilisateurs_org").on(t.organisationId)],
);

export const otpCodes = pgTable("otp_codes", {
  id: id(),
  telephone: text("telephone").notNull(),
  codeHash: text("code_hash").notNull(),
  expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
  tentatives: integer("tentatives").notNull().default(0),
  utilise: boolean("utilise").notNull().default(false),
  creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  utilisateurId: text("utilisateur_id").notNull(),
  refreshHash: text("refresh_hash").notNull(),
  expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
  revoqueLe: timestamp("revoque_le", { withTimezone: true }),
  creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
});

export const sites = pgTable(
  "sites",
  {
    id: id(),
    organisationId: orgId(),
    nom: text("nom").notNull(),
    type: text("type").notNull().default("immeuble"),
    adresse: text("adresse"),
    geo: jsonb("geo").$type<{ lat: number; lng: number }>(),
    surfaceM2: integer("surface_m2"),
    budgetMensuel: integer("budget_mensuel"),
    responsable: text("responsable"),
    joursInactiviteAlerte: integer("jours_inactivite_alerte"),
    ...horodatage,
  },
  (t) => [index("sites_org").on(t.organisationId)],
);

export const lots = pgTable(
  "lots",
  {
    id: id(),
    organisationId: orgId(),
    siteId: text("site_id").notNull(),
    reference: text("reference").notNull(),
    surfaceM2: integer("surface_m2"),
    etage: text("etage"),
    ...horodatage,
  },
  (t) => [index("lots_site").on(t.siteId), index("lots_org").on(t.organisationId)],
);

export const compteurs = pgTable(
  "compteurs",
  {
    id: id(),
    organisationId: orgId(),
    siteId: text("site_id").notNull(),
    numero: text("numero").notNull(), // 11 chiffres (RG-09)
    libelle: text("libelle"),
    typeTarif: text("type_tarif").notNull().default("DPP"), // DPP | DMP | PRO
    puissanceKva: numeric("puissance_kva", { precision: 6, scale: 2 }),
    statut: text("statut").notNull().default("actif"), // actif | resilie
    partage: boolean("partage").notNull().default(false),
    regleRepartition: text("regle_repartition").notNull().default("egal"), // egal | surface | sous_compteur | forfait
    photoUrl: text("photo_url"),
    geo: jsonb("geo").$type<{ lat: number; lng: number }>(),
    ...horodatage,
  },
  (t) => [uniqueIndex("compteurs_numero_org").on(t.organisationId, t.numero), index("compteurs_site").on(t.siteId)],
);

export const compteurLots = pgTable(
  "compteur_lots",
  {
    compteurId: text("compteur_id").notNull(),
    lotId: text("lot_id").notNull(),
    organisationId: orgId(),
    forfait: integer("forfait"),
  },
  (t) => [uniqueIndex("compteur_lots_pk").on(t.compteurId, t.lotId)],
);

export const occupants = pgTable(
  "occupants",
  {
    id: id(),
    organisationId: orgId(),
    lotId: text("lot_id").notNull(),
    nom: text("nom").notNull(),
    telephone: text("telephone"),
    email: text("email"),
    dateEntree: text("date_entree").notNull(), // ISO date
    dateSortie: text("date_sortie"),
    caution: integer("caution"),
    consentementNotifications: boolean("consentement_notifications").notNull().default(true),
    ...horodatage,
  },
  (t) => [index("occupants_lot").on(t.lotId), index("occupants_org").on(t.organisationId)],
);

export const grillesTarifaires = pgTable("grilles_tarifaires", {
  id: id(),
  dateEffet: text("date_effet").notNull(),
  libelle: text("libelle").notNull(),
  tranche1: numeric("tranche1", { precision: 8, scale: 2 }).notNull(),
  tranche2: numeric("tranche2", { precision: 8, scale: 2 }).notNull(),
  tranche3: numeric("tranche3", { precision: 8, scale: 2 }).notNull(),
  seuilT1: integer("seuil_t1").notNull(),
  seuilT2: integer("seuil_t2").notNull(),
  redevance: integer("redevance").notNull(),
  seuilTva: integer("seuil_tva").notNull(),
  tauxTva: numeric("taux_tva", { precision: 5, scale: 4 }).notNull(),
  tauxTaxeCommunale: numeric("taux_taxe_communale", { precision: 5, scale: 4 }).notNull(),
  periode: text("periode").notNull().default("mois"),
  creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
});

export const recharges = pgTable(
  "recharges",
  {
    id: id(),
    organisationId: orgId(),
    compteurId: text("compteur_id").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    periode: text("periode").notNull(), // clé de cumul, ex. 2026-09 (RG-01)
    montant: integer("montant").notNull(),
    kwh: numeric("kwh", { precision: 10, scale: 2 }).notNull(),
    redevance: integer("redevance").notNull().default(0),
    energie: integer("energie").notNull().default(0),
    taxeCommunale: integer("taxe_communale").notNull().default(0),
    tva: integer("tva").notNull().default(0),
    trancheAtteinte: integer("tranche_atteinte").notNull().default(1),
    grilleId: text("grille_id"),
    canal: text("canal").notNull().default("manuel"), // sms | ocr | manuel | api
    operateur: text("operateur"),
    codeRecharge: text("code_recharge"),
    referencePaiement: text("reference_paiement"),
    kwhTicket: numeric("kwh_ticket", { precision: 10, scale: 2 }),
    justificatifUrl: text("justificatif_url"),
    smsBrut: text("sms_brut"),
    note: text("note"),
    statut: text("statut").notNull().default("valide"), // valide | annulee
    motifAnnulation: text("motif_annulation"),
    saisiPar: text("saisi_par"),
    ...horodatage,
  },
  (t) => [index("recharges_compteur_date").on(t.compteurId, t.date), index("recharges_org").on(t.organisationId), index("recharges_code").on(t.codeRecharge)],
);

export const quotesParts = pgTable(
  "quotes_parts",
  {
    id: id(),
    organisationId: orgId(),
    rechargeId: text("recharge_id").notNull(),
    occupantId: text("occupant_id"), // null = imputé au propriétaire (EF-REP-06)
    lotId: text("lot_id").notNull(),
    montant: integer("montant").notNull(),
    statut: text("statut").notNull().default("due"), // due | payee | annulee
    datePaiement: timestamp("date_paiement", { withTimezone: true }),
    moyenPaiement: text("moyen_paiement"),
    referencePaiement: text("reference_paiement"),
    quittanceNumero: text("quittance_numero"),
    ...horodatage,
  },
  (t) => [index("qp_occupant_statut").on(t.occupantId, t.statut), index("qp_recharge").on(t.rechargeId)],
);

export const paiementsOccupant = pgTable(
  "paiements_occupant",
  {
    id: id(),
    organisationId: orgId(),
    occupantId: text("occupant_id").notNull(),
    montant: integer("montant").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    moyen: text("moyen").notNull(), // especes | wave | om | virement | versuspay
    reference: text("reference"),
    quittanceNumero: text("quittance_numero").notNull(),
    quittanceUrl: text("quittance_url"),
    quotesPartsIds: jsonb("quotes_parts_ids").$type<string[]>().notNull().default([]),
    ...horodatage,
  },
  (t) => [index("paiements_occupant_idx").on(t.occupantId)],
);

export const relevesSousCompteur = pgTable(
  "releves_sous_compteur",
  {
    id: id(),
    organisationId: orgId(),
    lotId: text("lot_id").notNull(),
    date: text("date").notNull(),
    index: numeric("index", { precision: 12, scale: 2 }).notNull(),
    saisiPar: text("saisi_par"),
    creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("releves_lot_date").on(t.lotId, t.date)],
);

export const alertes = pgTable(
  "alertes",
  {
    id: id(),
    organisationId: orgId(),
    siteId: text("site_id"),
    compteurId: text("compteur_id"),
    type: text("type").notNull(),
    message: text("message").notNull(),
    cle: text("cle").notNull(), // idempotence : type+cible+période
    declencheeLe: timestamp("declenchee_le", { withTimezone: true }).defaultNow().notNull(),
    traiteeLe: timestamp("traitee_le", { withTimezone: true }),
    traiteePar: text("traitee_par"),
    commentaire: text("commentaire"),
  },
  (t) => [uniqueIndex("alertes_cle").on(t.organisationId, t.cle)],
);

export const patternsSms = pgTable("patterns_sms", {
  id: id(),
  operateur: text("operateur").notNull(),
  version: integer("version").notNull().default(1),
  regex: text("regex").notNull(),
  /** Nom de groupe capturant → champ : { montant: 1, compteur: 2, ... } */
  champsMap: jsonb("champs_map").$type<Record<string, number>>().notNull(),
  actif: boolean("actif").notNull().default(true),
  dateEffet: text("date_effet").notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    organisationId: orgId(),
    destinataire: text("destinataire").notNull(),
    occupantId: text("occupant_id"),
    canal: text("canal").notNull(), // whatsapp | sms | email
    modele: text("modele").notNull(),
    corps: text("corps").notNull(),
    statut: text("statut").notNull().default("en_attente"), // en_attente | envoye | delivre | echec
    tentatives: integer("tentatives").notNull().default(0),
    erreur: text("erreur"),
    envoyeLe: timestamp("envoye_le", { withTimezone: true }),
    creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_org_statut").on(t.organisationId, t.statut)],
);

export const abonnements = pgTable("abonnements", {
  id: id(),
  organisationId: orgId(),
  plan: text("plan").notNull(),
  periodicite: text("periodicite").notNull().default("mensuel"), // mensuel | annuel
  nbCompteurs: integer("nb_compteurs").notNull().default(0),
  nbSites: integer("nb_sites").notNull().default(0),
  prixUnitaire: integer("prix_unitaire").notNull().default(0),
  montant: integer("montant").notNull().default(0),
  echeance: text("echeance"),
  statut: text("statut").notNull().default("actif"),
  ...horodatage,
});

export const facturesAbonnement = pgTable("factures_abonnement", {
  id: id(),
  organisationId: orgId(),
  numero: text("numero").notNull(),
  periode: text("periode").notNull(),
  montant: integer("montant").notNull(),
  statut: text("statut").notNull().default("due"), // due | payee | annulee
  pdfUrl: text("pdf_url"),
  referencePaiement: text("reference_paiement"),
  creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
});

export const ecartsCalcul = pgTable("ecarts_calcul", {
  id: id(),
  rechargeId: text("recharge_id").notNull(),
  kwhCalcule: numeric("kwh_calcule", { precision: 10, scale: 2 }).notNull(),
  kwhTicket: numeric("kwh_ticket", { precision: 10, scale: 2 }).notNull(),
  ecartPct: numeric("ecart_pct", { precision: 6, scale: 2 }).notNull(),
  grilleId: text("grille_id"),
  creeLe: timestamp("cree_le", { withTimezone: true }).defaultNow().notNull(),
});

export const journalAudit = pgTable(
  "journal_audit",
  {
    id: id(),
    organisationId: text("organisation_id"),
    utilisateurId: text("utilisateur_id"),
    action: text("action").notNull(),
    entite: text("entite").notNull(),
    entiteId: text("entite_id"),
    avant: jsonb("avant"),
    apres: jsonb("apres"),
    date: timestamp("date", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_org_date").on(t.organisationId, t.date)],
);

export const sequences = pgTable("sequences", {
  organisationId: text("organisation_id").notNull(),
  nom: text("nom").notNull(), // quittance | facture
  valeur: integer("valeur").notNull().default(0),
}, (t) => [uniqueIndex("sequences_pk").on(t.organisationId, t.nom)]);

/** SMS reçus par l'endpoint d'ingestion (EF-RECH-03/05) : rattachés ou en attente de rattachement. */
export const smsEntrants = pgTable(
  "sms_entrants",
  {
    id: id(),
    organisationId: orgId(),
    brut: text("brut").notNull(),
    expediteur: text("expediteur"),
    analyse: jsonb("analyse").$type<Record<string, unknown>>().notNull().default({}),
    statut: text("statut").notNull().default("en_attente"), // en_attente | rattache | ignore | doublon
    rechargeId: text("recharge_id"),
    recuLe: timestamp("recu_le", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sms_entrants_org_statut").on(t.organisationId, t.statut)],
);
