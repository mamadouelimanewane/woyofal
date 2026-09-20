/**
 * Génère docs/dist/KURAN-Comment-ca-marche.docx — « Comment fonctionne KURAÑ, pas à pas ».
 * Usage : NODE_PATH=$(npm root -g) node docs/build-docx.cjs   (le paquet npm `docx` est installé globalement)
 */
const fs = require("fs");
const path = require("path");
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, PageBreak, PageNumber, Packer, Paragraph,
  ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType,
} = require("docx");

const TEAL = "0F766E";
const GRIS = "64748B";
const FONT = "Calibri";

// ---------- helpers ----------
const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts.para, children: runs(text, opts) });
function runs(text, opts = {}) {
  // **gras** et `code` en ligne
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((s) => {
    if (s.startsWith("**")) return new TextRun({ text: s.slice(2, -2), bold: true, font: FONT, size: opts.size ?? 22, color: opts.color });
    if (s.startsWith("*")) return new TextRun({ text: s.slice(1, -1), italics: true, font: FONT, size: opts.size ?? 22, color: opts.color });
    if (s.startsWith("`")) return new TextRun({ text: s.slice(1, -1), font: "Consolas", size: (opts.size ?? 22) - 2, color: TEAL });
    return new TextRun({ text: s, font: FONT, size: opts.size ?? 22, color: opts.color, italics: opts.italics, bold: opts.bold });
  });
}
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [new TextRun({ text: t, font: FONT })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: t, font: FONT })] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: t, font: FONT })] });
const note = (t) => new Paragraph({ spacing: { after: 140 }, indent: { left: 400 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: TEAL, space: 8 } }, children: runs(t, { italics: true, color: "334155", size: 20 }) });
let listeId = 0;
const etapes = (items) => { listeId++; return items.map((t) => new Paragraph({ numbering: { reference: `etapes${listeId}`, level: 0 }, spacing: { after: 80 }, children: runs(t) })); };
const puces = (items) => items.map((t) => new Paragraph({ numbering: { reference: "puces", level: 0 }, spacing: { after: 60 }, children: runs(t) }));
const saut = () => new Paragraph({ children: [new PageBreak()] });

function tableau(entetes, lignes, largeurs) {
  const total = 9360; // 6,5 pouces
  const w = largeurs ?? entetes.map(() => Math.floor(total / entetes.length));
  const cell = (t, i, entete) => new TableCell({
    width: { size: w[i], type: WidthType.DXA },
    shading: entete ? { type: ShadingType.CLEAR, fill: "E6F4F2", color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ spacing: { after: 0 }, children: runs(t, { size: 20, bold: entete }) })],
  });
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: w,
    rows: [new TableRow({ tableHeader: true, children: entetes.map((t, i) => cell(t, i, true)) }), ...lignes.map((l) => new TableRow({ children: l.map((t, i) => cell(t, i, false)) }))],
  });
}
const espace = () => new Paragraph({ spacing: { after: 120 }, children: [] });

// ---------- contenu ----------
const numbering = { config: [{ reference: "puces", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] }] };
for (let i = 1; i <= 40; i++) numbering.config.push({ reference: `etapes${i}`, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 360 } } } }] });

const couverture = [
  new Paragraph({ spacing: { before: 3200, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "KURAÑ", font: FONT, size: 96, bold: true, color: TEAL })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "Gestion de parc de compteurs Woyofal", font: FONT, size: 32, color: "334155" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 }, children: [new TextRun({ text: "Comment fonctionne l'application, pas à pas", font: FONT, size: 40, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "Guide de fonctionnement — version pilote", font: FONT, size: 24, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "Septembre 2026", font: FONT, size: 24, color: GRIS })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1600 }, children: [new TextRun({ text: "processingenierie · Dakar · https://woyofal.vercel.app", font: FONT, size: 22, color: GRIS })] }),
  saut(),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Sommaire", font: FONT })] }),
  new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-2" }),
  saut(),
];

