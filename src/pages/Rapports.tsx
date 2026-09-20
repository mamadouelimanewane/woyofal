import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, PageTitle, Stat } from "../components/ui";
import { api, lireSession } from "../api/client";
import { fmtF, fmtKwh } from "../lib/tarif";
import { moisCourant, orgCourante, useStore } from "../store/useStore";

interface Rapport {
  mois: string;
  total: { depense: number; kwh: number; nbRecharges: number; coutKwh: number | null; depenseMoisPrecedent: number; variationPct: number | null; budget: number | null; tva: number; redevances: number };
  sites: { siteId: string; nom: string; type: string; depense: number; kwh: number; nbRecharges: number; nbCompteurs: number; budget: number | null; ecartBudgetPct: number | null; coutM2: number | null; coutKwh: number | null; variationPct: number | null; joursSansRecharge: number | null }[];
  tendance: { mois: string; depense: number; kwh: number }[];
  signaux: string[];
  comparaison: { type: string; nbSites: number; moyenneDepense: number; moyenneCoutM2: number | null; sites: { siteId: string; nom: string; depense: number; coutM2: number | null; ecartPct: number | null; ecartM2Pct: number | null }[] }[];
}

/** Télécharge une ressource protégée (PDF, CSV) avec le jeton en cours. */
async function telecharger(path: string, nom: string) {
  const s = lireSession();
  const res = await fetch(`/api${path}`, { headers: s ? { authorization: `Bearer ${s.accessToken}` } : {} });
  if (!res.ok) return alert(`Téléchargement impossible (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function Rapports() {
  const s = useStore();
  const org = orgCourante(s)!;
  const [params, setParams] = useSearchParams();
  const mois = params.get("mois") ?? moisCourant();
  const [liste, setListe] = useState<{ mois: string; libelle: string }[]>([]);
  const [rap, setRap] = useState<Rapport | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => { api("/rapports").then(setListe).catch(() => undefined); }, []);
  useEffect(() => { setRap(null); api<Rapport>(`/rapports/mensuel/${mois}`).then(setRap).catch((e) => setErreur(e.message)); }, [mois]);

  const libelle = liste.find((m) => m.mois === mois)?.libelle ?? mois;
  const v = rap?.total.variationPct;

  return (
    <>
      <PageTitle title="Rapports" subtitle="Rapport mensuel, export comptable OHADA, tendance 12 mois" action={
        <div className="flex gap-2">
          <select className="input w-auto" value={mois} onChange={(e) => setParams({ mois: e.target.value })}>
            {(liste.length ? liste : [{ mois, libelle: mois }]).map((m) => <option key={m.mois} value={m.mois}>{m.libelle}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => telecharger(`/rapports/mensuel/${mois}/pdf`, `kuran-rapport-${mois}.pdf`)}><FileText size={16} /> PDF</button>
          <button className="btn-secondary" title="Écritures 6052 / 4452 / 5711, une par site" onClick={() => telecharger(`/exports/comptable/${mois}`, `kuran-comptable-${mois}.csv`)}><Download size={16} /> Export comptable</button>
        </div>
      } />
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {!rap && !erreur && <p className="text-sm text-slate-500">Calcul du rapport…</p>}
      {rap && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label={`Dépense · ${libelle}`} value={fmtF(rap.total.depense)} hint={rap.total.budget ? `budget ${fmtF(rap.total.budget)}` : `${rap.total.nbRecharges} recharges`} tone={rap.total.budget && rap.total.depense > rap.total.budget ? "bad" : "default"} />
            <Stat label="Énergie achetée" value={fmtKwh(rap.total.kwh)} hint={rap.total.coutKwh ? `${rap.total.coutKwh} F/kWh en moyenne` : undefined} />
            <Stat label="Vs mois précédent" value={v == null ? "—" : <span className="flex items-center gap-1">{v > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}{v > 0 ? "+" : ""}{v} %</span>} hint={fmtF(rap.total.depenseMoisPrecedent)} tone={v != null && v > 20 ? "bad" : v != null && v < 0 ? "good" : "default"} />
            <Stat label="Redevances · TVA" value={fmtF(rap.total.redevances)} hint={`TVA ${fmtF(rap.total.tva)}`} />
          </div>

          {rap.signaux.length > 0 && (
            <Card title="Points d'attention">
              <ul className="text-sm space-y-1">{rap.signaux.map((x, i) => <li key={i} className="flex gap-2"><span className="text-red-600">•</span>{x}</li>)}</ul>
            </Card>
          )}

          <Card title="Dépense par site">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th pl-0">Site</th><th className="th text-right">Compteurs</th><th className="th text-right">Recharges</th><th className="th text-right">Dépense</th><th className="th text-right">kWh</th><th className="th text-right">Budget</th><th className="th text-right">Var. M-1</th><th className="th text-right">F/m²</th><th className="th text-right">F/kWh</th></tr></thead>
                <tbody>
                  {rap.sites.map((l) => (
                    <tr key={l.siteId}>
                      <td className="td pl-0"><Link to={`/parc?site=${l.siteId}`} className="text-brand-700 hover:underline">{l.nom}</Link><div className="text-xs text-slate-500">{l.type}{l.joursSansRecharge != null && l.joursSansRecharge > 12 ? ` · ${l.joursSansRecharge} j sans recharge` : ""}</div></td>
                      <td className="td text-right">{l.nbCompteurs}</td>
                      <td className="td text-right">{l.nbRecharges}</td>
                      <td className="td text-right font-semibold">{fmtF(l.depense)}</td>
                      <td className="td text-right">{fmtKwh(l.kwh)}</td>
                      <td className="td text-right">{l.budget ? <span className={l.ecartBudgetPct! > 0 ? "text-red-600 font-medium" : ""}>{fmtF(l.budget)}{l.ecartBudgetPct != null && <span className="text-xs"> ({l.ecartBudgetPct > 0 ? "+" : ""}{l.ecartBudgetPct} %)</span>}</span> : "—"}</td>
                      <td className="td text-right">{l.variationPct == null ? "—" : <Badge tone={l.variationPct >= 50 ? "red" : l.variationPct > 0 ? "amber" : "green"}>{l.variationPct > 0 ? "+" : ""}{l.variationPct} %</Badge>}</td>
                      <td className="td text-right text-slate-500">{l.coutM2 ?? "—"}</td>
                      <td className="td text-right text-slate-500">{l.coutKwh ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {rap.comparaison.length > 0 && (
            <Card title="Comparaison entre sites comparables">
              <div className="grid md:grid-cols-2 gap-4">
                {rap.comparaison.map((g) => (
                  <div key={g.type} className="rounded-xl border p-3">
                    <div className="flex justify-between text-sm mb-2"><span className="font-semibold capitalize">{g.type}s ({g.nbSites})</span><span className="text-slate-500">moyenne {fmtF(g.moyenneDepense)}{g.moyenneCoutM2 ? ` · ${g.moyenneCoutM2} F/m²` : ""}</span></div>
                    <ul className="text-sm divide-y divide-slate-100">
                      {g.sites.map((x) => { const e = x.ecartM2Pct ?? x.ecartPct; return (
                        <li key={x.siteId} className="flex items-center justify-between py-1.5">
                          <span>{x.nom}<span className="text-xs text-slate-500"> · {fmtF(x.depense)}{x.coutM2 ? ` · ${x.coutM2} F/m²` : ""}</span></span>
                          {e == null ? <span className="text-slate-400">—</span> : <Badge tone={e >= 40 ? "red" : e > 10 ? "amber" : e < -10 ? "green" : "slate"}>{e > 0 ? "+" : ""}{e} %</Badge>}
                        </li>); })}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">Écart au coût moyen au m² des sites du même type (ou à la dépense moyenne si les surfaces manquent).</p>
            </Card>
          )}

          <Card title="Tendance 12 mois">
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={rap.tendance.map((t) => ({ ...t, label: t.mois.slice(2).replace("-", "/") }))}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(x) => `${Math.round(x / 1000)}k`} width={40} />
                  <Tooltip formatter={(x: any) => fmtF(Number(x))} />
                  <Bar dataKey="depense" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <p className="text-xs text-slate-500">Export comptable : une écriture par site (6052 Électricité HT, 4452 TVA déductible, 5711 contrepartie). Ajoutez <code>?detail=1</code> à l'URL pour une écriture par recharge. {org.type === "entreprise" ? "Le rapport est envoyé automatiquement le 1er du mois aux responsables disposant d'un e-mail." : ""}</p>
        </div>
      )}
    </>
  );
}
