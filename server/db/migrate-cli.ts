import { db, migrer } from "./index";
const d = await db();
await migrer(d);
console.log("Migrations appliquées sur", process.env.DATABASE_URL ? "Neon" : "PGlite (.pglite)");
process.exit(0);
