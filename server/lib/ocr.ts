/**
 * OCR des tickets Woyofal et des index de sous-compteurs (Lot 3, EF-RECH-11).
 * Deux moteurs :
 *   - Claude (vision) si ANTHROPIC_API_KEY est défini : lecture fiable des tickets même froissés / mal cadrés ;
 *   - Tesseract (tesseract.js, sans clé) en repli : extraction des nombres par expressions régulières.
 * Dans les deux cas le résultat est proposé à l'agent, jamais enregistré sans validation.
 */
import { tmpdir } from "node:os";
import { parserSms } from "../../src/lib/sms.js";

export type ModeOcr = "ticket" | "index";

export interface ResultatOcr {
  moteur: "claude" | "tesseract";
  texte: string;
  montant?: number;
  compteur?: string;
  kwh?: number;
  code?: string;
  date?: string;
  index?: number;
  confiance: number; // 0..1
}

const MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function analyserImage(base64: string, mediaType: string, mode: ModeOcr): Promise<ResultatOcr> {
  if (!MEDIA.has(mediaType)) throw new Error("Format d'image non pris en charge (JPEG, PNG, WebP)");
  if (base64.length > 8_000_000) throw new Error("Image trop volumineuse (6 Mo max)");
  if (process.env.ANTHROPIC_API_KEY) return viaClaude(base64, mediaType, mode);
  // Tesseract peut bloquer si l'environnement ne charge pas ses fichiers : on borne l'attente.
  return Promise.race([
    viaTesseract(base64, mode),
    new Promise<ResultatOcr>((_, rej) => setTimeout(() => rej(new Error("OCR serveur indisponible (délai dépassé) — réessayez ou saisissez les valeurs")), Number(process.env.OCR_TIMEOUT_MS ?? 40_000))),
  ]);
}

// ---------- Claude (vision) ----------
async function viaClaude(base64: string, mediaType: string, mode: ModeOcr): Promise<ResultatOcr> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const consigne = mode === "ticket"
    ? `Ceci est la photo d'un ticket ou reçu de recharge d'électricité prépayée Woyofal (Senelec, Sénégal), ou d'un écran de confirmation Wave / Orange Money.
Extrais les champs suivants et réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"montant": <montant payé en FCFA, entier>, "compteur": "<numéro de compteur, exactement 11 chiffres>", "kwh": <kWh crédités, nombre décimal>, "code": "<code de recharge, 20 chiffres sans espaces>", "date": "<AAAA-MM-JJ>", "confiance": <0 à 1>, "texte": "<texte lisible du ticket, résumé>"}
Mets null pour tout champ absent ou illisible. Ne devine pas un chiffre illisible.`
    : `Ceci est la photo de l'afficheur d'un compteur électrique (index en kWh). Lis l'index affiché et réponds UNIQUEMENT par un objet JSON : {"index": <nombre, décimales si affichées>, "confiance": <0 à 1>, "texte": "<ce que tu lis>"}. Mets null si illisible.`;
  const reponse = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } }, { type: "text", text: consigne }] }],
  });
  const texte = reponse.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  const json = texte.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Lecture impossible");
  const j = JSON.parse(json);
  const compteur = typeof j.compteur === "string" ? j.compteur.replace(/\D/g, "") : undefined;
  return {
    moteur: "claude", texte: String(j.texte ?? ""),
    montant: j.montant != null ? Math.round(Number(j.montant)) : undefined,
    compteur: compteur && /^\d{11}$/.test(compteur) ? compteur : undefined,
    kwh: j.kwh != null ? Number(j.kwh) : undefined,
    code: typeof j.code === "string" && /^\d{20}$/.test(j.code.replace(/\D/g, "")) ? j.code.replace(/\D/g, "") : undefined,
    date: typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : undefined,
    index: j.index != null ? Number(j.index) : undefined,
    confiance: Math.max(0, Math.min(1, Number(j.confiance ?? 0.5))),
  };
}

// ---------- Tesseract (repli sans clé) ----------
let tesseractWorker: Promise<any> | null = null;
async function worker() {
  if (!tesseractWorker) {
    tesseractWorker = (async () => {
      const { createWorker } = await import("tesseract.js");
      // Sur Vercel, le script du worker et le cœur wasm sont résolus depuis node_modules ; les données de langue vont dans /tmp.
      const w = await createWorker("fra+eng", 1, { cachePath: tmpdir(), errorHandler: () => undefined });
      return w;
    })();
  }
  return tesseractWorker;
}

async function viaTesseract(base64: string, mode: ModeOcr): Promise<ResultatOcr> {
  const w = await worker();
  if (mode === "index") await w.setParameters({ tessedit_char_whitelist: "0123456789.," });
  else await w.setParameters({ tessedit_char_whitelist: "" });
  const { data } = await w.recognize(Buffer.from(base64, "base64"));
  const texte: string = data.text ?? "";
  const confiance = Math.max(0, Math.min(1, (data.confidence ?? 0) / 100));
  if (mode === "index") {
    const nombres = (texte.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", "."))).filter((x) => Number.isFinite(x));
    // L'index est en général le plus grand nombre lisible (les petits sont des unités ou des codes)
    const index = nombres.length ? Math.max(...nombres) : undefined;
    return { moteur: "tesseract", texte, index, confiance };
  }
  const p = parserSms(texte.replace(/\s+/g, " "));
  const montant = p.montant ?? extraireMontant(texte);
  const dateM = texte.match(/(\d{2})[\/.-](\d{2})[\/.-](20\d{2})/);
  return {
    moteur: "tesseract", texte, montant: montant ? Math.round(montant) : undefined, compteur: p.compteur, kwh: p.kwh, code: p.codes[0],
    date: dateM ? `${dateM[3]}-${dateM[2]}-${dateM[1]}` : undefined, confiance,
  };
}

/** Sur un ticket, le montant est souvent sur une ligne « Montant / Total / Prix » ; sinon le plus grand nombre plausible. */
function extraireMontant(texte: string): number | undefined {
  const ligne = texte.split(/\n/).find((l) => /montant|total|prix|amount/i.test(l));
  const dansLigne = ligne?.match(/(\d[\d\s.,]{2,})/)?.[1];
  const nombre = (s: string) => Number(s.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (dansLigne && nombre(dansLigne) >= 100) return nombre(dansLigne);
  const candidats = (texte.match(/\d[\d\s.]{2,}\d/g) ?? []).map(nombre).filter((n) => n >= 500 && n <= 5_000_000 && !/^\d{11}$/.test(String(n)));
  return candidats.length ? candidats[0] : undefined;
}
