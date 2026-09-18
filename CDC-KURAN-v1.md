# KURAÑ — Gestion de parc de compteurs Woyofal
## Cahier des charges v1 — 18 septembre 2026

*Kurañ = « électricité » en wolof.*

---

## 1. Vision et positionnement

**Problème** : toute structure qui gère plus de 5 compteurs Woyofal (bailleur, gérant d'immeuble, cité, entreprise multi-sites, école, pharmacie en chaîne, ONG, collectivité) le fait sur cahier, WhatsApp et Excel. Aucune visibilité sur qui a rechargé quoi, combien coûte chaque site, qui doit quoi, et aucun moyen de détecter une dérive ou une fraude.

**Produit** : un SaaS de pilotage du parc de compteurs prépayés. Il ne vend pas de crédit (Wave/OM le font déjà), il **organise, répartit, relance et rapporte**.

**Indépendance Senelec** : aucune API n'existe. Les données entrent par les reçus de recharge (SMS Wave/OM/Free, photo du ticket, saisie manuelle). Le jour où les compteurs intelligents Senelec exposent une API, KURAÑ est déjà en place avec la base clients et le parc.

**Deux packagings, un seul moteur** :

| | KURAÑ Immo | KURAÑ Entreprise |
|---|---|---|
| Cible | Bailleurs, gérants, SCI, promoteurs, cités universitaires | DAF / logisticiens : pharmacies, écoles, banques, télécoms, ONG, mairies |
| Objet géré | Lot → occupant → compteur | Site → responsable → compteur(s) |
| Fonction clé | Répartition des compteurs partagés + quittances + relances | Budget par site + alertes de dérive + reporting BI |
| Acheteur | Le gérant | Le DAF |

---

## 2. Rôles (RBAC)

| Rôle | Périmètre | Droits |
|---|---|---|
| **Super-admin** (processingenierie) | Plateforme | Organisations, abonnements, grille tarifaire, support |
| **Administrateur d'organisation** | Son organisation | Tout : parc, utilisateurs, paramètres, facturation |
| **Gestionnaire** | Sites/immeubles assignés | Compteurs, recharges, occupants, relances, rapports |
| **Agent de site** | Un site / immeuble | Saisir une recharge, un relevé, signaler un incident |
| **Occupant / Locataire** | Son lot | Voir ses recharges, son solde dû, ses quittances, payer sa part |
| **Lecture seule** (DAF, auditeur) | Organisation | Tableaux de bord et exports uniquement |

---

## 3. Modules fonctionnels

### 3.1 Parc (MVP)
- Hiérarchie : Organisation → Site (immeuble / agence / école) → Lot (appartement / bureau / local) → Compteur.
- Fiche compteur : numéro compteur (11 chiffres), type (DPP / DMP / PRO), puissance souscrite, tarif applicable, statut (actif / partagé / résilié), photo de la plaque, géolocalisation.
- Compteur **partagé** : rattaché à plusieurs lots avec une règle de répartition (voir 3.3).
- Import Excel du parc existant (le gérant a déjà une liste quelque part).

### 3.2 Recharges (MVP)
Trois canaux d'entrée, du plus automatique au plus manuel :
1. **Capture SMS** (app Android) : le SMS de confirmation Wave / Orange Money / Free Money contient montant, numéro de compteur, code 20 chiffres, kWh. Parsing automatique, rattachement au compteur, zéro saisie.
2. **Photo / OCR** du ticket Woyofal (boutique, agence Senelec) : extraction montant, compteur, kWh, date.
3. **Saisie manuelle** : montant + compteur + date, le reste est calculé.

Chaque recharge produit : montant FCFA, kWh crédités, redevance prélevée (si première recharge du mois), TVA, taxe communale, tranche atteinte. Le calcul se fait à partir de la **grille tarifaire versionnée** (voir 3.6).

Suivi du **cumul mensuel par compteur** → position dans les tranches → conseil « rechargez avant le 1er pour rester en tranche 1 ».

### 3.3 Répartition des compteurs partagés (MVP Immo)
Règles disponibles par compteur :
- Parts égales entre les lots rattachés
- Prorata de la surface (m²)
- Prorata des relevés de sous-compteurs (saisie périodique d'index)
- Forfait fixe par lot + solde réparti
- Parties communes : montant ventilé sur tous les lots du site

Chaque recharge sur un compteur partagé génère automatiquement une **quote-part par occupant**, avec historique et justificatif.

### 3.4 Occupants et recouvrement (MVP Immo)
- Fiche occupant : identité, téléphone, lot, date d'entrée / sortie, caution électricité.
- Compte occupant : quotes-parts dues, paiements reçus, solde.
- **Quittance PDF** à chaque paiement, envoyée par WhatsApp / SMS / e-mail.
- **Relances automatiques** paramétrables (J+3, J+7, J+15) via WhatsApp Business API / SMS.
- Changement d'occupant : clôture du compte, état de sortie, transfert du compteur.
- Paiement en ligne de sa quote-part (VersusPay → Wave / OM) — le gérant reçoit, l'occupant a sa quittance instantanément.

### 3.5 Alertes et budgets (MVP Entreprise)
- Budget mensuel par site ; alerte à 80 % et 100 %.
- Aucune recharge depuis N jours (site probablement coupé ou en fraude).
- Recharge anormalement élevée vs moyenne glissante (fuite, appareil défaillant, détournement).
- Recharge hors horaire / hors agent autorisé.
- Fin de mois : rappel « X compteurs n'ont pas encore payé leur redevance ».

### 3.6 Grille tarifaire versionnée (MVP)
Table administrée par le super-admin, avec dates d'effet. Valeurs au 1er janvier 2026 (source CRSE) :
- Tranche 1 : 82 F/kWh — Tranche 2 : 136,49 F — Tranche 3 : 159,36 F
- Redevance mensuelle : 1 155 F (450 location compteur + 705 entretien réseau), prélevée à la première recharge du mois
- TVA 18 % au-delà de 250 kWh/mois
- Taxe communale sur le coût énergie

Toute recharge est calculée avec la grille en vigueur à sa date. Un changement de tarif ne recalcule jamais le passé.

### 3.7 Reporting et BI (MVP Entreprise, V2 Immo)
- Tableau de bord organisation : dépense du mois, kWh, coût moyen par site, top 10 sites, tendance 12 mois.
- Par site : coût par m², coût par jour d'ouverture, comparaison entre sites comparables.
- Exports Excel / PDF ; rapport mensuel automatique envoyé au DAF.
- Consolidation multi-organisations (pour un groupe ou un cabinet gérant plusieurs clients).

### 3.8 Recharge groupée (V2)
Recharger N compteurs en une opération depuis KURAÑ, via un agrégateur de paiement agréé. Nécessite un partenariat de distribution ; ne conditionne pas le MVP.

### 3.9 Portail occupant / responsable de site (V2)
PWA légère : mes recharges, ma quote-part, payer, télécharger mes quittances, signaler un problème.

---

## 4. Modèle de données

```
organisation      (id, nom, type[immo|entreprise], plan, ninea, statut)
utilisateur       (id, organisation_id, role, nom, telephone, email, sites_autorises[])
site              (id, organisation_id, nom, type, adresse, geo, surface_m2, budget_mensuel)
lot               (id, site_id, reference, surface_m2, etage, statut)
compteur          (id, site_id, numero(11), type_tarif, puissance, statut, partage bool, photo_url)
compteur_lot      (compteur_id, lot_id, regle_repartition, parametre)   -- N:N pour compteurs partagés
occupant          (id, lot_id, nom, telephone, date_entree, date_sortie, caution)
recharge          (id, compteur_id, date, montant, kwh, redevance, tva, taxe, tranche,
                   canal[sms|ocr|manuel|api], code_recharge, reference_paiement,
                   saisi_par, justificatif_url)
quote_part        (id, recharge_id, occupant_id, montant, statut[due|payee|annulee])
paiement_occupant (id, occupant_id, montant, date, moyen, reference, quittance_url)
releve_sous_compteur (id, lot_id, date, index, saisi_par)
alerte            (id, organisation_id, site_id, compteur_id, type, seuil, declenchee_le, traitee bool)
grille_tarifaire  (id, date_effet, tranche1, tranche2, tranche3, redevance, seuil_tva, taux_tva, taxe_communale)
abonnement        (id, organisation_id, plan, nb_compteurs, prix_unitaire, echeance, statut)
journal_audit     (id, utilisateur_id, action, entite, avant, apres, date)
```

Index clés : `recharge(compteur_id, date)`, `quote_part(occupant_id, statut)`, `compteur(numero)` unique par organisation.

---

## 5. Écrans

**Communs**
1. Connexion (téléphone + OTP, ou e-mail)
2. Tableau de bord organisation (KPI + alertes + activité récente)
3. Parc : arbre Sites → Lots → Compteurs, recherche par numéro de compteur
4. Fiche compteur : historique des recharges, position dans les tranches ce mois, occupants rattachés
5. Saisie d'une recharge (formulaire + import SMS + photo)
6. Grille tarifaire (lecture) / administration (super-admin)
7. Utilisateurs et rôles
8. Abonnement et facturation

**Immo**
9. Fiche lot / occupant : compte, quotes-parts, paiements, quittances
10. Répartition d'un compteur partagé (règle + simulation)
11. Recouvrement : liste des soldes dus, relances en un clic, envoi groupé
12. Entrée / sortie d'un occupant

**Entreprise**
13. Vue sites : carte + tableau (dépense, budget, écart, alertes)
14. Fiche site : coût/m², tendance, comparaison, responsables
15. Rapports : générateur + historique des rapports envoyés
16. Centre d'alertes : à traiter / traitées, règles

**Mobile (agent de site, Expo)**
17. Ma liste de compteurs
18. Enregistrer une recharge (capture SMS automatique / photo)
19. Saisir un relevé de sous-compteur
20. Signaler un incident

---

## 6. Parcours clés

**A. Onboarding d'un bailleur (15 min)**
Créer organisation → importer Excel (immeubles, lots, compteurs, occupants) → définir les compteurs partagés et leur règle → inviter les occupants par SMS → première recharge saisie → première quote-part générée.

**B. Recharge d'un compteur partagé (cour commune, 6 ménages)**
Le gérant recharge 30 000 F sur Wave → SMS capté par l'app → recharge créée (kWh calculés, redevance déduite) → 6 quotes-parts de 5 000 F générées → chaque occupant reçoit un WhatsApp avec son montant et un lien de paiement → paiement → quittance PDF automatique → le gérant voit qui a payé.

**C. Fin de mois DAF, 80 pharmacies**
Rapport mensuel reçu par e-mail le 1er : dépense totale, 3 sites au-dessus du budget, 1 site sans recharge depuis 12 jours, 1 site avec +60 % vs moyenne → clic sur le site → historique → appel au responsable.

**D. Changement de locataire**
Date de sortie saisie → solde calculé → état de sortie PDF → compteur libéré → nouvel occupant rattaché → les quotes-parts futures basculent automatiquement.

---

## 7. Stack technique

Cohérente avec les autres projets processingenierie :
- **Front web** : React 19 + TypeScript + Vite, PWA, i18n FR/WO
- **Mobile agent** : Expo (nécessaire pour la lecture SMS Android et la caméra)
- **Backend** : Vercel Functions (Node/TS) + Neon PostgreSQL, Drizzle
- **Auth** : OTP SMS + JWT, RBAC par organisation
- **OCR** : Tesseract côté serveur pour le MVP, puis modèle vision si volume
- **Messagerie** : WhatsApp Business API (Meta) + SMS (Orange / fallback)
- **Paiement** : VersusPay (Wave, Orange Money) pour les quotes-parts et les abonnements
- **PDF** : quittances et rapports générés côté serveur
- **Déploiement** : Vercel, repo privé, CI push → prod

Parsing SMS : une table de **patterns par opérateur** (Wave, OM, Free) versionnée, testable, mise à jour sans redéploiement de l'app mobile.

---

## 8. Modèle économique

**Abonnement par compteur actif, facturé mensuellement ou annuellement (–15 %)**

| Plan | Cible | Prix | Inclus |
|---|---|---|---|
| **Starter** | 1–20 compteurs | 15 000 F/mois | Parc, recharges, répartition, quittances, 2 utilisateurs |
| **Immo** | 21–500 compteurs | 600 F/compteur/mois | + relances auto, portail occupant, paiement en ligne, utilisateurs illimités |
| **Entreprise** | par site | 3 000 F/site/mois (min. 10 sites) | + budgets, alertes, BI, rapports auto, API export, SSO |
| **Groupe / Cabinet** | multi-organisations | sur devis | Consolidation, marque blanche, SLA |

Revenus complémentaires :
- Commission sur les paiements de quotes-parts via VersusPay (1–1,5 %)
- Recharge groupée (V2) : commission agrégateur
- Mise en place / import du parc / formation : 100–300 k F par client Entreprise

**Ordres de grandeur** : un gérant de 300 lots = 180 k F/mois. Une chaîne de 80 pharmacies = 240 k F/mois. 30 clients de ce profil = 6–7 M F/mois de MRR.

---

## 9. Roadmap

| Phase | Durée | Livrable |
|---|---|---|
| **MVP Immo** | 5 semaines | Parc, recharges (saisie + SMS), répartition, occupants, quittances, relances, tableau de bord |
| **Pilote** | 4 semaines | 2 bailleurs (un immeuble, une cité), ajustements parsing SMS et règles de répartition |
| **MVP Entreprise** | 3 semaines | Sites, budgets, alertes, rapports auto, BI |
| **Pilote** | 4 semaines | 1 chaîne (pharmacies ou écoles), 1 institution |
| **V2** | trimestre suivant | Portail occupant, OCR, recharge groupée (si partenariat), consolidation groupe |

---

## 10. Risques et réponses

| Risque | Réponse |
|---|---|
| Formats SMS opérateurs qui changent | Patterns versionnés côté serveur + fallback saisie manuelle + alerte interne si taux de parsing chute |
| Senelec sort sa propre app de gestion | Elle sera B2C mono-compteur ; KURAÑ est multi-organisation, répartition, recouvrement — complémentaire, pas concurrent. Partenariat à proposer. |
| Changement de grille tarifaire | Grille versionnée, jamais de recalcul rétroactif |
| Adoption par les agents de site | Mobile ultra-simple : capture SMS automatique = zéro saisie ; formation 30 min |
| Données personnelles (CDP) | Déclaration CDP, chiffrement au repos, journal d'audit, export/suppression sur demande |
| Dépendance WhatsApp Business | SMS en fallback systématique |

---

## 11. Synergies portefeuille

- **H-Matik** : KURAÑ Immo comme module « charges » de la chaîne foncière, ou passerelle bidirectionnelle (lots, occupants)
- **VersusPay** : encaissement quotes-parts et abonnements, déjà en prod
- **Cabinet 360** : export comptable des charges électricité par site (OHADA), argument pour les experts-comptables qui gèrent des SCI
- **GMAO Health** : compteurs des sites hospitaliers = premier client Entreprise naturel
