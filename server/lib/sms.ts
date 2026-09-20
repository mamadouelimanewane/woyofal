/**
 * Envoi de SMS. Fournisseur générique HTTP configuré par variables d'environnement :
 *   SMS_API_URL   endpoint POST (JSON { to, message })
 *   SMS_API_KEY   envoyé en Authorization: Bearer
 * Sans configuration : aucun envoi, retourne false (l'appelant décide du repli).
 */
export async function envoyerSms(telephone: string, message: string): Promise<boolean> {
  const url = process.env.SMS_API_URL;
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.SMS_API_KEY ?? ""}` },
      body: JSON.stringify({ to: telephone, message, from: process.env.SMS_SENDER ?? "KURAN" }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
