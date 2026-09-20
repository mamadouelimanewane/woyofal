/**
 * Point d'entrée Vercel (runtime Node.js) : getRequestListener convertit
 * (IncomingMessage, ServerResponse) en Request/Response pour Hono.
 * NODEJS_HELPERS=0 sur Vercel pour désactiver le pré-parsing du corps des requêtes.
 */
import { getRequestListener } from "@hono/node-server";
import { app } from "../server/app.js";

export default getRequestListener(app.fetch);