const corps = [
  h1("1. KURAÑ en une page"),
  p("KURAÑ (« électricité » en wolof) est un service en ligne qui organise l'électricité prépayée **Woyofal** d'un parc de compteurs. Il ne vend pas de crédit et ne touche pas aux compteurs : vous continuez à recharger comme aujourd'hui (Wave, Orange Money, boutique). KURAÑ **enregistre** chaque recharge, **répartit** le coût des compteurs partagés entre les occupants, **recouvre** les quotes-parts (relances, quittances, paiement en ligne) et **rapporte** (budgets, alertes, rapport mensuel, export comptable)."),
  p("Deux éditions sur un même moteur :"),
  tableau(["", "Édition Immo", "Édition Entreprise"], [
    ["Pour qui", "Bailleurs, gérants, syndics, SCI, cités, cours communes", "Entreprises et institutions multi-sites : pharmacies, écoles, agences, ONG, mairies"],
    ["Objet géré", "Immeuble → lot (appartement, chambre, boutique) → occupant → compteur", "Site → responsable → compteur(s)"],
    ["Fonction clé", "Répartition des compteurs partagés, quittances, relances, paiement des occupants", "Budget par site, alertes de dérive, rapport mensuel, export comptable, comparaison entre sites"],
    ["Qui l'utilise", "Le gérant et son gardien / agent", "Le DAF, le gestionnaire, les responsables de site"],
  ], [1800, 3780, 3780]),
  espace(),
  p("Trois interfaces :"),
  puces([
    "**Application de gestion** (navigateur, ordinateur ou téléphone) : https://woyofal.vercel.app — gérants, DAF, agents.",
    "**Application agent** (mobile) : https://kuran-agent.vercel.app (version web de test) puis Android / iOS — enregistrer les recharges sur le terrain, même hors ligne.",
    "**Portail occupant** : page reçue par lien WhatsApp / SMS — l'occupant voit ce qu'il doit, paie, télécharge ses quittances, déclare, signale.",
  ]),
  p("Et une **console d'administration** réservée à processingenierie (organisations, tarifs, formats de SMS, envois)."),

  h1("2. Accès de démonstration"),
  p("Mot de passe unique pour tous les comptes de démonstration : **Dakarsenegal**. Chaque compte peut aussi se connecter par téléphone : tant qu'aucun opérateur SMS n'est branché, le code à 6 chiffres s'affiche directement à l'écran."),
  tableau(["Rôle", "E-mail", "Téléphone", "Ce que l'on voit"], [
    ["Super-admin (console)", "mamadouastelwane@gmail.com", "— (mot de passe uniquement)", "Toutes les organisations, plans, tarifs, SMS, envois"],
    ["Administratrice Immo — Gérance Keur Gorgui", "immo@demo.kuran.sn", "77 123 45 67", "Un immeuble de 6 appartements + parties communes, une cour commune de 5 ménages sur un seul compteur"],
    ["Agent de site Immo — Modou Fall", "agent@demo.kuran.sn", "76 987 65 43", "L'application agent : compteurs, recharge, relevés"],
    ["Administrateur Entreprise — Pharmacies Ndiaye & Fils", "entreprise@demo.kuran.sn", "78 111 22 33", "8 pharmacies, budgets, alertes, rapports, carte"],
    ["DAF Entreprise (lecture seule) — Fatou Diop", "daf@demo.kuran.sn", "77 444 55 66", "Tableaux de bord et rapports uniquement"],
  ], [2400, 2300, 1700, 2960]),
  espace(),
  note("Pendant la démonstration, le paiement Wave / Orange Money est simulé (une page « Confirmer le paiement » remplace l'opérateur) et les messages WhatsApp / SMS / e-mail sont mis en file d'attente. Tout le reste est réel."),

  h1("3. Se connecter et organiser son équipe"),
  h2("3.1 Connexion"),
  etapes([
    "Ouvrez https://woyofal.vercel.app.",
    "Onglet **Téléphone** : saisissez votre numéro, « Recevoir un code », puis le code à 6 chiffres reçu par SMS (affiché à l'écran en démonstration). Ou onglet **E-mail** : adresse + mot de passe.",
    "Vous restez connecté 30 jours sur cet appareil. « Se déconnecter » en bas du menu.",
  ]),
  h2("3.2 Créer une organisation (première utilisation)"),
  etapes([
    "Onglet **Créer un compte** sur la page de connexion.",
    "Nom de l'organisation, édition **Immo** ou **Entreprise**, votre nom, votre téléphone → « Recevoir un code » → code → « Créer mon organisation ».",
    "Vous êtes administrateur. L'essai gratuit dure 30 jours avec toutes les fonctions ; ensuite le plan Gratuit reste disponible jusqu'à 5 compteurs.",
  ]),
  h2("3.3 Inviter ses collègues"),
  p("Menu **Paramètres** → carte *Utilisateurs* → **Inviter** : nom, téléphone, rôle. La personne se connecte ensuite avec son téléphone."),
  tableau(["Rôle", "Peut…"], [
    ["Administrateur", "Tout : parc, recharges, occupants, rapports, utilisateurs, abonnement"],
    ["Gestionnaire", "Parc, recharges, occupants, relances, rapports, alertes (sans l'abonnement ni les utilisateurs)"],
    ["Agent de site", "Enregistrer des recharges et des relevés sur ses sites (application agent)"],
    ["Lecture seule", "Consulter les tableaux de bord et exporter (DAF, auditeur, expert-comptable)"],
  ], [2400, 6960]),

  h1("4. Mettre en place son parc"),
  h2("4.1 Le vocabulaire"),
  tableau(["Terme", "Définition"], [
    ["Site", "Un immeuble, une cour commune, une pharmacie, une agence"],
    ["Lot", "Un appartement, une chambre, une boutique, un bureau (édition Immo)"],
    ["Compteur", "Un compteur Woyofal, identifié par son numéro à 11 chiffres (sur la plaque et sur chaque ticket)"],
    ["Compteur partagé", "Un compteur rattaché à plusieurs lots : KURAÑ répartit chaque recharge entre les occupants"],
    ["Occupant", "La personne qui doit payer sa part : locataire, ménage, commerçant"],
    ["Quote-part", "La part d'une recharge due par un occupant"],
  ], [2400, 6960]),
  h2("4.2 Saisie à la main"),
  etapes([
    "Menu **Parc** → bouton **Immeuble** (ou **Site**) : nom, type, adresse, surface, budget mensuel (facultatif) → Créer.",
    "Sélectionnez le site dans la liste de gauche. Bouton **Lot** pour chaque appartement / chambre (référence, surface, étage).",
    "Bouton **Compteur** : numéro à 11 chiffres, libellé, tarif (DPP domestique, DMP moyenne puissance, PRO), puissance, et **cochez les lots desservis**. Plusieurs lots cochés = compteur partagé.",
    "Ouvrez le compteur pour choisir la **règle de répartition** (voir 4.4).",
  ]),
  h2("4.3 Import depuis Excel (recommandé au-delà de 10 compteurs)"),
  etapes([
    "Menu **Parc** → **Importer Excel** → **Télécharger le modèle Excel** (4 onglets : Sites, Lots, Compteurs, Occupants, avec des exemples).",
    "Remplissez le classeur. Dans l'onglet Compteurs, la colonne *lots* contient les références de lots séparées par « ; » (plusieurs = compteur partagé) et la colonne *regle* la règle de répartition (egal, surface, sous_compteur, forfait).",
    "**Choisir mon fichier** : KURAÑ analyse et affiche le rapport (sites, lots, compteurs, occupants trouvés) et **les erreurs ligne par ligne** (site inconnu, numéro invalide, compteur déjà présent).",
    "Corrigez le fichier s'il y a des erreurs, recommencez. Quand le rapport est sans erreur, cliquez **Importer**. Les sites et lots déjà présents sont reconnus par leur nom, jamais dupliqués.",
  ]),
  h2("4.4 Règles de répartition d'un compteur partagé"),
  tableau(["Règle", "Fonctionnement", "Quand l'utiliser"], [
    ["Parts égales", "Le montant est divisé par le nombre de lots rattachés", "Chambres ou lots équivalents"],
    ["Prorata surface", "Chaque lot paie proportionnellement à ses m²", "Appartements de tailles différentes"],
    ["Prorata sous-compteurs", "Chaque lot paie proportionnellement à sa consommation lue sur son petit compteur divisionnaire (index saisis chaque mois)", "Cours et maisons équipées de sous-compteurs"],
    ["Forfait + solde", "Certains lots paient un montant fixe, le reste est partagé à parts égales", "Boutique au forfait, ménages au reste"],
  ], [2000, 4400, 2960]),
  espace(),
  p("Un lot **vacant** : sa part est imputée au propriétaire. Un **changement de règle** ne s'applique qu'aux recharges suivantes. Les arrondis sont poussés sur la dernière part pour que la somme soit exacte."),
  h2("4.5 Géolocaliser un site"),
  p("Sur la fiche du site, bouton **Géolocaliser** : la position GPS du téléphone est enregistrée. Les sites positionnés apparaissent sur la **carte** en haut de la page Parc, colorés selon leur budget (vert, orange, rouge)."),

  h1("5. Enregistrer une recharge"),
  p("Trois façons, de la plus automatique à la plus manuelle. Dans tous les cas KURAÑ calcule les kWh, la redevance, la TVA et la tranche atteinte à partir de la **grille tarifaire officielle** en vigueur à la date de la recharge."),
  h2("5.1 Coller le SMS de confirmation (30 secondes)"),
  etapes([
    "Après une recharge Wave ou Orange Money, copiez le SMS de confirmation reçu.",
    "Dans KURAÑ : bouton **+ Recharge** (tableau de bord, page Recharges ou fiche compteur) → **Coller le SMS Wave / Orange Money** → collez → **Analyser**.",
    "Le montant, le numéro de compteur, le code à 20 chiffres, la référence et les kWh sont reconnus et remplis. Le compteur est sélectionné automatiquement s'il existe dans votre parc.",
    "Vérifiez l'aperçu à droite : kWh crédités, redevance (déduite à la première recharge du mois), tranche atteinte, et — pour un compteur partagé — **la répartition entre les occupants** avec la base de calcul.",
    "**Enregistrer la recharge**. Les occupants concernés reçoivent aussitôt un message avec leur part et un lien de paiement.",
  ]),
  h2("5.2 Capture automatique des SMS (téléphone Android qui recharge)"),
  etapes([
    "Menu **Paramètres** → carte *Capture automatique des SMS* : copiez votre **clé d'organisation**.",
    "Sur le téléphone qui reçoit les SMS Wave / Orange Money, installez une application de transfert de SMS (par exemple « SMS Forwarder ») et configurez un envoi de chaque SMS Wave / Orange Money vers l'adresse indiquée, avec l'en-tête X-Api-Key = votre clé.",
    "Chaque recharge apparaît seule dans KURAÑ. Si le numéro de compteur n'est pas reconnu, le SMS attend en haut de la page **Recharges** (« SMS en attente de rattachement ») : **Rattacher** à un compteur existant, créer le compteur à la volée, ou **Ignorer**.",
  ]),
  h2("5.3 Saisie manuelle"),
  p("**+ Recharge** → compteur, montant, date et heure, canal, référence, code. Si le ticket indique un nombre de kWh différent du calcul (plus de 3 % d'écart), saisissez-le : **c'est la valeur du ticket qui compte** et l'écart est journalisé."),
  h2("5.4 Ce que KURAÑ calcule (grille CRSE 2026)"),
  tableau(["Élément", "Valeur", "Remarque"], [
    ["Tranche 1", "82 F/kWh jusqu'à 150 kWh dans le mois", "Les tranches sont cumulatives par compteur et par mois"],
    ["Tranche 2", "136,49 F/kWh de 151 à 250 kWh", ""],
    ["Tranche 3", "159,36 F/kWh au-delà de 250 kWh", "Un compteur partagé par plusieurs ménages y arrive vite"],
    ["Redevance", "1 155 F par mois", "Prélevée sur la première recharge du mois"],
    ["TVA", "18 % au-delà de 250 kWh cumulés", ""],
    ["Taxe communale", "selon la commune", "Paramétrable"],
  ], [1800, 3600, 3960]),
  espace(),
  p("La fiche compteur affiche le cumul du mois et **« il reste X kWh en tranche 1 »** : recharger avant la fin du mois plutôt qu'au début du suivant peut coûter moins cher."),
  h2("5.5 Corriger ou annuler"),
  p("Fiche compteur → historique → icône corbeille → motif. La recharge est annulée (tracée), ses quotes-parts non payées sont annulées ; **une quote-part déjà payée n'est jamais modifiée** (la quittance reste valable)."),

  h1("6. Occupants, quotes-parts et recouvrement (Immo)"),
  h2("6.1 Les occupants"),
  etapes([
    "Menu **Occupants** → **Nouvel occupant** : nom, téléphone, lot, date d'entrée, caution électricité.",
    "Un occupant reçoit les messages KURAÑ (quote-part, relance, quittance) par WhatsApp ou SMS ; il peut les désactiver depuis son portail.",
  ]),
  h2("6.2 Ce qui se passe à chaque recharge d'un compteur partagé"),
  etapes([
    "KURAÑ crée une **quote-part** par occupant en place ce jour-là, selon la règle du compteur.",
    "Chaque occupant reçoit un message : « recharge de 30 000 F sur le compteur X. Votre quote-part : 5 000 F. Payer : lien ».",
    "Les quotes-parts apparaissent « dues » dans **Recouvrement**, avec leur ancienneté.",
  ]),
  h2("6.3 Encaisser et délivrer la quittance"),
  etapes([
    "Menu **Recouvrement** : filtre Dues / Payées / Toutes ; totaux : total dû, en retard de plus de 7 jours, encaissé ce mois.",
    "L'occupant paie **en ligne** (Wave ou Orange Money depuis son lien) : la quote-part passe automatiquement « payée » et la quittance lui est envoyée.",
    "Ou il paie **en main propre** : icône ✓ → moyen (espèces, Wave, Orange Money, virement) → KURAÑ émet la **quittance numérotée** (Q-2026-000123) en PDF, envoyée à l'occupant et téléchargeable (icône document).",
    "Icône WhatsApp : relance manuelle immédiate. Icône ✕ : annuler une quote-part (contestation).",
  ]),
  h2("6.4 Relances automatiques"),
  p("Chaque jour, KURAÑ relance les quotes-parts dues à **J+3, J+7 et J+15** (réglable dans Paramètres), jamais entre 21 h et 8 h, une seule fois par palier, avec le lien de paiement. Les relances s'arrêtent dès que le solde est nul."),
  h2("6.5 Sortie d'un occupant"),
  etapes([
    "Menu **Occupants** → icône sortie → date de sortie.",
    "KURAÑ calcule le solde dû, le compare à la caution et affiche « à restituer » ou « reste à payer » ; l'état de sortie est généré.",
    "Le lot devient vacant : les quotes-parts suivantes sont imputées au propriétaire jusqu'au prochain occupant.",
  ]),

  h1("7. Le portail occupant"),
  p("Chaque occupant dispose d'une page personnelle, sans compte ni mot de passe, accessible par le lien signé qu'il reçoit dans chaque message (il peut le conserver). Quatre onglets :"),
  tableau(["Onglet", "Contenu"], [
    ["À payer", "Ses quotes-parts dues avec le détail de chaque recharge (montant total, kWh) ; boutons **Payer avec Wave** / **Orange Money** ; après paiement, quittance immédiate"],
    ["Historique", "Ses paiements avec téléchargement des quittances PDF ; ses quotes-parts réglées ou annulées avec date et moyen"],
    ["Mon compteur", "Transparence : toutes les recharges du compteur partagé et « ma part » sur chacune, la règle de répartition ; activer / désactiver les notifications ; **signaler un problème** (compteur coupé, part contestée…) → alerte chez le gestionnaire"],
    ["Déclarer", "L'occupant qui a rechargé lui-même le compteur partagé le déclare (SMS collé ou saisie). Le gestionnaire valide ; sa part est comptée réglée (« recharge directe ») et le surplus à lui rembourser est calculé"],
  ], [1800, 7560]),

  h1("8. Alertes"),
  p("KURAÑ surveille le parc chaque jour et prévient les gestionnaires par e-mail. Menu **Alertes** : à traiter / traitées, bouton ✓ pour marquer traitée avec un commentaire."),
  tableau(["Alerte", "Déclenchement", "Ce qu'il faut vérifier"], [
    ["Budget 80 % / dépassé", "La dépense du mois d'un site atteint 80 % ou 100 % de son budget", "Consommation réelle ou dérive ?"],
    ["Inactivité", "Aucune recharge depuis plus longtemps que la cadence habituelle du compteur (minimum 12 jours, ou le seuil fixé sur le site)", "Compteur coupé ? site fermé ? recharges non déclarées ?"],
    ["Anomalie", "Une recharge supérieure à 1,6 × la moyenne, ou une dépense du mois projetée à +50 %", "Fuite, appareil défaillant, détournement"],
    ["Redevance", "Aucune recharge ce mois : la redevance sera prélevée sur la prochaine", "Prévoir une petite recharge avant la fin du mois"],
    ["Signalement", "Un occupant a signalé un problème depuis son portail", "Le contacter"],
  ], [1900, 4200, 3260]),

  h1("9. Rapports, comparaison et comptabilité"),
  h2("9.1 Le rapport mensuel"),
  etapes([
    "Menu **Rapports** → choisissez le mois.",
    "En haut : dépense, énergie, coût moyen du kWh, variation par rapport au mois précédent, redevances et TVA.",
    "**Points d'attention** : budgets dépassés, sites à +50 %, sites sans recharge, sites plus chers au m² que leurs semblables.",
    "**Dépense par site** : compteurs, recharges, dépense, budget et écart, variation, coût au m², coût au kWh.",
    "**Comparaison entre sites comparables** : chaque site est situé par rapport à la moyenne des sites du même type (au m² quand les surfaces sont renseignées).",
    "**Tendance 12 mois** et bouton **PDF** (document à transmettre à la direction).",
  ]),
  p("Le rapport du mois écoulé est **envoyé automatiquement le 1er du mois** par e-mail aux administrateurs, gestionnaires et lecteurs qui ont une adresse."),
  h2("9.2 L'export comptable (OHADA)"),
  p("Bouton **Export comptable** : fichier CSV avec, pour chaque site et chaque mois, les écritures **6052** Électricité (HT), **4452** TVA déductible et **5711** contrepartie, section analytique = site. Il s'importe dans Cabinet 360 ou tout logiciel comptable. Ajoutez `?detail=1` à l'adresse pour une écriture par recharge."),
  h2("9.3 Le plan Groupe"),
  p("Un même numéro de téléphone rattaché à plusieurs organisations (cabinet, groupe) obtient un **sélecteur d'organisation** dans le menu et une page **Groupe** : consolidation mensuelle de toutes ses organisations (dépense, kWh, parc, quotes-parts dues, alertes) et bascule en un clic."),

  h1("10. L'application agent (mobile)"),
  p("Pour le gardien, l'agent de site ou le gestionnaire qui recharge sur le terrain. Version de test dans le navigateur : https://kuran-agent.vercel.app (même code que les futurs builds Android / iOS)."),
  h2("10.1 Connexion"),
  p("Téléphone + code SMS, ou e-mail + mot de passe (onglets). Compte de démonstration : agent@demo.kuran.sn / Dakarsenegal."),
  h2("10.2 Les écrans"),
  tableau(["Onglet", "Fonction"], [
    ["Compteurs", "Tous les compteurs de l'agent avec le cumul du mois, la tranche atteinte (T1 / T2 / T3), les kWh restants en T1 et la dernière recharge (en rouge au-delà de 12 jours). Toucher un compteur ouvre la recharge."],
    ["Recharge", "Le SMS copié est **détecté automatiquement à l'ouverture** et proposé en une touche. Sinon : Coller / Analyser, choix du compteur, montant, kWh du ticket, code. Enregistrer."],
    ["Relevés (Immo)", "Saisir l'index des sous-compteurs par lot (règle « prorata sous-compteurs »). L'index doit être supérieur au précédent."],
    ["Profil", "Organisation, **file à synchroniser** (recharges saisies hors ligne, avec le motif si le serveur refuse), Synchroniser maintenant, adresse du serveur, déconnexion."],
  ], [1800, 7560]),
  h2("10.3 Hors ligne"),
  p("Les compteurs et les recharges du mois sont conservés sur le téléphone. Une recharge saisie sans réseau est mise en file et **envoyée automatiquement** au retour de l'application au premier plan. Un doublon déjà connu du serveur est considéré comme envoyé ; une erreur (montant, compteur) reste visible dans Profil avec son motif."),

  h1("11. Abonnement et paiement en ligne"),
  h2("11.1 Les plans"),
  tableau(["Plan", "Pour", "Prix"], [
    ["Gratuit", "jusqu'à 5 compteurs", "0 F"],
    ["Starter", "6 à 20 compteurs", "10 000 F / mois"],
    ["Immo", "21 à 500 compteurs", "600 F / compteur / mois, ou forfait par palier (40 000 F jusqu'à 80, 90 000 F jusqu'à 200, 200 000 F jusqu'à 500) — le moins cher s'applique"],
    ["Entreprise", "multi-sites", "3 000 F / site / mois (minimum 10 sites)"],
    ["Groupe / Cabinet", "plusieurs organisations", "sur devis"],
  ], [1800, 2600, 4960]),
  h2("11.2 Payer son abonnement"),
  etapes([
    "Menu **Paramètres** → carte *Abonnement* : KURAÑ calcule le plan qui correspond à votre parc et le montant.",
    "Choisissez **Mensuel** ou **Annuel (−15 %)**, puis **Payer avec Wave** ou **Orange Money**.",
    "Vous êtes redirigé vers l'opérateur (page simulée en démonstration). Au retour : facture numérotée (F-2026-000001), organisation active, échéance repoussée d'un mois ou d'un an.",
  ]),
  p("À la fin de l'essai sans paiement, le compte passe en lecture seule après 15 jours ; **aucune donnée n'est supprimée**."),

  h1("12. La console d'administration (processingenierie)"),
  p("Réservée au super-admin : https://woyofal.vercel.app → onglet **E-mail** (la connexion par code SMS est refusée tant que le code s'affiche à l'écran)."),
  tableau(["Onglet", "Fonction"], [
    ["Organisations", "Liste de toutes les organisations : type, plan et statut modifiables, sites / compteurs / utilisateurs, tarif mensuel, échéance ; MRR actif et potentiel ; création d'une organisation avec son administrateur"],
    ["Grille tarifaire", "Grilles versionnées par date d'effet (tranches, seuils, redevance, TVA, taxe communale) ; ajouter une nouvelle grille lors d'un changement Senelec — le passé n'est jamais recalculé"],
    ["Patterns SMS", "Formats de SMS par opérateur (expressions régulières versionnées, activables), testeur de SMS, taux de rattachement automatique sur 7 jours avec alerte sous 90 %"],
    ["File d'envoi", "Les 200 derniers messages (WhatsApp, SMS, e-mail) avec leur statut ; traitement manuel de la file"],
  ], [1800, 7560]),

  h1("13. Ce qui se passe tout seul, chaque jour"),
  puces([
    "**8 h** : relances J+3 / J+7 / J+15 des quotes-parts dues, avec lien de paiement.",
    "Détection des **alertes** (budget, inactivité, anomalie, redevance) et e-mail aux gestionnaires pour chaque nouvelle alerte.",
    "Envoi des messages en file (WhatsApp → repli SMS ; e-mail), dans la plage horaire autorisée.",
    "**Le 1er du mois** : rapport du mois écoulé envoyé par e-mail.",
    "Fin d'essai + 15 jours sans paiement : passage en lecture seule.",
  ]),

  h1("14. Sécurité et données"),
  puces([
    "Connexion par code SMS à usage unique (5 minutes, 3 essais, 5 demandes par heure) ou mot de passe ; sessions révocables.",
    "Chaque organisation est **strictement isolée** ; un gestionnaire ou un agent ne voit que ses sites.",
    "**Journal d'audit** de toute action (qui, quoi, quand, avant / après).",
    "Liens envoyés aux occupants signés cryptographiquement ; quittances PDF vérifiables par leur numéro.",
    "Aucune donnée bancaire ni de mobile money conservée : le paiement se fait chez Wave et Orange Money.",
    "Hébergement chiffré, sauvegardes quotidiennes ; déclaration de traitement préparée pour la CDP.",
  ]),

  h1("15. Questions fréquentes"),
  tableau(["Question", "Réponse"], [
    ["Le numéro de compteur du SMS n'est pas reconnu", "Vérifiez qu'il a 11 chiffres et qu'il existe dans le parc ; sinon créez le compteur puis rattachez le SMS depuis la page Recharges"],
    ["J'ai enregistré une recharge sur le mauvais compteur", "Fiche compteur → historique → annuler avec un motif ; les quotes-parts non payées sont annulées, les payées conservées"],
    ["Un occupant conteste sa part", "Ouvrez la recharge : la règle et la base de calcul sont affichées ; le justificatif (SMS ou ticket) est joint. Il peut aussi signaler depuis son portail"],
    ["Mes locataires n'ont pas WhatsApp", "Les messages partent aussi par SMS ; le gérant peut encaisser en espèces et remettre la quittance imprimée"],
    ["Les tarifs Senelec changent", "La nouvelle grille est appliquée à sa date d'effet ; les recharges passées ne sont jamais recalculées"],
    ["Et si Senelec ouvre une API un jour ?", "KURAÑ s'y branchera : le parc, les occupants et l'historique sont déjà en place"],
  ], [3200, 6160]),
  espace(),
  p("Support pilote : processingenierie — Dakar — https://woyofal.vercel.app", { color: GRIS }),
];

const doc = new Document({
  creator: "processingenierie",
  title: "KURAÑ — Comment fonctionne l'application, pas à pas",
  description: "Guide de fonctionnement de KURAÑ, gestion de parc de compteurs Woyofal",
  numbering,
  features: { updateFields: !process.env.SANS_MAJ_CHAMPS },
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, color: TEAL, font: FONT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, color: "0F172A", font: FONT }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, color: "334155", font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1300, bottom: 1200, left: 1300, right: 1300 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 4 } }, children: [new TextRun({ text: "KURAÑ — Comment fonctionne l'application", font: FONT, size: 18, color: GRIS })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "processingenierie · Dakar · page ", font: FONT, size: 18, color: GRIS }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: GRIS })] })] }) },
    children: [...couverture, ...corps.flat()],
  }],
});

const cible = path.join(__dirname, "dist", process.env.SANS_MAJ_CHAMPS ? "verif.docx" : "KURAN-Comment-ca-marche.docx");
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(cible, buf); console.log("DOCX ->", cible); });
