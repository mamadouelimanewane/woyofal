# KURAÑ — Guide utilisateur

**Gestion de parc de compteurs Woyofal** · version pilote · septembre 2026
Éditeur : processingenierie (Dakar) · Application : https://woyofal.vercel.app

---

## 1. À qui s'adresse ce guide

| Vous êtes… | Lisez… |
|---|---|
| Gérant, bailleur, syndic, responsable d'une cour ou d'un immeuble | chapitres 2, 3, 4, 5, 6 |
| DAF, gestionnaire d'une entreprise multi-sites (pharmacies, écoles, agences) | chapitres 2, 3, 4, 7, 8 |
| Agent de site, gardien, personne qui recharge les compteurs | chapitres 2 et 4 |

KURAÑ ne vend pas de crédit Woyofal : vous continuez à recharger comme d'habitude (Wave, Orange Money, boutique). KURAÑ **enregistre, répartit, relance et rapporte**.

---

## 2. Se connecter

1. Ouvrez https://woyofal.vercel.app sur votre téléphone ou votre ordinateur.
2. Saisissez votre **numéro de téléphone** (celui communiqué à votre administrateur) puis « Recevoir un code ».
3. Tapez le **code à 6 chiffres** reçu par SMS. Vous êtes connecté pour 30 jours sur cet appareil.

> Pendant la phase pilote, si le SMS n'arrive pas, le code s'affiche directement à l'écran.

**Créer une organisation** (première utilisation) : onglet « Créer un compte » → nom de l'organisation, édition **Immo** (immeubles, cours, SCI) ou **Entreprise** (sites multiples), votre nom, votre téléphone. L'essai gratuit dure 30 jours avec toutes les fonctions ; ensuite le plan Gratuit reste disponible jusqu'à 5 compteurs.

**Inviter vos collègues** : Paramètres → Utilisateurs → Inviter. Rôles :

| Rôle | Peut… |
|---|---|
| Administrateur | tout, y compris l'abonnement et les utilisateurs |
| Gestionnaire | gérer le parc, les recharges, les occupants, les relances, les rapports |
| Agent de site | enregistrer des recharges et des relevés sur ses sites |
| Lecture seule | consulter les tableaux de bord et exporter (DAF, auditeur) |

---

## 3. Mettre en place son parc

### 3.1 Vocabulaire

- **Site** : un immeuble, une cour commune, une pharmacie, une agence.
- **Lot** : un appartement, une chambre, une boutique, un bureau (édition Immo).
- **Compteur** : un compteur Woyofal, identifié par son **numéro à 11 chiffres** (sur la plaque du compteur et sur chaque ticket de recharge).
- **Compteur partagé** : un compteur rattaché à plusieurs lots (une cour, des parties communes). KURAÑ répartit chaque recharge entre les occupants.
- **Occupant** : la personne qui doit payer sa part (locataire, ménage, commerçant).

### 3.2 Saisir le parc à la main

Parc → « Immeuble » (ou « Site ») → nom, type, adresse, surface, budget mensuel (facultatif).
Puis dans le site : « Lot » pour chaque appartement / chambre, « Compteur » pour chaque compteur en cochant les lots qu'il dessert.

### 3.3 Importer depuis Excel (recommandé au-delà de 10 compteurs)

Parc → « Importer Excel » → « Télécharger le modèle ». Le classeur a 4 onglets :

| Onglet | Colonnes |
|---|---|
| Sites | nom, type, adresse, surfaceM2, budgetMensuel |
| Lots | site, reference, surfaceM2, etage |
| Compteurs | site, numero (11 chiffres), typeTarif (DPP / DMP / PRO), libelle, lots (références séparées par « ; »), regle |
| Occupants | site, lot, nom, telephone, dateEntree (AAAA-MM-JJ), caution |

Remplissez, enregistrez, puis « Choisir mon fichier ». KURAÑ **analyse d'abord** et affiche les erreurs ligne par ligne (site inconnu, numéro invalide, compteur déjà présent). Corrigez le fichier, recommencez : rien n'est importé tant qu'il reste une erreur.

### 3.4 Règles de répartition d'un compteur partagé

Ouvrez le compteur → « Règle de répartition » :

| Règle | Quand l'utiliser |
|---|---|
| Parts égales | chambres ou lots équivalents |
| Prorata surface (m²) | appartements de tailles différentes |
| Prorata sous-compteurs | chaque lot a un petit compteur divisionnaire : saisissez les index chaque mois |
| Forfait + solde | certains lots paient un montant fixe, le reste est partagé |

Un changement de règle ne s'applique qu'aux recharges suivantes.

---

## 4. Enregistrer une recharge

Trois façons, de la plus automatique à la plus manuelle.

### 4.1 Coller le SMS (30 secondes)

Après une recharge Wave ou Orange Money, vous recevez un SMS de confirmation. Dans KURAÑ : « + Recharge » → « Coller le SMS » → collez → « Analyser ». Le montant, le numéro de compteur, le code et les kWh sont reconnus. Vérifiez, « Enregistrer ».

### 4.2 Capture automatique (téléphone Android qui recharge)

Paramètres → « Capture automatique des SMS » affiche votre **clé d'organisation**. Installez une application de transfert de SMS (par exemple « SMS Forwarder ») et configurez-la pour envoyer chaque SMS Wave / Orange Money vers l'adresse indiquée avec cette clé. Les recharges apparaissent seules dans KURAÑ ; celles dont le compteur n'est pas reconnu attendent en haut de la page Recharges (« Rattacher » ou « Ignorer »).

### 4.3 Saisie manuelle

