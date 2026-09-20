export type OrgType = "immo" | "entreprise";
export type Role = "superadmin" | "admin" | "gestionnaire" | "agent" | "occupant" | "lecture";
export type TypeTarif = "DPP" | "DMP" | "PRO";
export type StatutCompteur = "actif" | "resilie";
export type CanalRecharge = "sms" | "ocr" | "manuel" | "api";
export type StatutQuotePart = "due" | "payee" | "annulee";
export type RegleRepartition = "egal" | "surface" | "sous_compteur" | "forfait";
export type TypeAlerte = "budget_80" | "budget_100" | "inactif" | "anomalie" | "redevance";

export interface Organisation {
  id: string;
  nom: string;
  type: OrgType;
  plan: "gratuit" | "starter" | "immo" | "entreprise" | "groupe";
  statut?: string;
  finEssai?: string | null;
  ninea?: string;
}

export interface Utilisateur {
  id: string;
  organisationId: string;
  role: Role;
  nom: string;
  telephone: string;
}

export interface Site {
  id: string;
  organisationId: string;
  nom: string;
  type: string; // immeuble, cité, agence, pharmacie, école…
  adresse: string;
  geo?: { lat: number; lng: number };
  surfaceM2?: number;
  budgetMensuel?: number;
  responsable?: string;
}

export interface Lot {
  id: string;
  siteId: string;
  reference: string;
  surfaceM2?: number;
  etage?: string;
}

export interface Compteur {
  id: string;
  siteId: string;
  numero: string; // 11 chiffres
  libelle?: string;
  typeTarif: TypeTarif;
  puissanceKva?: number;
  statut: StatutCompteur;
  partage: boolean;
}

/** Rattachement N:N compteur ↔ lot, avec la règle de répartition portée par le compteur. */
export interface CompteurLot {
  compteurId: string;
  lotId: string;
  /** Pour la règle "forfait" : montant fixe mensuel du lot. */
  forfait?: number;
}

export interface Occupant {
  id: string;
  lotId: string;
  nom: string;
  telephone: string;
  dateEntree: string; // ISO date
  dateSortie?: string;
  caution?: number;
}

export interface DetailTarif {
  kwh: number;
  redevance: number;
  energie: number;
  taxeCommunale: number;
  tva: number;
  trancheAtteinte: 1 | 2 | 3;
}

export interface Recharge extends DetailTarif {
  id: string;
  compteurId: string;
  date: string; // ISO datetime
  montant: number;
  canal: CanalRecharge;
  codeRecharge?: string;
  referencePaiement?: string;
  saisiPar: string;
  note?: string;
}

export interface QuotePart {
  id: string;
  rechargeId: string;
  occupantId: string;
  lotId: string;
  montant: number;
  statut: StatutQuotePart;
  datePaiement?: string;
  moyenPaiement?: string;
  quittanceNumero?: string;
}

export interface ReleveSousCompteur {
  id: string;
  lotId: string;
  date: string;
  index: number;
}

export interface Alerte {
  id: string;
  siteId: string;
  compteurId?: string;
  type: TypeAlerte;
  message: string;
  date: string;
  traitee: boolean;
}

export interface GrilleTarifaire {
  id: string;
  dateEffet: string; // ISO date
  libelle: string;
  /** Prix HT par kWh de chaque tranche. */
  tranche1: number;
  tranche2: number;
  tranche3: number;
  /** Bornes hautes de kWh cumulés par période pour T1 et T2. */
  seuilT1: number;
  seuilT2: number;
  redevance: number;
  /** kWh au-delà desquels la TVA s'applique sur l'énergie. */
  seuilTva: number;
  tauxTva: number;
  /** Taxe communale, en fraction du coût énergie. */
  tauxTaxeCommunale: number;
  /** Période de remise à zéro des tranches. */
  periode: "mois" | "bimestre";
}

export interface RegleCompteur {
  compteurId: string;
  regle: RegleRepartition;
}
