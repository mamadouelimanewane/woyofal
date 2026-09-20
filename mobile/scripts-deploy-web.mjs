// Exporte la version web (test navigateur) et la déploie sur Vercel (projet kuran-agent).
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
const run = (cmd, cwd) => execSync(cmd, { stdio: "inherit", cwd });
run("npx expo export --platform web --output-dir dist-web");
for (const f of readdirSync("vercel-web")) if (f !== ".vercel" && f !== "vercel.json") rmSync(`vercel-web/${f}`, { recursive: true, force: true });
cpSync("dist-web", "vercel-web", { recursive: true });
if (!existsSync("vercel-web/.vercel")) console.warn("vercel-web/.vercel absent : lancez d'abord `vercel link --project kuran-agent` dans mobile/vercel-web");
run("vercel --prod --yes", "vercel-web");
