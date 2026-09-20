# KURAÑ — Cahier des charges de développement
## Version 2.0 — 20 septembre 2026

| | |
|---|---|
| Produit | KURAÑ — pilotage de parc de compteurs Woyofal |
| Éditeur / MOA | processingenierie (Mamadou Dia, DG) |
| MOE | processingenierie — atelier interne |
| Document précédent | CDC-KURAN-v1.md (18/09/2026) — vision produit |
| Objet de ce document | Spécifier ce qui doit être développé, dans quel ordre, avec quels critères d'acceptation |
| Statut | À valider |

---

## 0. Lecture rapide

KURAÑ est un SaaS B2B qui organise, répartit, recouvre et rapporte les dépenses d'électricité prépayée (Woyofal) pour les structures qui gèrent plusieurs compteurs : bailleurs et gérants d'immeubles (**Immo**), entreprises et institutions multi-sites (**Entreprise**). Il ne vend pas de crédit et ne dépend d'aucune API Senelec : les recharges entrent par capture du SMS de confirmation Wave / Orange Money / Free Money, par photo du ticket, ou par saisie.

Le développement est découpé en **trois lots** livrés successivement :

| Lot | Contenu | Durée | Jalon |
|---|---|---|---|
| **Lot 1 — MVP Immo** | Parc, recharges, grille, répartition, occupants, quittances, relances, tableau de bord, abonnement | 5 semaines | Pilote 2 gérants |
| **Lot 2 — Entreprise** | Sites, budgets, alertes, rapports automatiques, BI, export comptable | 3 semaines | Pilote 1 chaîne + 1 institution |
| **Lot 3 — V2** | Portail occupant, OCR ticket, app mobile agent, recharge groupée, consolidation groupe | trimestre suivant | Commercialisation large |

Priorités notées **M** (Must, indispensable au lot), **S** (Should, attendu), **C** (Could, si le temps le permet).

---

## 1. Contexte et objectifs

### 1.1 Problème
Toute structure gérant plus de 5 compteurs Woyofal le fait sur cahier, WhatsApp et Excel. Conséquences : répartition contestée entre occupants d'un compteur partagé, quittances manuelles, impayés non suivis, aucune visibilité par site, fraude possible des agents, aucune détection de dérive.

### 1.2 Objectifs mesurables du produit
| Objectif | Indicateur | Cible |
|---|---|---|
| Supprimer la saisie | Part des recharges créées automatiquement (SMS/OCR) | ≥ 80 % après 1 mois |
| Fiabiliser la répartition | Quotes-parts contestées | < 2 % |
| Accélérer le recouvrement | Délai moyen de paiement d'une quote-part | < 7 jours |
| Donner la visibilité | Rapport mensuel généré sans intervention | 100 % des organisations Entreprise |
| Adoption | Organisation active (≥ 1 recharge/semaine) 3 mois après onboarding | ≥ 70 % |

### 1.3 Hypothèses validées par les pilotes (conditionnent le Lot 3)
- H1 : un gérant accepte de payer 600 F/compteur/mois ou un forfait équivalent.
- H2 : la capture SMS remplit ≥ 80 % des recharges sans saisie.
- H3 : les occupants paient leur quote-part en ligne quand le lien leur est envoyé par WhatsApp.

### 1.4 Hors périmètre (explicitement)
- Vente ou revente de crédit Woyofal (Lot 3 en option, via agrégateur agréé).
- Lecture directe du compteur (IoT, API Senelec).
- Comptabilité générale (export vers Cabinet 360 uniquement).
- Gestion locative complète (loyers, baux) — c'est H-Matik.

---

## 2. Acteurs et rôles (RBAC)

| Rôle | Périmètre | Droits principaux |
|---|---|---|
| **Super-admin** (processingenierie) | Plateforme | Organisations, plans, grille tarifaire, patterns SMS, support, impersonation tracée |
| **Administrateur d'organisation** | Son organisation | Tout : parc, utilisateurs, paramètres, abonnement, facturation |
| **Gestionnaire** | Sites assignés | Compteurs, recharges, occupants, relances, rapports |
| **Agent de site** | Un site | Saisir recharge / relevé, signaler incident (mobile) |
| **Occupant** | Son lot | Ses recharges, sa quote-part, payer, quittances (Lot 3) |
| **Lecture seule** | Organisation | Tableaux de bord et exports |

