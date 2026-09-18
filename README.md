# KURAÑ — Gestion de parc de compteurs Woyofal

SaaS de pilotage de compteurs prépayés Senelec pour bailleurs (édition **Immo**) et entreprises multi-sites (édition **Entreprise**). Cahier des charges : [CDC-KURAN-v1.md](CDC-KURAN-v1.md).

## Lancer

```bash
npm install
npm run dev        # http://localhost:5180
npm test           # moteur tarifaire, répartition, parsing SMS
npm run build
```

## État — MVP v0.1 (18 sept. 2026)

Simulation locale : les données vivent dans `localStorage` (zustand/persist, clé `kuran-v1`). Deux organisations de démonstration avec 6 mois de recharges générées au premier lancement.

| Module | État |
|---|---|
| Connexion (choix d'utilisateur, 2 organisations) | ✅ démo |
| Tableau de bord (KPI, 6 mois, alertes, top sites, dernières recharges) | ✅ |
| Parc : sites → lots → compteurs, création, rattachement N:N | ✅ |
| Fiche compteur : cumul période, tranche, conseil T1, historique, règle de répartition | ✅ |
| Recharge : saisie, **parsing SMS Wave/OM**, aperçu tarif, aperçu répartition | ✅ |
| Moteur tarifaire versionné (CRSE 2026, redevance, TVA > 250 kWh, taxe communale) | ✅ testé |
| Répartition : parts égales, m², sous-compteurs, forfait + solde | ✅ testé |
| Occupants : entrée / sortie avec solde et caution | ✅ |
| Recouvrement : quotes-parts dues, relance WhatsApp, marquer payée, quittance imprimable | ✅ |
| Alertes : budget 80/100 %, inactivité adaptative, anomalie (projection pro rata) | ✅ |
| Grille tarifaire + simulateur | ✅ |
| Export CSV des recharges | ✅ |
| OCR ticket, capture SMS automatique (Expo), API Neon, OTP, WhatsApp Business API, recharge groupée | ⏳ V1/V2 |

## Structure

```
src/lib/tarif.ts        moteur tarifaire (montant ⇄ kWh, tranches, redevance, TVA)
src/lib/repartition.ts  règles de répartition des compteurs partagés
src/lib/sms.ts          parsing des SMS de recharge (patterns par opérateur)
src/store/useStore.ts   état + actions + sélecteurs (à remplacer par services/ API)
src/data/demo.ts        jeu de démonstration
src/pages/              Dashboard, Parc, CompteurDetail, Recharges, Occupants, Recouvrement, Alertes, Grille, Parametres
```

## Passage en production (prévu)

1. Neon PostgreSQL + Vercel Functions : le modèle de données du CDC §4 reprend les types de `src/types`.
2. `useStore` → couche `services/` (fetch) ; les sélecteurs restent identiques.
3. Auth OTP SMS, RBAC par organisation.
4. App Expo « agent » : lecture SMS Android + caméra.
5. Taux de taxe communale à confirmer sur la grille CRSE avant facturation réelle.
