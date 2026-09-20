# KURAÑ Agent — application mobile (Expo)

Application de terrain pour les agents de site, gardiens et gestionnaires : enregistrer une recharge en collant le SMS Wave / Orange Money (détection automatique du presse-papiers), consulter ses compteurs et leur cumul du mois, saisir les relevés de sous-compteurs, tout cela **hors ligne** avec synchronisation automatique.

## Lancer (Expo Go)

```bash
cd mobile
npm install
npx expo start
```

Scannez le QR code avec **Expo Go** (Android / iOS). L'application pointe par défaut sur https://woyofal.vercel.app ; pour l'API locale, Profil → Serveur → `http://<IP du PC>:3001` (l'API `npm run dev:api` doit être lancée à la racine du dépôt).

Connexion : numéro de téléphone + code SMS (compte créé par l'administrateur de l'organisation). Comptes de démonstration : 77 123 45 67 (Immo), 76 987 65 43 (agent Immo), 78 111 22 33 (Entreprise).

## Écrans

| Onglet | Contenu |
|---|---|
| Compteurs | liste filtrable, cumul du mois, tranche atteinte, kWh restants en T1, dernière recharge ; touche = nouvelle recharge |
| Recharge | collage / détection du SMS, choix du compteur, montant, kWh du ticket, code ; hors ligne → file |
| Relevés (Immo) | index des sous-compteurs par lot |
| Profil | organisation, file à synchroniser (avec les refus du serveur), URL du serveur, déconnexion |

## Hors ligne

Le dernier instantané (`/api/snapshot`) est conservé (AsyncStorage). Une recharge ou un relevé saisi sans réseau est mis en file et envoyé au retour de l'application au premier plan ou depuis Profil → Synchroniser. Un doublon détecté par le serveur (409) est considéré comme déjà envoyé ; une erreur métier (montant, compteur) reste visible dans la file avec son motif.

## Capture automatique des SMS (Android)

Expo Go ne peut pas lire les SMS. La capture sans intervention nécessite un **development build** (EAS) avec un module natif `RECEIVE_SMS` : prévu au Lot 3 après validation du pilote. En attendant, deux options fonctionnent déjà :

1. **Presse-papiers** : copier le SMS → ouvrir KURAÑ → la recharge est proposée automatiquement.
2. **Application de transfert de SMS** (ex. SMS Forwarder) vers `POST /api/recharges/sms` avec la clé d'organisation (Paramètres du web).

## Build

```bash
npx expo export --platform android   # vérifie que le bundle se construit
eas build -p android --profile preview  # APK de test (compte EAS requis)
```

`src/sms.ts` est une copie de `../src/lib/sms.ts` : garder les deux synchronisés.