Règle : toute donnée est cloisonnée par `organisation_id` ; aucune requête ne traverse deux organisations sauf pour le super-admin et le plan Groupe (Lot 3).

---

## 3. Exigences fonctionnelles

### 3.1 Authentification et comptes — Lot 1

| Réf | Exigence | Prio |
|---|---|---|
| EF-AUTH-01 | Connexion par téléphone + OTP SMS (6 chiffres, validité 5 min, 3 essais) | M |
| EF-AUTH-02 | Connexion par e-mail + mot de passe (≥ 10 caractères) pour les profils bureau | M |
| EF-AUTH-03 | Session JWT (access 15 min, refresh 30 jours, révocable) | M |
| EF-AUTH-04 | Invitation d'un utilisateur par SMS/e-mail avec rôle et sites assignés | M |
| EF-AUTH-05 | Désactivation d'un utilisateur sans perte d'historique | M |
| EF-AUTH-06 | Journal d'audit de toute action d'écriture (qui, quoi, avant/après, quand) | M |
| EF-AUTH-07 | 2FA optionnelle pour l'administrateur d'organisation | C |

### 3.2 Organisation et parc — Lot 1

| Réf | Exigence | Prio |
|---|---|---|
| EF-PARC-01 | Création d'organisation : nom, type (immo / entreprise), NINEA, contact, logo | M |
| EF-PARC-02 | Hiérarchie Organisation → Site → Lot → Compteur ; un compteur peut être rattaché à 0..N lots | M |
| EF-PARC-03 | Fiche compteur : numéro 11 chiffres (unique par organisation, vérification de format), type tarifaire (DPP / DMP / PRO), puissance souscrite, statut (actif / partagé / résilié), photo de plaque, géolocalisation | M |
| EF-PARC-04 | Fiche site : nom, type, adresse, géo, surface, responsable, budget mensuel (Lot 2) | M |
| EF-PARC-05 | Fiche lot : référence, surface m², étage, statut (occupé / vacant) | M |
| EF-PARC-06 | Import Excel/CSV du parc (modèle fourni) avec rapport d'erreurs ligne par ligne et prévisualisation avant validation | M |
| EF-PARC-07 | Recherche globale par numéro de compteur, nom d'occupant, nom de site | M |
| EF-PARC-08 | Archivage (jamais de suppression physique) d'un site, lot ou compteur avec historique conservé | M |
| EF-PARC-09 | Export Excel du parc | S |

### 3.3 Recharges — Lot 1 (canal SMS et saisie), Lot 3 (OCR)

| Réf | Exigence | Prio |
|---|---|---|
| EF-RECH-01 | Saisie manuelle : compteur, date, montant FCFA ; kWh, redevance, TVA, tranche calculés automatiquement ; possibilité de forcer les kWh reçus (valeur du ticket) | M |
| EF-RECH-02 | Collage d'un SMS de confirmation dans un champ texte → parsing → formulaire prérempli | M |
| EF-RECH-03 | Endpoint d'ingestion SMS (`POST /api/recharges/sms`) appelé par l'app mobile ou un transitaire SMS Android (application de forwarding) avec clé d'organisation | M |
| EF-RECH-04 | Patterns de parsing par opérateur (Wave, Orange Money, Free Money, Senelec) stockés en base, versionnés, testables depuis l'admin, sans redéploiement | M |
| EF-RECH-05 | Rattachement automatique au compteur par numéro ; si inconnu → file « à rattacher » avec proposition de création | M |
| EF-RECH-06 | Détection de doublon (même code de recharge, ou même compteur + montant + horodatage ± 2 min) | M |
| EF-RECH-07 | Pièce jointe justificatif (photo, PDF) sur toute recharge | M |
| EF-RECH-08 | Historique par compteur avec cumul mensuel, position dans les tranches, coût moyen du kWh du mois | M |
| EF-RECH-09 | Conseil de recharge : « il reste X kWh en tranche 1 ce mois » | S |
| EF-RECH-10 | Correction / annulation d'une recharge avec motif, tracée, recalcul des quotes-parts non payées uniquement | M |
| EF-RECH-11 | OCR du ticket Woyofal (photo) → extraction montant, compteur, kWh, date, code | Lot 3 |
| EF-RECH-12 | Alerte interne si le taux de parsing SMS d'un opérateur chute sous 90 % sur 7 jours | S |

