/**
 * Sélection du pilote : Neon (DATABASE_URL) en production / preview,
 * PGlite (Postgres embarqué, fichier .pglite/ ou mémoire) en local et en test.
 * Les deux exposent la même API Drizzle ; les migrations sont générées par
 * drizzle-kit dans ./drizzle et appliquées par `migrer()`.
 */
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<any, typeof schema>;

let instance: Promise<Db> | null = null;

export function db(): Promise<Db> {
  if (!instance) instance = creer();
  return instance;
}

async function creer(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = process.env.PGLITE_DIR ?? (process.env.NODE_ENV === "test" ? undefined : ".pglite");
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const d = drizzle(client, { schema }) as unknown as Db;
  await migrer(d);
  return d;
}

/** Applique les migrations SQL de ./drizzle (idempotent). */
export async function migrer(d: Db): Promise<void> {
  const dossier = new URL("../../drizzle", import.meta.url);
  const migrationsFolder = decodeURIComponent(dossier.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(d as any, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(d as any, { migrationsFolder });
  }
}

/** Pour les tests : une base neuve en mémoire, isolée. */
export async function dbTest(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const d = drizzle(new PGlite(), { schema }) as unknown as Db;
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dossier = new URL("../../drizzle", import.meta.url);
  await migrate(d as any, { migrationsFolder: decodeURIComponent(dossier.pathname.replace(/^\/([A-Za-z]:)/, "$1")) });
  return d;
}

export { schema };
