CREATE TABLE "abonnements" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"plan" text NOT NULL,
	"periodicite" text DEFAULT 'mensuel' NOT NULL,
	"nb_compteurs" integer DEFAULT 0 NOT NULL,
	"nb_sites" integer DEFAULT 0 NOT NULL,
	"prix_unitaire" integer DEFAULT 0 NOT NULL,
	"montant" integer DEFAULT 0 NOT NULL,
	"echeance" text,
	"statut" text DEFAULT 'actif' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alertes" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"site_id" text,
	"compteur_id" text,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"cle" text NOT NULL,
	"declenchee_le" timestamp with time zone DEFAULT now() NOT NULL,
	"traitee_le" timestamp with time zone,
	"traitee_par" text,
	"commentaire" text
);
--> statement-breakpoint
CREATE TABLE "compteur_lots" (
	"compteur_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"organisation_id" text NOT NULL,
	"forfait" integer
);
--> statement-breakpoint
CREATE TABLE "compteurs" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"site_id" text NOT NULL,
	"numero" text NOT NULL,
	"libelle" text,
	"type_tarif" text DEFAULT 'DPP' NOT NULL,
	"puissance_kva" numeric(6, 2),
	"statut" text DEFAULT 'actif' NOT NULL,
	"partage" boolean DEFAULT false NOT NULL,
	"regle_repartition" text DEFAULT 'egal' NOT NULL,
	"photo_url" text,
	"geo" jsonb,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ecarts_calcul" (
	"id" text PRIMARY KEY NOT NULL,
	"recharge_id" text NOT NULL,
	"kwh_calcule" numeric(10, 2) NOT NULL,
	"kwh_ticket" numeric(10, 2) NOT NULL,
	"ecart_pct" numeric(6, 2) NOT NULL,
	"grille_id" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factures_abonnement" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"numero" text NOT NULL,
	"periode" text NOT NULL,
	"montant" integer NOT NULL,
	"statut" text DEFAULT 'due' NOT NULL,
	"pdf_url" text,
	"reference_paiement" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grilles_tarifaires" (
	"id" text PRIMARY KEY NOT NULL,
	"date_effet" text NOT NULL,
	"libelle" text NOT NULL,
	"tranche1" numeric(8, 2) NOT NULL,
	"tranche2" numeric(8, 2) NOT NULL,
	"tranche3" numeric(8, 2) NOT NULL,
	"seuil_t1" integer NOT NULL,
	"seuil_t2" integer NOT NULL,
	"redevance" integer NOT NULL,
	"seuil_tva" integer NOT NULL,
	"taux_tva" numeric(5, 4) NOT NULL,
	"taux_taxe_communale" numeric(5, 4) NOT NULL,
	"periode" text DEFAULT 'mois' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text,
	"utilisateur_id" text,
	"action" text NOT NULL,
	"entite" text NOT NULL,
	"entite_id" text,
	"avant" jsonb,
	"apres" jsonb,
	"date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"site_id" text NOT NULL,
	"reference" text NOT NULL,
	"surface_m2" integer,
	"etage" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"destinataire" text NOT NULL,
	"occupant_id" text,
	"canal" text NOT NULL,
	"modele" text NOT NULL,
	"corps" text NOT NULL,
	"statut" text DEFAULT 'en_attente' NOT NULL,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"erreur" text,
	"envoye_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occupants" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"nom" text NOT NULL,
	"telephone" text,
	"email" text,
	"date_entree" text NOT NULL,
	"date_sortie" text,
	"caution" integer,
	"consentement_notifications" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" text NOT NULL,
	"plan" text DEFAULT 'gratuit' NOT NULL,
	"ninea" text,
	"contact" text,
	"logo_url" text,
	"cle_api" text NOT NULL,
	"fin_essai" timestamp with time zone,
	"statut" text DEFAULT 'essai' NOT NULL,
	"parametres" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"telephone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"utilise" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paiements_occupant" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"occupant_id" text NOT NULL,
	"montant" integer NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"moyen" text NOT NULL,
	"reference" text,
	"quittance_numero" text NOT NULL,
	"quittance_url" text,
	"quotes_parts_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "patterns_sms" (
	"id" text PRIMARY KEY NOT NULL,
	"operateur" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"regex" text NOT NULL,
	"champs_map" jsonb NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"date_effet" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"recharge_id" text NOT NULL,
	"occupant_id" text,
	"lot_id" text NOT NULL,
	"montant" integer NOT NULL,
	"statut" text DEFAULT 'due' NOT NULL,
	"date_paiement" timestamp with time zone,
	"moyen_paiement" text,
	"reference_paiement" text,
	"quittance_numero" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recharges" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"compteur_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"periode" text NOT NULL,
	"montant" integer NOT NULL,
	"kwh" numeric(10, 2) NOT NULL,
	"redevance" integer DEFAULT 0 NOT NULL,
	"energie" integer DEFAULT 0 NOT NULL,
	"taxe_communale" integer DEFAULT 0 NOT NULL,
	"tva" integer DEFAULT 0 NOT NULL,
	"tranche_atteinte" integer DEFAULT 1 NOT NULL,
	"grille_id" text,
	"canal" text DEFAULT 'manuel' NOT NULL,
	"operateur" text,
	"code_recharge" text,
	"reference_paiement" text,
	"kwh_ticket" numeric(10, 2),
	"justificatif_url" text,
	"sms_brut" text,
	"note" text,
	"statut" text DEFAULT 'valide' NOT NULL,
	"motif_annulation" text,
	"saisi_par" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "releves_sous_compteur" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"date" text NOT NULL,
	"index" numeric(12, 2) NOT NULL,
	"saisi_par" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"organisation_id" text NOT NULL,
	"nom" text NOT NULL,
	"valeur" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"utilisateur_id" text NOT NULL,
	"refresh_hash" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"revoque_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"nom" text NOT NULL,
	"type" text DEFAULT 'immeuble' NOT NULL,
	"adresse" text,
	"geo" jsonb,
	"surface_m2" integer,
	"budget_mensuel" integer,
	"responsable" text,
	"jours_inactivite_alerte" integer,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sms_entrants" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"brut" text NOT NULL,
	"expediteur" text,
	"analyse" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"statut" text DEFAULT 'en_attente' NOT NULL,
	"recharge_id" text,
	"recu_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilisateurs" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text,
	"role" text NOT NULL,
	"nom" text NOT NULL,
	"telephone" text NOT NULL,
	"email" text,
	"mot_de_passe_hash" text,
	"sites_autorises" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cree_par" text,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_par" text,
	"archive_le" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alertes_cle" ON "alertes" USING btree ("organisation_id","cle");--> statement-breakpoint