### 3.4 Grille tarifaire et moteur de calcul — Lot 1

| Réf | Exigence | Prio |
|---|---|---|
| EF-TARIF-01 | Grille versionnée avec date d'effet : bornes et prix des tranches, redevance mensuelle (location + entretien), seuil et taux TVA, taxe communale, par type tarifaire | M |
| EF-TARIF-02 | Administration par le super-admin uniquement ; lecture pour tous | M |
| EF-TARIF-03 | Toute recharge est calculée avec la grille en vigueur à sa date ; aucun recalcul rétroactif lors d'un changement de grille | M |
| EF-TARIF-04 | Simulateur public FCFA ↔ kWh (page marketing, sans compte) | C |
| EF-TARIF-05 | Tests unitaires du moteur couvrant : première recharge du mois, passage de tranche au sein d'une recharge, franchissement du seuil TVA, mois à cheval sur deux grilles | M |

### 3.5 Répartition des compteurs partagés — Lot 1

| Réf | Exigence | Prio |
|---|---|---|
| EF-REP-01 | Règles disponibles par compteur : parts égales ; prorata surface ; prorata relevés de sous-compteurs ; forfait par lot + solde réparti ; parties communes ventilées sur tous les lots du site | M |
| EF-REP-02 | Simulation de la règle avant enregistrement (montant fictif → aperçu des quotes-parts) | M |
| EF-REP-03 | Génération automatique des quotes-parts à chaque recharge validée ; somme des quotes-parts = montant de la recharge (arrondi au franc, écart imputé au lot le plus grand) | M |
| EF-REP-04 | Saisie périodique des index de sous-compteurs (web + mobile) avec contrôle de cohérence (index ≥ précédent) | M |
| EF-REP-05 | Changement de règle daté : ne s'applique qu'aux recharges postérieures | M |
| EF-REP-06 | Lot vacant : sa part est imputée au bailleur (compte « propriétaire ») | M |

### 3.6 Occupants et recouvrement — Lot 1

| Réf | Exigence | Prio |
|---|---|---|
| EF-OCC-01 | Fiche occupant : identité, téléphone(s), e-mail, lot, date d'entrée / sortie, caution électricité, pièce d'identité (optionnel) | M |
| EF-OCC-02 | Compte occupant : quotes-parts dues, paiements, solde, historique exportable | M |
| EF-OCC-03 | Enregistrement d'un paiement (espèces, Wave, OM, virement) avec référence | M |
| EF-OCC-04 | Quittance PDF numérotée (séquence par organisation) à chaque paiement, envoyée par WhatsApp / SMS / e-mail | M |
| EF-OCC-05 | Relances automatiques paramétrables par organisation (J+3, J+7, J+15), canal WhatsApp avec fallback SMS, modèle de message personnalisable | M |
| EF-OCC-06 | Vue recouvrement : soldes dus par site, tri par ancienneté, relance en un clic, envoi groupé | M |
| EF-OCC-07 | Sortie d'un occupant : solde de clôture, état de sortie PDF, libération du lot, transfert des quotes-parts futures | M |
| EF-OCC-08 | Lien de paiement en ligne (VersusPay → Wave / OM) dans chaque notification ; rapprochement automatique par webhook | S (Lot 1) → M (Lot 3) |
| EF-OCC-09 | Portail occupant (PWA, sans installation) : mes quotes-parts, payer, mes quittances, déclarer une recharge que j'ai faite moi-même, signaler un problème | Lot 3 |

### 3.7 Notifications — Lot 1

| Réf | Exigence | Prio |
|---|---|---|
| EF-NOTIF-01 | Canaux : WhatsApp Business API (modèles approuvés), SMS (Orange ou agrégateur), e-mail | M |
| EF-NOTIF-02 | File d'envoi asynchrone avec statut (en attente / envoyé / délivré / échec), retry 3×, fallback WhatsApp → SMS | M |
| EF-NOTIF-03 | Préférences par organisation : canaux activés, plage horaire d'envoi (pas de relance entre 21 h et 8 h), langue (FR / WO) | M |
| EF-NOTIF-04 | Journal des notifications consultable par occupant | S |

