/**
 * Notifications d'interface (toasts) et boîtes de dialogue (confirmation, saisie) sans `alert` / `prompt` natifs.
 * Le composant <Toasts /> monté dans App affiche la file ; `confirmer` et `demander` renvoient des promesses.
 */
import { useSyncExternalStore } from "react";

export type Ton = "info" | "succes" | "erreur";
export interface Toast { id: number; texte: string; ton: Ton }
export interface Dialogue { id: number; titre: string; texte?: string; saisie?: { valeur: string; placeholder?: string; type?: string; options?: string[] }; confirmer: string; annuler: string; resoudre: (v: string | null) => void }

let toasts: Toast[] = [];
let dialogue: Dialogue | null = null;
let seq = 0;
const abonnes = new Set<() => void>();
const notifierAbonnes = () => abonnes.forEach((f) => f());

export function toast(texte: string, ton: Ton = "info", duree = 3500): void {
  const id = ++seq;
  toasts = [...toasts, { id, texte, ton }];
  notifierAbonnes();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); notifierAbonnes(); }, duree);
}

/** Remonte une erreur (ApiError ou autre) sous forme de toast rouge. */
export function signaler(e: unknown): void {
  toast(e instanceof Error ? e.message : String(e), "erreur", 6000);
}

export function confirmer(titre: string, texte?: string, boutons: { confirmer?: string; annuler?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    dialogue = { id: ++seq, titre, texte, confirmer: boutons.confirmer ?? "Confirmer", annuler: boutons.annuler ?? "Annuler", resoudre: (v) => { dialogue = null; notifierAbonnes(); resolve(v !== null); } };
    notifierAbonnes();
  });
}

/** Demande une valeur (texte libre ou choix parmi `options`). Résout null si annulé. */
export function demander(titre: string, opts: { texte?: string; valeur?: string; placeholder?: string; type?: string; options?: string[]; confirmer?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    dialogue = { id: ++seq, titre, texte: opts.texte, saisie: { valeur: opts.valeur ?? (opts.options?.[0] ?? ""), placeholder: opts.placeholder, type: opts.type, options: opts.options }, confirmer: opts.confirmer ?? "Valider", annuler: "Annuler", resoudre: (v) => { dialogue = null; notifierAbonnes(); resolve(v); } };
    notifierAbonnes();
  });
}

const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
export const useToasts = () => useSyncExternalStore(abonner, () => toasts);
export const useDialogue = () => useSyncExternalStore(abonner, () => dialogue);
