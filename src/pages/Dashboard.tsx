import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus } from "lucide-react";
import { Badge, Card, PageTitle, Stat, fmtDate, fmtMois } from "../components/ui";
import RechargeForm from "../components/RechargeForm";
import { alertesDeOrg, compteursDeOrg, depenseSiteMois, derniersMois, moisCourant, orgCourante, rechargesDeOrg, sitesDeOrg, useStore, moisDe } from "../store/useStore";
import { fmtF, fmtKwh } from "../lib/tarif";

export default function Dashboard() {
  const s = useStore();
  const org = orgCourante(s)!;
  const [form, setForm] = useState(false);
  const mois = moisCourant();
  const recharges = rechargesDeOrg(s, org.id);
  const duMois = recharges.filter((r) => moisDe(r.date) === mois);
  const moisPrec = derniersMois(2)[0];
  const duMoisPrec = recharges.filter((r) => moisDe(r.date) === moisPrec);
  const depense = duMois.reduce((a, r) => a + r.montant, 0);
  const depensePrec = duMoisPrec.reduce((a, r) => a + r.montant, 0);
  const kwh = duMois.reduce((a, r) => a + r.kwh, 0);
  const alertes = alertesDeOrg(s, org.id).filter((a) => !a.traitee);
  const compteurs = compteursDeOrg(s, org.id);
  const sites = sitesDeOrg(s, org.id);
  const dues = s.quotesParts.filter((q) => q.statut === "due");
  const montantDu = dues.reduce((a, q) => a + q.montant, 0);
  const budget = sites.reduce((a, x) => a + (x.budgetMensuel ?? 0), 0);

  const serie = derniersMois(6).map((m) => ({ mois: fmtMois(m), montant: recharges.filter((r) => moisDe(r.date) === m).reduce((a, r) => a + r.montant, 0) }));
  const parSite = sites.map((x) => ({ site: x, dep: depenseSiteMois(s, x.id, mois) })).sort((a, b) => b.dep - a.dep).slice(0, 5);

  return (
    <>
      <PageTitle title="Tableau de bord" subtitle={`${org.nom} · ${new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`} action={<button className="btn-primary" onClick={() => setForm(true)}><Plus size={16} /> Recharge</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Dépense du mois" value={fmtF(depense)} hint={depensePrec ? `${depense >= depensePrec ? "+" : ""}${Math.round(((depense - depensePrec) / depensePrec) * 100)} % vs ${fmtMois(moisPrec)}` : undefined} tone={budget && depense > budget ? "bad" : "default"} />
        <Stat label="Énergie achetée" value={fmtKwh(kwh)} hint={`${duMois.length} recharges`} />
        {org.type === "immo" ? (
          <Stat label="Quotes-parts dues" value={fmtF(montantDu)} hint={`${dues.length} en attente`} tone={montantDu > 0 ? "warn" : "good"} />
        ) : (
          <Stat label="Budget consolidé" value={budget ? `${Math.round((depense / budget) * 100)} %` : "—"} hint={budget ? `sur ${fmtF(budget)}` : "non défini"} tone={depense > budget ? "bad" : depense > budget * 0.8 ? "warn" : "good"} />
        )}
        <Stat label="Alertes actives" value={alertes.length} hint={`${compteurs.length} compteurs · ${sites.length} sites`} tone={alertes.length ? "warn" : "good"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Dépense mensuelle (6 mois)" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmtF(Number(v))} />
                <Bar dataKey="montant" fill="#0f766e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Alertes" action={<Link to="/alertes" className="text-sm text-brand-700">Tout voir</Link>}>
          {alertes.length === 0 ? <p className="text-sm text-slate-500">Aucune alerte active.</p> : (
            <ul className="space-y-2">
              {alertes.slice(0, 5).map((a) => (
                <li key={a.id} className="text-sm flex gap-2">
                  <Badge tone={a.type === "budget_100" || a.type === "anomalie" ? "red" : "amber"}>{a.type.replace("_", " ")}</Badge>
                  <span className="text-slate-700">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={org.type === "immo" ? "Immeubles les plus coûteux" : "Top sites du mois"}>
          <table className="w-full">
            <tbody>
              {parSite.map(({ site, dep }) => (
                <tr key={site.id}>
                  <td className="td pl-0"><Link to={`/parc?site=${site.id}`} className="text-brand-700 hover:underline">{site.nom}</Link></td>
                  <td className="td text-right font-medium">{fmtF(dep)}</td>
                  <td className="td text-right text-xs text-slate-500">{site.budgetMensuel ? `${Math.round((dep / site.budgetMensuel) * 100)} %` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Dernières recharges" className="lg:col-span-2" action={<Link to="/recharges" className="text-sm text-brand-700">Historique</Link>}>
          <table className="w-full">
            <thead><tr><th className="th pl-0">Date</th><th className="th">Compteur</th><th className="th text-right">Montant</th><th className="th text-right">kWh</th><th className="th">Canal</th></tr></thead>
            <tbody>
              {[...recharges].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8).map((r) => {
                const c = compteurs.find((x) => x.id === r.compteurId);
                const site = sites.find((x) => x.id === c?.siteId);
                return (
                  <tr key={r.id}>
                    <td className="td pl-0 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="td"><Link to={`/compteur/${c?.id}`} className="text-brand-700 hover:underline">{site?.nom} · {c?.libelle ?? c?.numero}</Link></td>
                    <td className="td text-right font-medium">{fmtF(r.montant)}</td>
                    <td className="td text-right">{fmtKwh(r.kwh)}</td>
                    <td className="td"><Badge tone={r.canal === "sms" ? "teal" : "slate"}>{r.canal}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
      {form && <RechargeForm onClose={() => setForm(false)} />}
    </>
  );
}
