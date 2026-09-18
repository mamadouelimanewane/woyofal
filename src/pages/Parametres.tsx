import { RotateCcw } from "lucide-react";
import { Badge, Card, PageTitle } from "../components/ui";
import { compteursDeOrg, orgCourante, sitesDeOrg, useStore } from "../store/useStore";

const PLAN = { starter: "Starter — 15 000 F/mois", immo: "Immo — 600 F/compteur/mois", entreprise: "Entreprise — 3 000 F/site/mois", groupe: "Groupe — sur devis" };

export default function Parametres() {
  const s = useStore();
  const org = orgCourante(s)!;
  const nbCompteurs = compteursDeOrg(s, org.id).filter((c) => c.statut === "actif").length;
  const nbSites = sitesDeOrg(s, org.id).length;
  const mensuel = org.plan === "immo" ? nbCompteurs * 600 : org.plan === "entreprise" ? Math.max(10, nbSites) * 3000 : org.plan === "starter" ? 15000 : 0;

  return (
    <>
      <PageTitle title="Paramètres" />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Organisation">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Nom</dt><dd className="text-right font-medium">{org.nom}</dd>
            <dt className="text-slate-500">Édition</dt><dd className="text-right"><Badge tone="teal">{org.type === "immo" ? "Immo" : "Entreprise"}</Badge></dd>
            <dt className="text-slate-500">NINEA</dt><dd className="text-right font-mono">{org.ninea ?? "—"}</dd>
            <dt className="text-slate-500">Plan</dt><dd className="text-right">{PLAN[org.plan]}</dd>
            <dt className="text-slate-500">Compteurs actifs / sites</dt><dd className="text-right">{nbCompteurs} / {nbSites}</dd>
            <dt className="text-slate-500">Abonnement estimé</dt><dd className="text-right font-semibold">{mensuel.toLocaleString("fr-FR")} F/mois</dd>
          </dl>
        </Card>
        <Card title="Utilisateurs">
          <ul className="text-sm divide-y divide-slate-100">
            {s.utilisateurs.filter((u) => u.organisationId === org.id).map((u) => (
              <li key={u.id} className="flex justify-between py-2"><span>{u.nom} <span className="text-xs text-slate-500">{u.telephone}</span></span><Badge>{u.role}</Badge></li>
            ))}
          </ul>
        </Card>
        <Card title="Données de démonstration" className="lg:col-span-2">
          <p className="text-sm text-slate-600 mb-3">Les données sont stockées dans le navigateur (localStorage). Réinitialiser regénère le jeu de démonstration (deux organisations, 6 mois de recharges).</p>
          <button className="btn-secondary" onClick={() => confirm("Réinitialiser toutes les données de démonstration ?") && s.reset()}><RotateCcw size={16} /> Réinitialiser</button>
        </Card>
      </div>
    </>
  );
}