### 3.8 Budgets et alertes — Lot 2

| Réf | Exigence | Prio |
|---|---|---|
| EF-ALERT-01 | Budget mensuel par site ; alertes à 80 % et 100 % | M |
| EF-ALERT-02 | Aucune recharge depuis N jours (N paramétrable par site) | M |
| EF-ALERT-03 | Recharge anormale : montant > moyenne glissante 3 mois × facteur (défaut 1,6) | M |
| EF-ALERT-04 | Recharge hors horaire ou par un agent non autorisé sur le site | S |
| EF-ALERT-05 | Fin de mois : compteurs sans recharge (redevance non payée, risque de cumul) | S |
| EF-ALERT-06 | Centre d'alertes : à traiter / traitées, assignation, commentaire, clôture | M |
| EF-ALERT-07 | Diffusion : notification in-app + e-mail au responsable du site et au gestionnaire | M |

### 3.9 Reporting et BI — Lot 2

| Réf | Exigence | Prio |
|---|---|---|
| EF-BI-01 | Tableau de bord organisation : dépense du mois, kWh, coût moyen kWh, top 10 sites, tendance 12 mois, alertes ouvertes | M |
| EF-BI-02 | Fiche site : coût / m², coût / jour d'ouverture, comparaison entre sites du même type | M |
| EF-BI-03 | Rapport mensuel PDF automatique envoyé le 1er du mois au DAF (paramétrable) | M |
| EF-BI-04 | Exports Excel : recharges, quotes-parts, paiements, sites, avec filtres | M |
| EF-BI-05 | Export comptable des charges électricité par site (format Cabinet 360 / OHADA, compte 605) | S |
| EF-BI-06 | Consolidation multi-organisations (plan Groupe / Cabinet) | Lot 3 |

### 3.10 Abonnement et facturation — Lot 1

| Réf | Exigence | Prio |
|---|---|---|
| EF-ABO-01 | Plans : Gratuit (≤ 5 compteurs), Starter, Immo, Entreprise, Groupe — voir § 8 | M |
| EF-ABO-02 | Essai 30 jours toutes fonctionnalités, puis bascule automatique sur le plan choisi | M |
| EF-ABO-03 | Compteur d'usage (compteurs actifs / sites actifs) recalculé chaque nuit ; facturation sur le maximum du mois | M |
| EF-ABO-04 | Paiement de l'abonnement via VersusPay (Wave / OM) ou virement ; facture PDF numérotée ; relance J+5, restriction lecture seule J+15, jamais de suppression de données | M |
| EF-ABO-05 | Option annuelle –15 % | M |
| EF-ABO-06 | Back-office super-admin : liste des organisations, MRR, usage, impayés, changement de plan manuel | M |

### 3.11 Application mobile agent — Lot 3 (Lot 1 : PWA web responsive)

| Réf | Exigence | Prio |
|---|---|---|
| EF-MOB-01 | Android (Expo) : lecture automatique des SMS de confirmation (permission explicite, filtrage sur les expéditeurs connus uniquement) → envoi à l'API | M |
| EF-MOB-02 | Mes compteurs, enregistrer une recharge (SMS auto / photo / saisie), saisir un relevé, signaler un incident | M |
| EF-MOB-03 | Mode hors ligne : file locale, synchronisation au retour réseau | M |
| EF-MOB-04 | iOS : mêmes fonctions sans lecture SMS (saisie et photo) | S |

---

## 4. Règles de gestion

