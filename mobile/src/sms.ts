// Copie de src/lib/sms.ts (le serveur applique en plus ses patterns versionnés). Garder les deux fichiers synchronisés.
/**
 * Parsing des SMS de confirmation de recharge Woyofal (Wave, Orange Money, Free Money,
 * ticket Senelec). Les formats réels varient et changent : chaque opérateur a un
 * pattern versionné ici, avec un fallback générique (montant + compteur 11 chiffres).
 * En prod, cette table vit côté serveur pour être mise à jour sans redéploiement.
 */
export interface SmsParse {
  operateur: "wave" | "orange" | "free" | "senelec" | "inconnu";
  montant?: number;
  compteur?: string;
  kwh?: number;
  codes: string[]; // tokens 20 chiffres
  reference?: string;
  date?: string;
  brut: string;
}

const RX_COMPTEUR = /\b(\d{11})\b/;
const RX_CODE = /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g;
const RX_MONTANT = /(\d[\d\s.,]{2,})\s*(?:F\s?CFA|FCFA|XOF|F\b)/i;
// « 52.1 kWh » ou « kWh: 52.1 » (Orange Money)
const RX_KWH = /(\d+(?:[.,]\d+)?)\s*kwh|kwh\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i;
const RX_REF = /(?:r[ée]f(?:[ée]rence)?|ID|Trans(?:action)?)[\s.:#]*([A-Z0-9-]{6,})/i;

function nombre(s: string): number {
  return Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
}

export function parserSms(texte: string): SmsParse {
  const t = texte.replace(/ /g, " ");
  const lower = t.toLowerCase();
  const operateur: SmsParse["operateur"] = lower.includes("wave")
    ? "wave"
    : lower.includes("orange") || lower.includes("om ")
      ? "orange"
      : lower.includes("free")
        ? "free"
        : lower.includes("senelec") || lower.includes("woyofal")
          ? "senelec"
          : "inconnu";

  const codes = Array.from(t.matchAll(RX_CODE)).map((m) => m[1].replace(/[\s-]/g, ""));
  // Le numéro de compteur ne doit pas être un fragment de token.
  const sansCodes = t.replace(RX_CODE, " ");
  const compteur = sansCodes.match(RX_COMPTEUR)?.[1];
  const montantM = sansCodes.match(RX_MONTANT);
  const kwhM = sansCodes.match(RX_KWH);
  const refM = sansCodes.match(RX_REF);

  return {
    operateur,
    montant: montantM ? nombre(montantM[1]) : undefined,
    compteur,
    kwh: kwhM ? nombre(kwhM[1] ?? kwhM[2]) : undefined,
    codes,
    reference: refM?.[1],
    brut: texte,
  };
}

export const EXEMPLE_SMS =
  "Wave: Vous avez acheté du crédit Woyofal de 10 000 FCFA pour le compteur 14210034567. Code: 1234 5678 9012 3456 7890. 98.5 kWh. Ref: WV8H2K9Q";
