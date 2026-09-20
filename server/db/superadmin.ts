/**
 * Crée (ou réinitialise le mot de passe d') un compte super-admin.
 *   npx tsx server/db/superadmin.ts <email> <telephone> [nom]        → PGlite local
 *   DATABASE_URL=… npx tsx server/db/superadmin.ts <email> <telephone> → Neon
 * Le mot de passe généré est affiché une seule fois.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./index.js";
import { utilisateurs } from "./schema.js";
import { hacherMotDePasse, normaliserTelephone } from "../lib/auth.js";

const [email, telephone, nom = "Super-admin processingenierie"] = process.argv.slice(2);
if (!email || !telephone) { console.error("Usage : superadmin.ts <email> <telephone> [nom]"); process.exit(1); }
const d = await db();
const motDePasse = randomBytes(12).toString("base64url");
const [existant] = await d.select().from(utilisateurs).where(and(eq(utilisateurs.email, email.toLowerCase()), eq(utilisateurs.role, "superadmin")));
if (existant) {
  await d.update(utilisateurs).set({ motDePasseHash: hacherMotDePasse(motDePasse), telephone: normaliserTelephone(telephone), actif: true, modifieLe: new Date() }).where(eq(utilisateurs.id, existant.id));
  console.log("Mot de passe réinitialisé pour", email);
} else {
  await d.insert(utilisateurs).values({ id: randomUUID(), organisationId: null, role: "superadmin", nom, telephone: normaliserTelephone(telephone), email: email.toLowerCase(), motDePasseHash: hacherMotDePasse(motDePasse) });
  console.log("Super-admin créé :", email);
}
console.log("Mot de passe (à changer après la première connexion) :", motDePasse);
process.exit(0);
