import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, Field, PageTitle, Stat, fmtDate, fmtMois } from "../components/ui";
import RechargeForm from "../components/RechargeForm";
import { cumulPeriode, derniersMois, orgCourante, rechargesDeCompteur, useStore, moisDe } from "../store/useStore";
import { demander, signaler, toast } from "../components/erreur";
import { fmtF, fmtKwh, grilleEnVigueur, montantPourKwh, resteAvantTranche } from "../lib/tarif";
import { LIBELLE_REGLE, occupantDuLot } from "../lib/repartition";
import type { RegleRepartition } from "../types";

export default function CompteurDetail() {
  const { id } = useParams();
  const s = useStore();
  const org = orgCourante(s)!;
  const c = s.compteurs.find((x) => x.id === id);
  const [form, setForm] = useState(false);
  if (!c) return <p>Compteur introuvable.</p>;
  const site = s.sites.find((x) => x.id === c.siteId)!;
  const recharges = rechargesDeCompteur(s, c.id);
  const cum = cumulPeriode(s, c.id);
  const grille = grilleEnVigueur(s.grilles, new Date().toISOString());
  const reste = resteAvantTranche(cum.kwh, grille);
  const rattachements = s.rattachements.filter((r) => r.compteurId === c.id);
  const regle = s.regles.find((r) => r.compteurId === c.id)?.regle ?? "egal";
  const lotsSite = s.lots.filter((l) => l.siteId === site.id);
  const serie = derniersMois(12).map((m) => {
    const rs = recharges.filter((r) => moisDe(r.date) === m);
    return { mois: fmtMois(m), montant: rs.reduce((a, r) => a + r.montant, 0), kwh: Math.round(rs.reduce((a, r) => a + r.kwh, 0)) };
  });
  const conseil = reste.kwhRestants !== null && reste.kwhRestants > 0
    ? `Il reste ${fmtKwh(reste.kwhRestants)} en tranche ${reste.tranche} ce mois — soit ${fmtF(montantPourKwh(reste.kwhRestants, grille, { kwhCumulePeriode: cum.kwh, premiereRechargeDuMois: cum.nb === 0 }))} maximum au tarif actuel.`
    : "Tranche 3 atteinte : chaque kWh supplémentaire est au tarif le plus élevé (TVA incluse).";

  return (
    <>
      <Link to={`/parc?site=${site.id}`} className="text-sm text-slate-500 inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> {site.nom}</Link>
      <PageTitle title={c.libelle ?? c.numero} subtitle={`N° ${c.numero} · ${c.typeTarif} · ${c.puissanceKva ?? "?"} kVA${c.partage ? " · compteur partagé" : ""}`} action={<button className="btn-primary" onClick={() => setForm(true)}><Zap size={16} /> Recharger</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Cumul du mois" value={fmtKwh(cum.kwh)} hint={`${cum.nb} recharge(s) · ${fmtF(cum.montant)}`} />
        <Stat label="Tranche actuelle" value={`T${reste.tranche}`} tone={reste.tranche === 1 ? "good" : reste.tranche === 2 ? "warn" : "bad"} hint={reste.kwhRestants !== null ? `${fmtKwh(reste.kwhRestants)} avant T${reste.tranche + 1}` : "tranche maximale"} />
        <Stat label="Dernière recharge" value={recharges[0] ? fmtF(recharges[0].montant) : "—"} hint={recharges[0] ? fmtDate(recharges[0].date) : "jamais"} />
        <Stat label="12 mois" value={fmtF(recharges.reduce((a, r) => a + r.montant, 0))} hint={fmtKwh(recharges.reduce((a, r) => a + r.kwh, 0))} />
        {c.prevision && c.prevision.joursRestants != null && (
          <Stat label="Prévision de coupure" value={c.prevision.joursRestants === 0 ? "aujourd'hui" : `≈ ${c.prevision.joursRestants} j`} tone={c.prevision.joursRestants <= 2 ? "bad" : c.prevision.joursRestants <= 5 ? "warn" : "good"} hint={`solde estimé ${c.prevision.soldeEstime} kWh · ${c.prevision.kwhParJour} kWh/jour · prévoir ${c.prevision.kwhPourFinDeMois} kWh d'ici la fin du mois`} />
        )}
      </div>

      <div className="rounded-xl bg-brand-50 border border-brand-100 text-brand-900 text-sm px-4 py-3 mb-6">💡 {conseil}</div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Évolution 12 mois" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v, n) => (n === "montant" ? fmtF(Number(v)) : `${v} kWh`)} />
                <Area dataKey="montant" stroke="#0f766e" fill="#ccfbf1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Lots desservis et répartition">
          {org.type === "immo" ? (
            <div className="space-y-3">
              <Field label="Lots rattachés">
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {lotsSite.map((l) => {
                    const on = rattachements.some((r) => r.lotId === l.id);
                    const occ = occupantDuLot(l.id, s.occupants, new Date().toISOString());
                    return (
                      <label key={l.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={on} onChange={(e) => s.setRattachements(c.id, e.target.checked ? [...rattachements.map((r) => r.lotId), l.id] : rattachements.filter((r) => r.lotId !== l.id).map((r) => r.lotId))} />
                        <span className="flex-1">{l.reference} <span className="text-xs text-slate-500">{occ?.nom ?? "vacant"}</span></span>
                        {on && regle === "forfait" && <input type="number" className="input w-24 py-1" placeholder="forfait" value={rattachements.find((r) => r.lotId === l.id)?.forfait ?? ""} onChange={(e) => s.setForfait(c.id, l.id, Number(e.target.value))} />}
                      </label>
                    );
                  })}
                </div>
              </Field>
              {rattachements.length > 1 && (
                <Field label="Règle de répartition">
                  <select className="input" value={regle} onChange={(e) => s.setRegle(c.id, e.target.value as RegleRepartition).catch(signaler)}>
                    {(Object.keys(LIBELLE_REGLE) as RegleRepartition[]).map((k) => <option key={k} value={k}>{LIBELLE_REGLE[k]}</option>)}
                  </select>
                </Field>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Site : <strong>{site.nom}</strong><br />Responsable : {site.responsable ?? "—"}<br />Budget : {site.budgetMensuel ? fmtF(site.budgetMensuel) : "—"}</p>
          )}
        </Card>

        <Card title="Historique des recharges" className="lg:col-span-3">
          <table className="w-full">
            <thead><tr><th className="th pl-0">Date</th><th className="th text-right">Montant</th><th className="th text-right">kWh</th><th className="th text-right">Redevance</th><th className="th text-right">TVA</th><th className="th">Tranche</th><th className="th">Canal</th><th className="th">Réf.</th><th className="th"></th></tr></thead>
            <tbody>
              {recharges.map((r) => (
                <tr key={r.id}>
                  <td className="td pl-0 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="td text-right font-medium">{fmtF(r.montant)}</td>
                  <td className="td text-right">{fmtKwh(r.kwh)}</td>
                  <td className="td text-right text-slate-500">{r.redevance ? fmtF(r.redevance) : "—"}</td>
                  <td className="td text-right text-slate-500">{r.tva ? fmtF(r.tva) : "—"}</td>
                  <td className="td"><Badge tone={r.trancheAtteinte === 1 ? "green" : r.trancheAtteinte === 2 ? "amber" : "red"}>T{r.trancheAtteinte}</Badge></td>
                  <td className="td"><Badge tone={r.canal === "sms" ? "teal" : "slate"}>{r.canal}</Badge></td>
                  <td className="td text-xs font-mono text-slate-500">{r.referencePaiement ?? ""}</td>
                  <td className="td text-right"><button className="btn-ghost p-1 text-slate-400 hover:text-red-600" title="Annuler" onClick={async () => { const m = await demander("Annuler cette recharge", { texte: "Les quotes-parts non payées seront annulées ; celles déjà payées sont conservées.", placeholder: "Motif de l'annulation", confirmer: "Annuler la recharge" }); if (m && m.trim().length >= 3) s.annulerRecharge(r.id, m).then(() => toast("Recharge annulée", "succes"), signaler); else if (m !== null) toast("Indiquez un motif (3 caractères minimum)", "erreur"); }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {form && <RechargeForm compteurId={c.id} onClose={() => setForm(false)} />}
    </>
  );
}