| Réf | Règle |
|---|---|
| RG-01 | Le **mois de référence** d'une recharge est le mois calendaire de sa date locale (Africa/Dakar). |
| RG-02 | La **redevance mensuelle** est déduite du montant de la première recharge du mois de référence sur un compteur. Si le montant est inférieur à la redevance, le reliquat est reporté sur la recharge suivante. |
| RG-03 | Les **tranches** sont cumulatives sur le mois : du kWh n° 1 au n° 150 au prix T1, etc. Une recharge peut chevaucher plusieurs tranches ; le calcul se fait par portion. |
| RG-04 | La **TVA** s'applique au-delà du seuil (250 kWh cumulés) sur la part d'énergie dépassant le seuil. |
| RG-05 | Si l'utilisateur saisit les kWh réels du ticket et qu'ils diffèrent de plus de 3 % du calcul, la valeur du ticket prime et un écart est journalisé (permet de détecter une grille obsolète). |
| RG-06 | Les quotes-parts sont exprimées en FCFA, arrondies au franc ; l'écart d'arrondi est imputé au lot de plus grande surface (ou au premier par ordre alphabétique à défaut). |
| RG-07 | Une quote-part **payée** n'est jamais modifiée ; une correction de recharge génère un avoir ou une quote-part complémentaire. |
| RG-08 | Un occupant sorti conserve l'accès en lecture à ses quittances pendant 24 mois. |
| RG-09 | Le numéro de compteur est validé : 11 chiffres, unique par organisation ; un même compteur peut exister dans deux organisations différentes (changement de gérant). |
| RG-10 | Les relances s'arrêtent dès que le solde de l'occupant est nul ou négatif. |
| RG-11 | Aucune donnée n'est supprimée physiquement pendant 5 ans (conservation des pièces) sauf demande CDP d'un occupant, traitée par anonymisation. |
| RG-12 | Les montants sont stockés en entiers (FCFA), les kWh en décimal (2 décimales). |

---

## 5. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| **Performance** | Tableau de bord < 1,5 s pour 500 compteurs ; import de 2 000 lignes < 30 s ; API p95 < 400 ms |
| **Disponibilité** | 99,5 % mensuel ; sauvegarde Neon quotidienne, rétention 30 jours, restauration testée avant la mise en production |
| **Sécurité** | HTTPS, JWT signés, hachage Argon2, rate-limiting OTP (5/h/numéro), cloisonnement par organisation vérifié par des tests automatisés, secrets en variables d'environnement, revue OWASP Top 10 avant chaque lot |
| **Données personnelles** | Déclaration CDP avant le pilote ; consentement des occupants à la réception de notifications ; export et suppression sur demande ; chiffrement au repos (Neon) |
| **Compatibilité** | Chrome / Safari / Firefox, 2 dernières versions ; Android 10+ ; écrans à partir de 360 px |
| **Hors ligne** | PWA : consultation du parc et des dernières recharges en cache ; saisie mise en file |
| **Langues** | FR (défaut), WO pour les notifications aux occupants ; architecture i18n prête pour EN |
| **Accessibilité** | Contrastes AA, navigation clavier, libellés de formulaires |
| **Observabilité** | Journal applicatif structuré, alerte e-mail sur erreur 5xx, tableau de bord interne (taux de parsing, envois, paiements) |
| **Testabilité** | Couverture ≥ 80 % sur `lib/` (tarif, répartition, parsing) ; tests d'intégration API ; jeu de données de démonstration rechargeable |

---

## 6. Architecture technique

### 6.1 Stack
- **Front web** : React 19, TypeScript, Vite, Tailwind v4, zustand, react-router, recharts — PWA. Base existante : MVP v0.1 (`src/`), à migrer de la simulation locale vers l'API.
- **API** : Vercel Functions (Node 22 / TS), Drizzle ORM, validation zod.
- **Base** : Neon PostgreSQL (branche `main` prod, branche `dev`).
- **Auth** : OTP via SMS (Orange API ou agrégateur), JWT, RBAC en middleware.
- **Fichiers** : Vercel Blob (justificatifs, quittances, rapports).
- **Messagerie** : WhatsApp Business Cloud API, SMS, Resend (e-mail).
- **Paiement** : VersusPay (webhooks signés).
- **PDF** : génération serveur (react-pdf ou Playwright).
- **Mobile** (Lot 3) : Expo, EAS Build, module de lecture SMS Android.
- **CI/CD** : repo privé GitHub `mamadouelimanewane/kuran`, push → Vercel preview, `main` → prod. Tests obligatoires avant merge.

### 6.2 Modèle de données
Repris de CDC v1 § 4, avec ajouts :
```
pattern_sms        (id, operateur, version, regex, champs_map, actif, date_effet, taux_succes_7j)
notification       (id, organisation_id, destinataire, canal, modele, corps, statut, tentatives, envoye_le)
facture_abonnement (id, organisation_id, periode, montant, statut, pdf_url, reference_paiement)
ecart_calcul       (id, recharge_id, kwh_calcule, kwh_ticket, ecart_pct, grille_id)
```
Toutes les tables portent `organisation_id`, `cree_le`, `cree_par`, `modifie_le`, `modifie_par`, `archive_le`.

