import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/index.js";
import { sequences } from "../db/schema.js";

export const uid = () => randomUUID();
export const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v));

export function introuvable(msg = "Introuvable"): never {
  throw new HTTPException(404, { message: msg });
}

export function invalide(msg: string): never {
  throw new HTTPException(400, { message: msg });
}

/** Numéro séquentiel par organisation (quittances, factures) : PREFIXE-AAAA-000123. */
export async function prochainNumero(db: Db, organisationId: string, nom: "quittance" | "facture"): Promise<string> {
  const [row] = await db
    .insert(sequences)
    .values({ organisationId, nom, valeur: 1 })
    .onConflictDoUpdate({ target: [sequences.organisationId, sequences.nom], set: { valeur: sql`${sequences.valeur} + 1` } })
    .returning({ valeur: sequences.valeur });
  const prefixe = nom === "quittance" ? "Q" : "F";
  return `${prefixe}-${new Date().getFullYear()}-${String(row.valeur).padStart(6, "0")}`;
}

export { and, eq };
