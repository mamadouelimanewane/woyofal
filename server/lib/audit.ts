import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { journalAudit } from "../db/schema";

export async function auditer(db: Db, e: { organisationId?: string | null; utilisateurId?: string | null; action: string; entite: string; entiteId?: string | null; avant?: unknown; apres?: unknown }): Promise<void> {
  await db.insert(journalAudit).values({ id: randomUUID(), organisationId: e.organisationId ?? null, utilisateurId: e.utilisateurId ?? null, action: e.action, entite: e.entite, entiteId: e.entiteId ?? null, avant: e.avant ?? null, apres: e.apres ?? null });
}
