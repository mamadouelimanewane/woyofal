import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MessageSquareWarning } from "lucide-react";
import { api } from "../api/client";
import { Badge, Card, PageTitle } from "../components/ui";
import { alertesDeOrg, orgCourante, useStore } from "../store/useStore";
import { signaler } from "../components/erreur";

const LIBELLE: Record<string, string> = { budget_80: "Budget 80 %", budget_100: "Budget dépassé", inactif: "Inactivité", anomalie: "Anomalie", redevance: "Redevance", incident: "Signalement" };

interface AlerteServeur { id: string; type: string; message: string; siteId: string | null; compteurId: string | null; declencheeLe: string; traiteeLe: string | null; commentaire: string | null }

export default function Alertes() {
  const s = useStore();
  const org = orgCourante(s)!;
  const alertes = alertesDeOrg(s, org.id);
  const actives = alertes.filter((a) => !a.traitee);
  const traitees = alertes.filter((a) => a.traitee);
  const [serveur, setServeur] = useState<AlerteServeur[]>([]);
  const charger = () => api<AlerteServeur[]>("/alertes").then(setServeur).catch(() => setServeur([]));
  useEffect(() => { void charger(); }, [s.recharges.length]);
  // Les alertes calculées côté serveur (cron) ont la même clé que celles calculées ici : on n'affiche à part que les signalements et les détections inconnues du client
  const clesClient = new Set(alertes.map((a) => a.id));
  const serveurSeul = serveur.filter((a) => a.type === "incident" || !clesClient.has(a.message));

  const Ligne = ({ a }: { a: (typeof alertes)[number] }) => (
    <li className="flex items-center gap-3 py-2.5 border-t border-slate-100 first:border-0">
      <Badge tone={a.type === "budget_100" || a.type === "anomalie" ? "red" : a.type === "inactif" ? "amber" : "blue"}>{LIBELLE[a.type] ?? a.type}</Badge>
      <span className="flex-1 text-sm">{a.message}</span>
      {a.compteurId ? <Link to={`/compteur/${a.compteurId}`} className="text-sm text-brand-700">Voir</Link> : <Link to={`/parc?site=${a.siteId}`} className="text-sm text-brand-700">Voir</Link>}
      {!a.traitee && <button className="btn-ghost p-1.5" title="Marquer traitée" onClick={() => s.traiterAlerte(a.id).catch(signaler)}><Check size={16} /></button>}
    </li>
  );

  return (
    <>
      <PageTitle title="Alertes" subtitle="Règles : budget à 80 % et 100 %, aucune recharge depuis 1,5 × la cadence habituelle du compteur (min. 12 jours), dépense > 150 % de la moyenne des 3 derniers mois" />
      <div className="space-y-4">
        {serveurSeul.length > 0 && (
          <Card title={<span className="flex items-center gap-2"><MessageSquareWarning size={16} className="text-amber-600" /> Signalements des occupants et détections serveur ({serveurSeul.length})</span>}>
            <ul>
              {serveurSeul.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 border-t border-slate-100 first:border-0">
                  <Badge tone={a.type === "incident" ? "amber" : a.type === "budget_100" || a.type === "anomalie" ? "red" : "blue"}>{LIBELLE[a.type] ?? a.type}</Badge>
                  <span className="flex-1 text-sm">{a.message}<span className="text-xs text-slate-500"> · {new Date(a.declencheeLe).toLocaleDateString("fr-FR")}</span></span>
                  {a.siteId && <Link to={`/parc?site=${a.siteId}`} className="text-sm text-brand-700">Voir</Link>}
                  <button className="btn-ghost p-1.5" title="Marquer traitée" onClick={() => { const c = prompt("Commentaire (facultatif) :") ?? undefined; api(`/alertes/${a.id}`, { method: "PATCH", body: { traitee: true, commentaire: c } }).then(charger, signaler); }}><Check size={16} /></button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title={`À traiter (${actives.length})`}>
          {actives.length ? <ul>{actives.map((a) => <Ligne key={a.id} a={a} />)}</ul> : <p className="text-sm text-slate-500">Aucune alerte active. 👍</p>}
        </Card>
        {traitees.length > 0 && (
          <Card title={`Traitées (${traitees.length})`}>
            <ul className="opacity-60">{traitees.map((a) => <Ligne key={a.id} a={a} />)}</ul>
          </Card>
        )}
      </div>
    </>
  );
}
