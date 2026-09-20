/**
 * Jeu de démonstration créé via l'API (mêmes règles que l'interface) :
 * un bailleur (Immo) et une chaîne de pharmacies (Entreprise), 6 mois de recharges.
 * Connexion : 77 123 45 67 (Immo) ou 78 111 22 33 (Entreprise), code renvoyé à l'écran sans fournisseur SMS.
 *   npm run db:seed           → PGlite local
 *   DATABASE_URL=… npm run db:seed → Neon
 */
import { app } from "../app";
import * as demo from "../../src/data/demo";

async function api(path: string, body?: unknown, token?: string, method?: string): Promise<any> {
  const res = await app.request(`http://localhost/api${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(`${method ?? "POST"} ${path} → ${res.status} ${JSON.stringify(j)}`);
  return j;
}

async function inscrire(telephone: string, nom: string, org: { nom: string; type: "immo" | "entreprise" }) {
  // Garde-fou : si le numéro existe déjà, la base a déjà été chargée.
  const test = await api("/auth/otp/request", { telephone });
  if (!test.devCode) throw new Error("Un fournisseur SMS est configuré : le seed a besoin du code OTP à l'écran (retirez SMS_API_URL).");
  const deja = await app.request("http://localhost/api/auth/otp/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ telephone, code: test.devCode }) });
  if (deja.status === 200) throw new Error(`Le compte ${telephone} existe déjà : base déjà chargée (supprimez .pglite/ pour repartir de zéro).`);
  const otp = await api("/auth/otp/request", { telephone });
  const r = await app.request("http://localhost/api/auth/inscription", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ telephone, code: otp.devCode, nom, organisation: org }) });
  if (!r.ok) throw new Error(`Inscription ${org.nom} : ${r.status} ${await r.text()}`);
  return ((await r.json()) as any).accessToken as string;
}

async function chargerOrg(orgDemo: (typeof demo.ORGANISATIONS)[number], token: string) {
  const ids = { sites: new Map<string, string>(), lots: new Map<string, string>(), compteurs: new Map<string, string>() };
  for (const s of demo.SITES.filter((x) => x.organisationId === orgDemo.id)) {
    const r = await api("/sites", { nom: s.nom, type: s.type, adresse: s.adresse, surfaceM2: s.surfaceM2, budgetMensuel: s.budgetMensuel, responsable: s.responsable }, token);
    ids.sites.set(s.id, r.id);
  }
  for (const l of demo.LOTS.filter((x) => ids.sites.has(x.siteId))) {
    const r = await api("/lots", { siteId: ids.sites.get(l.siteId), reference: l.reference, surfaceM2: l.surfaceM2, etage: l.etage }, token);
    ids.lots.set(l.id, r.id);
  }
  for (const c of demo.COMPTEURS.filter((x) => ids.sites.has(x.siteId))) {
    const lotIds = demo.RATTACHEMENTS.filter((r) => r.compteurId === c.id).map((r) => ids.lots.get(r.lotId)).filter(Boolean);
    const regle = demo.REGLES.find((r) => r.compteurId === c.id)?.regle ?? "egal";
    const r = await api("/compteurs", { siteId: ids.sites.get(c.siteId), numero: c.numero, libelle: c.libelle, typeTarif: c.typeTarif, puissanceKva: c.puissanceKva, regleRepartition: regle, lotIds }, token);
    ids.compteurs.set(c.id, r.id);
  }
  for (const o of demo.OCCUPANTS.filter((x) => ids.lots.has(x.lotId))) {
    await api("/occupants", { lotId: ids.lots.get(o.lotId), nom: o.nom, telephone: o.telephone, dateEntree: o.dateEntree, caution: o.caution }, token);
  }
  for (const rl of demo.RELEVES.filter((x) => ids.lots.has(x.lotId))) {
    await api("/releves", { lotId: ids.lots.get(rl.lotId), date: rl.date, index: rl.index }, token);
  }
  let n = 0;
  for (const r of demo.rechargesDemo().filter((x) => ids.compteurs.has(x.compteurId))) {
    await api("/recharges", { compteurId: ids.compteurs.get(r.compteurId), date: r.date, montant: r.montant, canal: r.canal }, token);
    n++;
  }
  // Historique : les quotes-parts de plus de 45 jours sont réglées
  const qps = await api("/quotes-parts?statut=due", undefined, token);
  const recharges: any[] = await api("/recharges", undefined, token);
  let payees = 0;
  for (const q of qps) {
    const rec = recharges.find((x) => x.id === q.rechargeId);
    if (!q.occupantId || !rec || Date.now() - new Date(rec.date).getTime() < 45 * 86400_000) continue;
    await api(`/occupants/${q.occupantId}/paiements`, { quotesPartsIds: [q.id], moyen: "wave", date: rec.date }, token);
    payees++;
  }
  console.log(`  ${orgDemo.nom} : ${n} recharges, ${payees} quotes-parts réglées`);
}

console.log("Seed KURAÑ →", process.env.DATABASE_URL ? "Neon" : "PGlite (.pglite)");
for (const org of demo.ORGANISATIONS) {
  const admin = demo.UTILISATEURS.find((u) => u.organisationId === org.id && u.role === "admin")!;
  const token = await inscrire(admin.telephone, admin.nom, { nom: org.nom, type: org.type });
  for (const u of demo.UTILISATEURS.filter((x) => x.organisationId === org.id && x.role !== "admin")) {
    await api("/utilisateurs", { nom: u.nom, telephone: u.telephone, role: u.role }, token);
  }
  await chargerOrg(org, token);
}
console.log("Terminé. Connexion : 77 123 45 67 (Immo) · 78 111 22 33 (Entreprise).");
process.exit(0);
