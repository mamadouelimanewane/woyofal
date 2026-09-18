import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Badge, Card, PageTitle } from "../components/ui";
import { alertesDeOrg, orgCourante, useStore } from "../store/useStore";

const LIBELLE = { budget_80: "Budget 80 %", budget_100: "Budget dépassé", inactif: "Inactivité", anomalie: "Anomalie", redevance: "Redevance" } as const;

export default function Alertes() {
  const s = useStore();
  const org = orgCourante(s)!;
  const alertes = alertesDeOrg(s, org.id);
  const actives = alertes.filter((a) => !a.traitee);
  const traitees = alertes.filter((a) => a.traitee);

  const Ligne = ({ a }: { a: (typeof alertes)[number] }) => (
    <li className="flex items-center gap-3 py-2.5 border-t border-slate-100 first:border-0">
      <Badge tone={a.type === "budget_100" || a.type === "anomalie" ? "red" : a.type === "inactif" ? "amber" : "blue"}>{LIBELLE[a.type]}</Badge>
      <span className="flex-1 text-sm">{a.message}</span>
      {a.compteurId ? <Link to={`/compteur/${a.compteurId}`} className="text-sm text-brand-700">Voir</Link> : <Link to={`/parc?site=${a.siteId}`} className="text-sm text-brand-700">Voir</Link>}
      {!a.traitee && <button className="btn-ghost p-1.5" title="Marquer traitée" onClick={() => s.traiterAlerte(a.id)}><Check size={16} /></button>}
    </li>
  );

  return (
    <>
      <PageTitle title="Alertes" subtitle="Règles : budget à 80 % et 100 %, aucune recharge depuis 1,5 × la cadence habituelle du compteur (min. 12 jours), dépense > 150 % de la moyenne des 3 derniers mois" />
      <div className="space-y-4">
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