### 6.3 API (principales routes)
```
POST   /api/auth/otp/request        POST /api/auth/otp/verify        POST /api/auth/refresh
GET    /api/organisations/me        PATCH /api/organisations/me
CRUD   /api/sites  /api/lots  /api/compteurs  /api/occupants  /api/utilisateurs
POST   /api/parc/import             GET  /api/parc/import/:id/rapport
POST   /api/recharges               POST /api/recharges/sms          POST /api/recharges/parse
GET    /api/compteurs/:id/recharges GET  /api/compteurs/:id/mois/:aaaa-mm
PUT    /api/compteurs/:id/repartition   POST /api/compteurs/:id/repartition/simuler
POST   /api/releves
GET    /api/occupants/:id/compte    POST /api/occupants/:id/paiements   POST /api/occupants/:id/sortie
POST   /api/relances/envoyer        GET  /api/recouvrement
GET    /api/alertes  PATCH /api/alertes/:id       PUT /api/sites/:id/budget
GET    /api/rapports/mensuel/:aaaa-mm  GET /api/exports/:type
GET    /api/grille  (admin) POST /api/admin/grille  /api/admin/patterns-sms  /api/admin/organisations
POST   /api/webhooks/versuspay      POST /api/webhooks/whatsapp
```

### 6.4 Sécurité multi-organisation
Chaque requête porte le JWT → `organisation_id` injecté dans le contexte → toutes les requêtes Drizzle filtrent sur cet identifiant via un helper obligatoire. Un test d'intégration tente l'accès croisé sur chaque route et doit échouer.

---

## 7. Écrans

Les 20 écrans du CDC v1 § 5 restent la référence. Répartition par lot :

- **Lot 1** : 1 Connexion · 2 Tableau de bord · 3 Parc · 4 Fiche compteur · 5 Saisie recharge (formulaire + collage SMS) · 6 Grille (lecture) · 7 Utilisateurs · 8 Abonnement · 9 Fiche lot / occupant · 10 Répartition · 11 Recouvrement · 12 Entrée / sortie · Import Excel · Back-office super-admin (organisations, grille, patterns SMS)
- **Lot 2** : 13 Vue sites · 14 Fiche site · 15 Rapports · 16 Centre d'alertes
- **Lot 3** : 17–20 mobile agent · Portail occupant · Consolidation groupe

Maquettes : Figma basse fidélité validée avant chaque lot ; le MVP v0.1 sert de maquette fonctionnelle du Lot 1.

---

## 8. Modèle économique (implémenté dans EF-ABO)

| Plan | Cible | Prix | Inclus |
|---|---|---|---|
| **Gratuit** | ≤ 5 compteurs | 0 F | Parc, recharges, répartition, 1 utilisateur, sans relances auto |
| **Starter** | 6–20 compteurs | 10 000 F/mois | + quittances, relances auto, 3 utilisateurs |
| **Immo** | 21–500 compteurs | 600 F/compteur/mois **ou** forfait par palier (≤ 80 : 40 000 F · ≤ 200 : 90 000 F · ≤ 500 : 200 000 F) | + portail occupant, paiement en ligne, utilisateurs illimités |
| **Entreprise** | multi-sites | 3 000 F/site/mois (min. 10 sites) | + budgets, alertes, BI, rapports auto, export comptable |
| **Groupe / Cabinet** | multi-organisations | sur devis | Consolidation, marque blanche, SLA |

Revenus annexes : commission 1–1,5 % sur les quotes-parts encaissées via VersusPay ; mise en place / import / formation 100–300 k F (Entreprise) ; recharge groupée (Lot 3, si partenariat).

---

## 9. Critères d'acceptation (recette)

