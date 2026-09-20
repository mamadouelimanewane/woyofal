/** Affichage uniforme des erreurs API dans l'interface (remplacé par un toast en V2). */
export function signaler(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  alert(msg);
}
