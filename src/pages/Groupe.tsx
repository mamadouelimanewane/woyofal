import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Badge, Card, PageTitle, Stat } from "../components/ui";
import { api, ecrireSession } from "../api/client";
import { fmtF, fmtKwh } from "../lib/tarif";
import { derniersMois, moisCourant, useStore } from "../store/useStore";
import { signaler } from "../components/erreur";

interface Ligne { organisationId: string; nom: string; type: string; plan: string; role: string; nbSites: number; nbCompteurs: number; depense: number; kwh: number; nbRecharges: number; variationPct: number | null; budget: number | null; quotesPartsDues: number; signaux: number; alertes: number }
interface Conso { mois: string; organisations: Ligne[]; total: { depense: number; kwh: number; nbRecharges: number; nbSites: number; nbCompteurs: number; quotesPartsDues: number } }

/** Plan Groupe / Cabinet : consolidation de toutes les organisations accessibles à l'utilisateur. */
export default function Groupe() {
  const s = useStore();
  const [params, setParams] = useSearchParams();
  const mois = params.get("mois") ?? moisCourant();
  const [c, setC] = useState<Conso | null>(null);
  const [erreur, setErreur] = useState("");
  useEffect(() => { setC(null); api<Conso>(`/groupe/consolidation/${mois}`).then(setC).catch((e) => setErreur(e.message)); }, [mois]);

  async function ouvrir(organisationId: string) {
    try {
      const j = await api("/basculer", { body: { organisationId } });
      ecrireSession({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      await s.charger();
      window.location.href = "/";
    } catch (e) { signaler(e); }
  }

  return (
    <>
      <PageTitle title="Groupe" subtitle="Consolidation de toutes vos organisations" action={
        <select className="input w-auto" value={mois} onChange={(e) => setParams({ mois: e.target.value })}>{derniersMois(12).reverse().map((m) => <option key={m} value={m}>{m}</option>)}</select>
      } />
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {!c && !erreur && <p className="text-sm text-slate-500">Consolidation…</p>}
      {c && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label={`Dépense · ${mois}`} value={fmtF(c.total.depense)} hint={`${c.total.nbRecharges} recharges`} />
            <Stat label="Énergie" value={fmtKwh(c.total.kwh)} />
            <Stat label="Parc" value={`${c.total.nbCompteurs} compteurs`} hint={`${c.total.nbSites} sites · ${c.organisations.length} organisations`} />
            <Stat label="Quotes-parts dues" value={fmtF(c.total.quotesPartsDues)} tone={c.total.quotesPartsDues ? "warn" : "good"} />
          </div>
          <Card title="Par organisation">
            <table className="w-full">
              <thead><tr><th className="th pl-0">Organisation</th><th className="th">Plan</th><th className="th text-right">Sites</th><th className="th text-right">Compteurs</th><th className="th text-right">Dépense</th><th className="th text-right">Var. M-1</th><th className="th text-right">Dû</th><th className="th text-right">Alertes</th><th className="th"></th></tr></thead>
              <tbody>
                {c.organisations.map((o) => (
                  <tr key={o.organisationId}>
                    <td className="td pl-0"><div className="font-medium flex items-center gap-2"><Building2 size={14} className="text-slate-400" />{o.nom}</div><div className="text-xs text-slate-500">{o.type === "immo" ? "Immo" : "Entreprise"} · {o.role}</div></td>
                    <td className="td"><Badge>{o.plan}</Badge></td>
                    <td className="td text-right">{o.nbSites}</td>
                    <td className="td text-right">{o.nbCompteurs}</td>
                    <td className="td text-right font-semibold">{fmtF(o.depense)}</td>
                    <td className="td text-right">{o.variationPct == null ? "—" : <Badge tone={o.variationPct >= 30 ? "red" : o.variationPct > 0 ? "amber" : "green"}>{o.variationPct > 0 ? "+" : ""}{o.variationPct} %</Badge>}</td>
                    <td className="td text-right">{o.quotesPartsDues ? <span className="text-amber-700 font-medium">{fmtF(o.quotesPartsDues)}</span> : "—"}</td>
                    <td className="td text-right">{o.alertes + o.signaux ? <Badge tone="red">{o.alertes + o.signaux}</Badge> : "—"}</td>
                    <td className="td text-right"><button className="btn-secondary text-xs" onClick={() => ouvrir(o.organisationId)}>Ouvrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
