CREATE TABLE "paiements_en_ligne" (
	"id" text PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"type" text NOT NULL,
	"occupant_id" text,
	"quotes_parts_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"periodicite" text,
	"montant" integer NOT NULL,
	"moyen" text NOT NULL,
	"statut" text DEFAULT 'en_attente' NOT NULL,
	"externe_id" text,
	"notif_token" text,
	"reference" text,
	"url_paiement" text,
	"paiement_occupant_id" text,
	"facture_id" text,
	"erreur" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"paye_le" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "pel_org_statut" ON "paiements_en_ligne" USING btree ("organisation_id","statut");--> statement-breakpoint
CREATE INDEX "pel_externe" ON "paiements_en_ligne" USING btree ("externe_id");