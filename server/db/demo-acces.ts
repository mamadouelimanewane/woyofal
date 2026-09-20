/**
 * Accès de démonstration : attribue un e-mail et un mot de passe unique aux comptes de démo
 * (créés par seed.ts) et au super-admin, pour les présentations.
 *   DATABASE_URL=… npx tsx server/db/demo-acces.ts <motDePasse> [emailSuperAdmin]
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index.js";
import { utilisateurs } from "./schema.js";
import { hacherMotDePasse, normaliserTelephone } from "../lib/auth.js";

const [motDePasse, emailSuperAdmin] = process.argv.slice(2);
if (!motDePasse || motDePasse.length < 10) { console.error("Usage : demo-acces.ts <motDePasse ≥ 10 caractères> [emailSuperAdmin]"); process.exit(1); }

const COMPTES: { telephone: string; email: string }[] = [
  { telephone: "77 123 45 67", email: "immo@demo.kuran.sn" },        // Awa Sarr — administratrice Gérance Keur Gorgui (Immo)
  { telephone: "76 987 65 43", email: "agent@demo.kuran.sn" },       // Modou Fall — agent de site (Immo)
  { telephone: "78 111 22 33", email: "entreprise@demo.kuran.sn" },  // Dr Ibrahima Ndiaye — administrateur Pharmacies Ndiaye & Fils
  { telephone: "77 444 55 66", email: "daf@demo.kuran.sn" },         // Fatou Diop — DAF, lecture seule (Entreprise)
];

const d = await db();
const hash = hacherMotDePasse(motDePasse);
for (const c of COMPTES) {
  const rows = await d.update(utilisateurs).set({ email: c.email, motDePasseHash: hash, modifieLe: new Date() }).where(eq(utilisateurs.telephone, normaliserTelephone(c.telephone))).returning({ nom: utilisateurs.nom, role: utilisateurs.role });
  for (const r of rows) console.log(`${c.email.padEnd(28)} ${c.telephone}  ${r.nom} (${r.role})`);
}
if (emailSuperAdmin) {
  const rows = await d.update(utilisateurs).set({ motDePasseHash: hash, modifieLe: new Date() }).where(and(eq(utilisateurs.role, "superadmin"), eq(utilisateurs.email, emailSuperAdmin.toLowerCase()), isNull(utilisateurs.organisationId))).returning({ nom: utilisateurs.nom });
  console.log(rows.length ? `${emailSuperAdmin.padEnd(28)} super-admin ${rows[0].nom}` : `super-admin ${emailSuperAdmin} introuvable`);
}
process.exit(0);
