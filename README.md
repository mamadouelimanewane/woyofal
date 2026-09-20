# KURAÑ — Gestion de parc de compteurs Woyofal

SaaS de pilotage de compteurs prépayés Senelec pour bailleurs (édition **Immo**) et entreprises multi-sites (édition **Entreprise**).
Cahiers des charges : [CDC-KURAN-v1.md](CDC-KURAN-v1.md) (vision produit) · [CDC-KURAN-v2-developpement.md](CDC-KURAN-v2-developpement.md) (développement, lots, recette).

## Lancer en local

```bash
npm install
npm run db:seed    # jeu de démonstration (PGlite dans .pglite/, aucune installation)
npm run dev:api    # API Hono → http://localhost:3001/api/sante
npm run dev        # front Vite → http://localhost:5180 (proxy /api → 3001)
npm test           # 12 tests moteur tarifaire + 30 tests d'intégration API (PGlite mémoire)
npm run typecheck  # front + serveur
```

Connexion démo : **77 123 45 67** (Gérance Keur Gorgui, Immo) ou **78 111 22 33** (Pharmacies Ndiaye & Fils, Entreprise). Sans fournisseur SMS configuré, le code OTP s'affiche à l'écran.

## Architecture (Lot 1 — v0.2)

```
api/index.ts            handler Vercel (hono/vercel)
server/app.ts           application Hono, montage des routeurs
server/dev.ts           serveur local (@hono/node-server, port 3001)
server/db/schema.ts     schéma Drizzle (21 tables, organisation_id partout)
server/db/index.ts      pilote : Neon (DATABASE_URL) ou PGlite (local / test)
server/db/seed.ts       démonstration via l'API
server/lib/auth.ts      OTP, mot de passe, JWT + refresh, RBAC, cloisonnement
server/lib/tarif-service.ts  grille en base, cumul de période, répartition, parsing SMS
server/lib/notifications.ts  file WhatsApp → SMS, plage horaire
server/routes/          auth · parc · recharges · occupants · grille · admin · snapshot
server/tests/api.test.ts     critères d'acceptation CA-01 → CA-08
src/lib/tarif.ts        moteur tarifaire pur (partagé client / serveur)
src/lib/repartition.ts  règles de répartition (partagé)
src/lib/sms.ts          parsing générique des SMS (repli des patterns en base)
src/api/client.ts       client HTTP, jetons, rafraîchissement
src/store/useStore.ts   instantané de l'organisation (/api/snapshot) + actions API
drizzle/                migrations SQL générées (drizzle-kit)
```

## Variables d'environnement

Voir [.env.example](.env.example). Sans `DATABASE_URL`, l'API utilise PGlite (fichier `.pglite/`). En production : Neon + `JWT_SECRET` + fournisseur SMS + WhatsApp Business + `CRON_SECRET`.

```bash
DATABASE_URL=postgres://… npm run db:migrate   # applique ./drizzle sur Neon
DATABASE_URL=postgres://… npm run db:seed      # (optionnel) démo sur Neon
```

## Endpoints principaux

| Route | Rôle |
|---|---|
| `POST /api/auth/otp/request` · `/verify` · `/inscription` · `/login` · `/refresh` | authentification |
| `GET /api/snapshot` | tout l'état de l'organisation pour le client |
| `CRUD /api/sites` · `/lots` · `/compteurs` · `/occupants` · `/utilisateurs` | parc |
| `PUT /api/compteurs/:id/rattachements` · `/repartition` | compteurs partagés |
| `POST /api/parc/import` | import JSON (Excel converti côté client), rapport ligne par ligne |
| `POST /api/recharges` · `/recharges/simuler` · `/recharges/parse` · `/recharges/:id/annuler` | recharges |
| `POST /api/recharges/sms` (en-tête `X-Api-Key`) | ingestion automatique des SMS |
| `GET /api/compteurs/:id/mois/:aaaa-mm` | cumul, tranche, conseil |
| `POST /api/occupants/:id/paiements` · `GET /api/quittances/:numero` · `POST /api/occupants/:id/sortie` | recouvrement |
| `GET /api/recouvrement` · `POST /api/relances/envoyer` | relances |
| `GET /api/grille` · `POST /api/grille/simuler` | public |
| `/api/admin/*` | super-admin : organisations, grille, patterns SMS, stats de parsing |
| `GET /api/rapports` · `/rapports/mensuel/:aaaa-mm` · `/pdf` · `GET /api/exports/comptable/:aaaa-mm` | rapports et export comptable |
| `GET /api/alertes` · `POST /api/alertes/detecter` · `PATCH /api/alertes/:id` | alertes persistées |
| `GET /api/abonnement` · `POST /api/abonnement/payer` | abonnement Wave / OM |
| `GET /api/public/occupants/:id?t=` · `POST …/payer` · `GET /api/public/paiements/:id` | paiement occupant (liens signés) |
| `POST /api/webhooks/wave` · `/orange` | webhooks fournisseurs |
| `POST /api/admin/cron/quotidien` | cron Vercel (8 h) : relances J+3/7/15, détection d'alertes, rapport mensuel le 1er, file de notifications, fin d'essai |

## État

| Lot 1 (CDC v2) | État |
|---|---|
| Auth OTP / e-mail, JWT + refresh, RBAC, journal d'audit | ✅ |
| Parc, import, compteurs partagés, règles de répartition | ✅ |
| Recharges (saisie, collage SMS, ingestion SMS par clé, doublons, kWh ticket) | ✅ |
| Grille versionnée, cumul de période, simulation | ✅ |
| Quotes-parts, paiements, quittances numérotées, sortie d'occupant | ✅ |
| Relances (file WhatsApp → SMS), cron quotidien | ✅ (envoi réel dès que les clés sont configurées) |
| Abonnement : plans, essai 30 j, lecture seule, paiement en ligne | ✅ |
| Quittance PDF (URL signée), import Excel, SMS en attente | ✅ |
| Paiement en ligne Wave / Orange Money (quotes-parts + abonnement), webhooks | ✅ en **mode simulation** tant que les clés API ne sont pas configurées |
| Déploiement Neon + Vercel | ✅ https://woyofal.vercel.app |

| Lot 2 (Entreprise) | État |
|---|---|
| Rapport mensuel (JSON + PDF), tendance 12 mois, coût/m², signaux | ✅ |
| Export comptable OHADA (6052 / 4452 / 5711), par site ou par recharge | ✅ |
| Alertes serveur persistées (budget, inactivité, anomalie, redevance) + e-mail aux gestionnaires | ✅ (cron quotidien) |
| Rapport automatique le 1er du mois par e-mail (Resend) | ✅ file d'envoi — clé `RESEND_API_KEY` à configurer |
| Vue sites carte, comparaison entre sites comparables, consolidation groupe | ⏳ |
