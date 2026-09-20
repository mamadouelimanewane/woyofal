# KURAÑ — Script de démonstration

Durée : 20 minutes · Support : https://woyofal.vercel.app sur un téléphone **et** un ordinateur
Comptes de démonstration : **77 123 45 67** (Gérance Keur Gorgui — Immo) · **78 111 22 33** (Pharmacies Ndiaye & Fils — Entreprise). Le code SMS s'affiche à l'écran.

---

## Avant le rendez-vous (5 min)

- [ ] Vérifier que https://woyofal.vercel.app/api/sante répond `ok`.
- [ ] Se connecter sur les deux comptes sur le téléphone pour éviter l'OTP pendant la démo.
- [ ] Préparer un SMS Wave réel du prospect (ou l'exemple ci-dessous) dans le presse-papiers.
- [ ] Demander au prospect **combien de compteurs** il gère et **comment il répartit aujourd'hui** (cahier, WhatsApp, Excel). C'est le fil rouge.

Exemple de SMS : `Wave: Vous avez acheté du crédit Woyofal de 10 000 FCFA pour le compteur 14210034567. Code: 1234 5678 9012 3456 7890. 98.5 kWh. Ref: WV8H2K9Q`

---

## Démo A — Gérant / bailleur (Immo), 12 minutes

**1. Le problème (1 min)** — « Un compteur, cinq ménages, une recharge de 20 000 F : qui doit combien ? Et le mois prochain, qui a payé ? » Laisser le prospect raconter sa méthode actuelle.

**2. Le parc (2 min)** — Ouvrir *Parc* : l'immeuble Sérigne Fallou (6 appartements + parties communes) et la cour commune Médina (5 ménages sur un seul compteur). Montrer la carte. Ouvrir le compteur de la cour : règle « prorata sous-compteurs », historique, position dans les tranches (« il reste X kWh en tranche 1 »).

**3. La recharge en 30 secondes (3 min)** — *+ Recharge* → *Coller le SMS* → coller → *Analyser* : montant, compteur, code reconnus. Montrer l'aperçu : kWh, redevance, tranche, **et la répartition entre les 5 ménages** avec la base de calcul. *Enregistrer*. Dire : « chaque ménage vient de recevoir un WhatsApp avec sa part et un lien pour payer ».

**4. L'occupant paie (2 min)** — Sur le téléphone, ouvrir le lien de paiement d'un occupant (Recouvrement → icône WhatsApp montre le message ; ou Notifications). Page publique : ce qu'il doit, boutons Wave / Orange Money. Payer (simulation) → quittance PDF immédiate. Revenir sur *Recouvrement* : la quote-part est passée « payée ».

> Si le prospect demande : « le paiement réel Wave / Orange Money est branché dès réception de nos accès API ; en attendant, l'écran de paiement est simulé, tout le reste est réel ».

**5. Le recouvrement (2 min)** — *Recouvrement* : total dû, en retard > 7 jours, encaissé ce mois. Relance en un clic, relances automatiques J+3/7/15, marquer payée en espèces → quittance. *Occupants* → Sortie : solde, caution, état de sortie.

**6. Import de son parc (1 min)** — *Parc* → *Importer Excel* → montrer le modèle. « Vous nous donnez votre liste, on la charge ensemble en 15 minutes ».

**7. Clôture (1 min)** — Proposer le **pilote** (voir fiche) : 3 mois offerts, on charge le parc ensemble, un point par semaine.

---

## Démo B — DAF / chaîne de sites (Entreprise), 10 minutes

**1. Le problème (1 min)** — « 8 pharmacies, chacune recharge de son côté : combien coûte l'électricité par site ? Laquelle dérive ? Qui a rechargé quoi ? »

**2. Tableau de bord (2 min)** — Se connecter avec 78 111 22 33. Dépense du mois, kWh, top sites, alertes (Pikine en dérive, Mbour sans recharge).

**3. Alertes (2 min)** — *Alertes* : budget dépassé, inactivité, anomalie. Expliquer que les gestionnaires reçoivent un e-mail chaque matin s'il y a du nouveau. Marquer une alerte traitée avec un commentaire.

**4. Rapport mensuel (3 min)** — *Rapports* → mois précédent : tableau par site (dépense, budget, écart, coût au m²), **comparaison entre pharmacies** (qui est à +40 % de la moyenne au m²), points d'attention, tendance 12 mois. Télécharger le **PDF** (« c'est ce que vous recevez le 1er du mois par e-mail »). Télécharger l'**export comptable** et l'ouvrir : écritures 6052 / 4452 / 5711 par site, prêtes pour le comptable.

**5. Terrain (1 min)** — *Parc* : carte des sites ; un agent sur place enregistre une recharge en collant le SMS ou par capture automatique (Paramètres → clé d'organisation).

**6. Clôture (1 min)** — Pilote 3 mois : on importe les sites et les 3 derniers mois de tickets, budget par site, rapport le 1er du mois.

---

## Objections courantes

| Objection | Réponse |
|---|---|
| « Mes locataires n'ont pas WhatsApp / de smartphone » | Les relances partent aussi par SMS ; le gérant peut marquer un paiement en espèces et imprimer la quittance. |
| « Senelec va faire pareil » | Senelec vend de l'électricité ; KURAÑ organise la vie du parc entre plusieurs occupants ou sites. Le jour où Senelec ouvre une API, KURAÑ s'y branche. |
| « Et si le format du SMS change ? » | Les modèles de SMS sont mis à jour côté serveur sans rien réinstaller ; la saisie manuelle reste toujours possible. |
| « C'est cher » | 600 F par compteur et par mois, moins qu'un demi-jour de travail d'un agent pour 300 lots. Gratuit jusqu'à 5 compteurs, essai 30 jours. |
| « Mes données ? » | Hébergement chiffré, isolement par organisation, journal des actions, déclaration CDP. Vos données vous appartiennent et sont exportables. |

---

## Après la démo

- Envoyer le lien, les identifiants de test et la fiche pilote le jour même.
- Récupérer : la liste du parc (Excel ou photo du cahier), 10 SMS de recharge réels (pour vérifier le parsing), le nom du responsable pilote.
- Planifier la séance d'import (1 h, sur place ou en visio).