### Lot 1 — scénarios obligatoires
| Réf | Scénario | Résultat attendu |
|---|---|---|
| CA-01 | Import Excel de 3 immeubles, 40 lots, 12 compteurs dont 4 partagés, 38 occupants | 0 erreur bloquante, rapport d'import lisible, parc navigable en < 15 min |
| CA-02 | Collage de 10 SMS réels (Wave ×4, OM ×4, Free ×2) | ≥ 9 parsés sans correction, doublon détecté au second collage |
| CA-03 | Recharge de 30 000 F le 3 du mois sur un compteur partagé par 6 lots, règle parts égales | Redevance 1 155 F déduite, kWh calculés selon la grille, 6 quotes-parts dont la somme = 30 000 F, 6 WhatsApp envoyés en < 2 min |
| CA-04 | Paiement de 2 quotes-parts (1 espèces saisie, 1 lien VersusPay) | 2 quittances PDF numérotées, soldes à zéro, relances stoppées |
| CA-05 | Relance automatique J+3 sur les 4 impayés | 4 messages envoyés dans la plage horaire, statut délivré visible |
| CA-06 | Sortie d'un occupant avec solde dû | État de sortie PDF, lot vacant, quotes-parts suivantes imputées au propriétaire |
| CA-07 | Changement de grille au 1er du mois suivant | Recharges antérieures inchangées, nouvelles recharges au nouveau tarif |
| CA-08 | Tentative d'accès à un compteur d'une autre organisation via l'API | 404, journalisé |
| CA-09 | Fin d'essai 30 jours sans paiement | Passage en lecture seule à J+15, données intactes, réactivation immédiate au paiement |

### Lot 2
| Réf | Scénario | Résultat attendu |
|---|---|---|
| CA-10 | 80 sites, budgets saisis, 3 mois de recharges importées | Tableau de bord < 1,5 s, 3 sites en alerte budget, 1 site « sans recharge depuis 12 j », 1 site « anomalie +60 % » |
| CA-11 | Le 1er du mois à 6 h | Rapport PDF reçu par le DAF, chiffres égaux aux exports Excel |
| CA-12 | Export comptable | Fichier importable dans Cabinet 360, un mouvement 605 par site |

### Lot 3
| Réf | Scénario | Résultat attendu |
|---|---|---|
| CA-13 | Agent Android reçoit un SMS Wave hors réseau puis retrouve le réseau | Recharge créée à la synchronisation, sans doublon |
| CA-14 | Photo de 20 tickets Woyofal de boutiques différentes | ≥ 16 extraits correctement (montant + compteur + kWh) |
| CA-15 | Occupant ouvre le lien du portail, paie, télécharge sa quittance | Sans création de compte, en < 90 s |

---

## 10. Planning et livrables

| Semaine | Lot | Livrable | Jalon |
|---|---|---|---|
| S1 | 1 | Repo, CI, Neon, schéma, auth OTP, RBAC, back-office grille | Squelette déployé sur preview |
| S2 | 1 | Parc + import Excel + fiche compteur | Démo interne |
| S3 | 1 | Moteur tarifaire, recharges (saisie + parsing SMS), patterns admin | Tests moteur ≥ 80 % |
| S4 | 1 | Répartition, occupants, quotes-parts, quittances PDF | Démo gérant pilote 1 |
| S5 | 1 | Relances WhatsApp/SMS, recouvrement, abonnement, VersusPay | **Recette Lot 1 (CA-01 → CA-09)** |
| S6–S9 | Pilote | 2 gérants, corrections parsing et règles, mesure H1/H2/H3 | Rapport de pilote |
| S10 | 2 | Sites, budgets, centre d'alertes | |
| S11 | 2 | BI, rapport mensuel automatique, exports | |
| S12 | 2 | Export comptable, durcissement | **Recette Lot 2 (CA-10 → CA-12)** |
| S13–S16 | Pilote | 1 chaîne + 1 institution | Go / no-go Lot 3 |
| T+1 | 3 | Mobile Expo, OCR, portail occupant, consolidation | Recette Lot 3, lancement commercial |

**Livrables par lot** : code sur `main` tagué, environnement de prod, jeu de données de démo, guide utilisateur PDF (gérant, DAF, agent), procès-verbal de recette signé, déclaration CDP (Lot 1).

---

## 11. Charges estimées

| Poste | Lot 1 | Lot 2 | Lot 3 | Total |
|---|---|---|---|---|
| Développement full-stack | 22 j | 12 j | 30 j | 64 j |
| UI / maquettes | 3 j | 2 j | 5 j | 10 j |
| Tests et recette | 4 j | 2 j | 5 j | 11 j |
| Déploiement, CDP, documentation | 3 j | 1 j | 3 j | 7 j |
| **Total** | **32 j** | **17 j** | **43 j** | **92 j** |

