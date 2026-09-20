/**
 * API KURAÑ — Hono. Servie par Vercel (api/index.ts) et en local (server/dev.ts).
 * Toutes les routes métier passent par `authentifie` puis filtrent sur c.get("orgId").
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { db } from "./db/index.js";
import { memoriserOrigine } from "./lib/util.js";
import type { Vars } from "./lib/auth.js";
import auth from "./routes/auth.js";
import parc from "./routes/parc.js";
import recharges from "./routes/recharges.js";
import occupants from "./routes/occupants.js";
import grille from "./routes/grille.js";
import publique from "./routes/public.js";
import admin from "./routes/admin.js";
import snapshot from "./routes/snapshot.js";
import abonnement from "./routes/abonnement.js";

export const app = new Hono<Vars>().basePath("/api");

if (process.env.NODE_ENV !== "test") app.use(logger());
app.use(cors({ origin: (o) => o, credentials: true, allowHeaders: ["authorization", "content-type", "x-organisation", "x-api-key"] }));
app.use(async (c, next) => {
  c.set("db", await db());
  const u = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? u.host;
  // En dev, le front (5180) proxifie /api vers 3001 : l'origine utile est celle du front.
  memoriserOrigine(host.endsWith(":3001") ? "http://localhost:5180" : `${proto}://${host}`);
  await next();
});

app.get("/sante", (c) => c.json({ ok: true, version: "0.2.0", base: process.env.DATABASE_URL ? "neon" : "pglite" }));

// Ordre important : les routeurs qui commencent par des routes publiques (grille, cron, ingestion SMS)
// sont montés avant ceux dont le `use(authentifie)` global s'appliquerait à tout ce qui suit.
app.route("/auth", auth);
app.route("/", grille);
app.route("/", publique);
app.route("/admin", admin);
app.route("/", recharges);
app.route("/", parc);
app.route("/", occupants);
app.route("/", snapshot);
app.route("/", abonnement);

app.notFound((c) => c.json({ erreur: "Route inconnue" }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ erreur: err.message }, err.status);
  if (err?.name === "ZodError") return c.json({ erreur: "Données invalides", details: (err as any).issues }, 400);
  console.error(err);
  return c.json({ erreur: "Erreur interne" }, 500);
});

export type App = typeof app;