« + Recharge » → compteur, montant, date. KURAÑ calcule les kWh, la redevance (prélevée à la première recharge du mois), la TVA et la tranche atteinte. Si le ticket indique un nombre de kWh différent, saisissez-le : c'est la valeur du ticket qui compte.

**À savoir sur le tarif Woyofal (2026)** : 82 F/kWh jusqu'à 150 kWh dans le mois, 136,49 F jusqu'à 250 kWh, 159,36 F au-delà ; redevance de 1 155 F par mois ; TVA 18 % au-delà de 250 kWh. Sur un compteur partagé par plusieurs ménages, on atteint vite la tranche 3 : KURAÑ vous indique combien de kWh restent en tranche 1.

---

## 5. Occupants, quotes-parts et recouvrement (Immo)

1. **Occupants** : créez chaque occupant avec son lot, son téléphone, sa date d'entrée et sa caution.
2. À chaque recharge d'un compteur partagé, KURAÑ crée une **quote-part** par occupant et lui envoie un message (WhatsApp ou SMS) avec le montant et un **lien de paiement**.
3. **Recouvrement** : la liste des quotes-parts dues, avec l'ancienneté. Boutons : relancer, marquer payée (espèces, Wave, Orange Money, virement), annuler.
4. Chaque paiement génère une **quittance numérotée** (Q-2026-000123) en PDF, envoyée à l'occupant. Elle reste consultable et téléchargeable.
5. **Relances automatiques** à J+3, J+7 et J+15 (réglables dans Paramètres), jamais entre 21 h et 8 h.
6. **Paiement en ligne** : l'occupant ouvre le lien reçu, voit ce qu'il doit, paie par Wave ou Orange Money ; la quittance est immédiate et le solde mis à jour.
7. **Sortie d'un occupant** : Occupants → Sortie → date. KURAÑ calcule le solde, compare à la caution et produit l'état de sortie.

---

## 6. Alertes

KURAÑ surveille chaque jour :

| Alerte | Signification |
|---|---|
| Budget 80 % / dépassé | la dépense du mois approche ou dépasse le budget du site |
| Inactivité | aucune recharge depuis plus longtemps que d'habitude (compteur coupé ? site fermé ? recharges non déclarées ?) |
| Anomalie | une recharge très supérieure à la moyenne, ou une dépense du mois qui s'envole (fuite, appareil défaillant, détournement) |
| Redevance | aucune recharge ce mois : la redevance sera prélevée sur la prochaine |

Les gestionnaires reçoivent un e-mail à chaque nouvelle alerte. Marquez-la « traitée » avec un commentaire une fois vérifiée.

---

## 7. Rapports et comptabilité (Entreprise)

**Rapports** → choisissez le mois :

- dépense, énergie, coût moyen du kWh, variation par rapport au mois précédent ;
- tableau par site : compteurs, recharges, dépense, budget et écart, coût au m², coût au kWh ;
- **comparaison entre sites comparables** : chaque site est situé par rapport à la moyenne des sites du même type ;
- points d'attention et tendance sur 12 mois ;
- bouton **PDF** (rapport à transmettre à la direction) ;
- bouton **Export comptable** : fichier CSV avec les écritures OHADA (6052 Électricité HT, 4452 TVA déductible, 5711 contrepartie), une par site, section analytique = site. Importable dans Cabinet 360 ou tout logiciel comptable.

Le rapport du mois écoulé est **envoyé automatiquement le 1er** aux responsables qui ont une adresse e-mail.

**Carte** : Parc → la carte affiche les sites géolocalisés, colorés selon leur budget. Sur place, un agent clique « Géolocaliser » pour enregistrer la position du site.

---

## 8. Abonnement

Paramètres → Abonnement : KURAÑ calcule le plan qui correspond à votre parc.

| Plan | Pour | Prix |
|---|---|---|
| Gratuit | jusqu'à 5 compteurs | 0 F |
| Starter | 6 à 20 compteurs | 10 000 F / mois |
| Immo | 21 à 500 compteurs | 600 F / compteur / mois, ou forfait (40 000 F jusqu'à 80, 90 000 F jusqu'à 200, 200 000 F jusqu'à 500) — le moins cher s'applique |
| Entreprise | multi-sites | 3 000 F / site / mois (minimum 10 sites) |
| Groupe / Cabinet | plusieurs organisations | sur devis |

Paiement mensuel ou annuel (−15 %) par Wave ou Orange Money. À la fin de l'essai sans paiement, le compte passe en lecture seule au bout de 15 jours ; **aucune donnée n'est supprimée**.

---

## 9. Questions fréquentes

**Le numéro de compteur n'est pas reconnu dans le SMS.** Vérifiez qu'il a 11 chiffres et qu'il existe dans votre parc ; sinon créez le compteur puis rattachez le SMS depuis la page Recharges.

**J'ai enregistré une recharge sur le mauvais compteur.** Ouvrez le compteur → historique → Annuler avec un motif. Les quotes-parts non payées sont annulées ; celles déjà payées sont conservées (une quittance ne change jamais).

**Un occupant conteste sa part.** Ouvrez la recharge : la règle et la base de calcul (parts, m², index) sont affichées. Le justificatif (SMS ou photo du ticket) est joint.

**Les tarifs Senelec changent.** La nouvelle grille est appliquée par KURAÑ à sa date d'effet ; les recharges passées ne sont jamais recalculées.

**Mes données sont-elles protégées ?** Hébergement chiffré, accès par code SMS, chaque organisation est isolée, journal de toutes les actions. Voir la déclaration de traitement (document CDP).

---

Support pilote : processingenierie · Dakar · contact fourni lors de la mise en place.
