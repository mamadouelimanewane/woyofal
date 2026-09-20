# KURAÑ — Déclaration de traitement de données personnelles

*Projet de déclaration auprès de la Commission de protection des données personnelles (CDP) du Sénégal, loi n° 2008-12 du 25 janvier 2008. À finaliser sur le formulaire officiel de la CDP avant le démarrage des pilotes.*

---

## 1. Responsable du traitement

| | |
|---|---|
| Dénomination | processingenierie (entreprise individuelle) |
| NINEA | 007579347 |
| Représentant | Mamadou Dia, Directeur Général |
| Adresse | Dakar, Sénégal |
| Contact protection des données | à renseigner (adresse e-mail dédiée) |

Sous-traitants techniques : hébergement de l'application et de la base de données (Vercel Inc., Neon Inc. — serveurs situés hors du Sénégal, région Europe / États-Unis), envoi de messages (Meta — WhatsApp Business, opérateur SMS sénégalais, Resend pour l'e-mail), paiement (Wave Sénégal, Orange Money / Sonatel). Un transfert de données hors du Sénégal est donc à déclarer (article 49 de la loi).

## 2. Dénomination et finalité du traitement

**KURAÑ — gestion de parc de compteurs électriques prépayés (Woyofal)**

Finalités :
1. Enregistrer les recharges de compteurs prépayés effectuées par les organisations clientes (bailleurs, gérants, entreprises).
2. Répartir le coût d'un compteur partagé entre ses occupants et leur communiquer leur quote-part.
3. Suivre les paiements, émettre des quittances, envoyer des relances.
4. Produire des tableaux de bord, alertes et rapports pour les organisations clientes.
5. Gérer les comptes utilisateurs et l'abonnement des organisations clientes.

Base juridique : exécution d'un contrat (organisations clientes et leurs utilisateurs) et intérêt légitime du bailleur à répartir et recouvrer les charges d'électricité (occupants), avec information des personnes concernées.

## 3. Personnes concernées et données traitées

| Personnes | Données | Source |
|---|---|---|
| Utilisateurs des organisations (gérants, agents, DAF) | nom, téléphone, e-mail, rôle, journal des actions | l'organisation |
| Occupants (locataires, ménages, commerçants) | nom, téléphone, e-mail facultatif, lot occupé, dates d'entrée / sortie, caution, quotes-parts dues et payées, quittances | l'organisation cliente |
| Toutes | recharges (numéro de compteur, montant, date, kWh, code de recharge), messages envoyés, paiements en ligne (montant, référence de transaction — **aucune donnée bancaire ni de mobile money n'est stockée**) | SMS transmis par l'organisation, fournisseurs de paiement |

Aucune donnée sensible (santé, opinions, biométrie) n'est traitée.

## 4. Destinataires

- Les utilisateurs habilités de l'organisation cliente, pour leurs seuls sites (contrôle d'accès par rôle).
- Les occupants, pour leurs propres données (page de paiement et quittances accessibles par lien signé).
- Les sous-traitants listés au § 1, dans la limite nécessaire à leur prestation.
- Aucune cession ni communication à des tiers à des fins commerciales.

## 5. Durée de conservation

| Données | Durée |
|---|---|
| Recharges, quotes-parts, paiements, quittances | 5 ans après la fin de l'exercice (pièces justificatives) |
| Comptes utilisateurs | durée du contrat + 12 mois |
| Occupants sortis | 24 mois après la sortie (accès aux quittances), puis anonymisation |
| Journal d'audit | 5 ans |
| Codes de connexion (OTP) | 5 minutes |
| Messages envoyés | 12 mois |

Aucune donnée n'est supprimée physiquement pendant la durée légale ; les suppressions demandées sont traitées par anonymisation.

## 6. Mesures de sécurité

- Chiffrement des communications (HTTPS) et des données au repos (hébergeur).
- Authentification par code SMS à usage unique ou mot de passe haché ; sessions révocables.
- Cloisonnement strict par organisation, contrôle d'accès par rôle et par site, testé automatiquement.
- Journal d'audit de toute écriture (qui, quoi, quand, avant / après).
- Liens envoyés aux occupants signés cryptographiquement, sans mot de passe à retenir.
- Sauvegardes quotidiennes, restauration testée.
- Aucune donnée de carte bancaire ou de compte mobile money conservée : le paiement est réalisé sur les pages de Wave et d'Orange Money.

## 7. Droits des personnes

Les personnes concernées peuvent exercer leurs droits d'accès, de rectification, d'opposition et de suppression :
- les occupants auprès de leur bailleur / gérant (organisation cliente), qui dispose des fonctions nécessaires dans KURAÑ (modification, arrêt des notifications, anonymisation) ;
- ou directement auprès de processingenierie au contact indiqué au § 1.

Chaque message envoyé à un occupant mentionne l'organisation émettrice ; l'occupant peut demander l'arrêt des notifications (consentement enregistré sur sa fiche).

## 8. Information des personnes

- Les utilisateurs sont informés à la création de leur compte (conditions d'utilisation et politique de confidentialité en ligne).
- Les occupants sont informés par le premier message reçu (nom de l'organisation, objet, lien vers la politique de confidentialité) et par leur bailleur.

---

*Document préparé le 20 septembre 2026 — à compléter (contact dédié, adresse) et à déposer sur la plateforme de la CDP avant la mise en production avec des données réelles.*