CREATE UNIQUE INDEX "compteur_lots_pk" ON "compteur_lots" USING btree ("compteur_id","lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compteurs_numero_org" ON "compteurs" USING btree ("organisation_id","numero");--> statement-breakpoint
CREATE INDEX "compteurs_site" ON "compteurs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "audit_org_date" ON "journal_audit" USING btree ("organisation_id","date");--> statement-breakpoint
CREATE INDEX "lots_site" ON "lots" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "lots_org" ON "lots" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "notifications_org_statut" ON "notifications" USING btree ("organisation_id","statut");--> statement-breakpoint
CREATE INDEX "occupants_lot" ON "occupants" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "occupants_org" ON "occupants" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "paiements_occupant_idx" ON "paiements_occupant" USING btree ("occupant_id");--> statement-breakpoint
CREATE INDEX "qp_occupant_statut" ON "quotes_parts" USING btree ("occupant_id","statut");--> statement-breakpoint
CREATE INDEX "qp_recharge" ON "quotes_parts" USING btree ("recharge_id");--> statement-breakpoint
CREATE INDEX "recharges_compteur_date" ON "recharges" USING btree ("compteur_id","date");--> statement-breakpoint
CREATE INDEX "recharges_org" ON "recharges" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "recharges_code" ON "recharges" USING btree ("code_recharge");--> statement-breakpoint
CREATE INDEX "releves_lot_date" ON "releves_sous_compteur" USING btree ("lot_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "sequences_pk" ON "sequences" USING btree ("organisation_id","nom");--> statement-breakpoint
CREATE INDEX "sites_org" ON "sites" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "sms_entrants_org_statut" ON "sms_entrants" USING btree ("organisation_id","statut");--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateurs_tel_org" ON "utilisateurs" USING btree ("telephone","organisation_id");--> statement-breakpoint
CREATE INDEX "utilisateurs_org" ON "utilisateurs" USING btree ("organisation_id");