Coûts récurrents (estimation) : Vercel Pro 20 $/mois, Neon 19 $/mois, WhatsApp Business ≈ 25 F/conversation, SMS ≈ 20 F/unité, Resend gratuit < 3 000 e-mails, EAS 0 $ au démarrage. Soit < 50 k F/mois d'infrastructure jusqu'à 500 organisations, hors messagerie refacturable.

---

## 12. Organisation et gouvernance

| Rôle | Titulaire | Responsabilité |
|---|---|---|
| Sponsor / MOA | Mamadou Dia | Priorités, validation des lots, relation pilotes |
| Chef de projet / MOE | atelier processingenierie | Planning, développement, qualité |
| Référents pilotes | 2 gérants (Lot 1), 1 DAF (Lot 2) | Données réelles, retours hebdomadaires |
| Conformité | processingenierie | Déclaration CDP, conditions générales, politique de confidentialité |

Rituels : point hebdomadaire de 30 min ; démonstration en fin de chaque semaine ; recette formelle en fin de lot avec PV.

Gestion des changements : toute demande hors périmètre est notée, chiffrée et arbitrée au lot suivant ; aucun ajout en cours de lot sauf blocage d'un critère d'acceptation.

---

## 13. Risques projet

| Risque | Probabilité | Impact | Parade |
|---|---|---|---|
| Formats SMS des opérateurs modifiés | Moyenne | Fort | Patterns en base, monitoring EF-RECH-12, corpus de 100 SMS réels collecté dès S1 |
| Approbation des modèles WhatsApp Business lente | Élevée | Moyen | Démarrer la demande Meta en S1 ; SMS en fallback dès le Lot 1 |
| Données pilotes incomplètes (le gérant n'a pas de liste propre) | Élevée | Moyen | Séance d'import accompagnée de 2 h incluse dans le pilote |
| Refus de la traçabilité par certains gérants | Moyenne | Fort | Sélectionner des pilotes ayant intérêt à la transparence (SCI, cité, promoteur) |
| Changement de grille CRSE pendant le développement | Faible | Faible | Grille versionnée dès S1 |
| Dérive de périmètre | Moyenne | Moyen | Règle « aucun ajout en cours de lot » |

---

## 14. Annexes

### A. Grille tarifaire de référence (1er janvier 2026, CRSE — à confirmer avant mise en production)
| Élément | Valeur |
|---|---|
| Tranche 1 | 0–150 kWh : 82 F/kWh |
| Tranche 2 | 151–250 kWh : 136,49 F/kWh |
| Tranche 3 | > 250 kWh : 159,36 F/kWh |
| Redevance mensuelle | 1 155 F (450 location compteur + 705 entretien réseau) |
| TVA | 18 % au-delà de 250 kWh cumulés dans le mois |
| Taxe communale | selon commune, paramétrable |

### B. Exemples de SMS à parser (corpus à constituer avec les pilotes)
- Wave : `Vous avez acheté du crédit Woyofal de 5000F pour le compteur 14xxxxxxxxx. Code: 1234 5678 9012 3456 7890. kWh: 41.2 ...`
- Orange Money : `Achat Woyofal reussi. Compteur: 14xxxxxxxxx Montant: 5000 FCFA Code: ... kWh: ...`
- Free Money : format à collecter.

Le champ `champs_map` du pattern indique, pour chaque groupe capturé : montant, compteur, code, kwh, date, reference.

### C. Modèle d'import Excel (onglets)
`Sites` (nom, type, adresse, surface) · `Lots` (site, reference, surface, etage) · `Compteurs` (site, numero, type_tarif, puissance, lots_rattaches, regle) · `Occupants` (lot, nom, telephone, date_entree, caution)

### D. Glossaire
**Woyofal** : compteur prépayé Senelec · **Redevance** : frais fixes mensuels prélevés à la première recharge · **Tranche** : palier de prix du kWh selon la consommation mensuelle cumulée · **Quote-part** : montant dû par un occupant sur une recharge partagée · **Lot** : unité louée (appartement, bureau, local) · **DPP / DMP** : domestique petite / moyenne puissance · **CRSE** : Commission de régulation du secteur de l'électricité · **CDP** : Commission de protection des données personnelles.

---

*Fin du document — KURAÑ CDC v2.0, 20 septembre 2026.*
