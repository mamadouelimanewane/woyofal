import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Plus } from "lucide-react";
import { Badge, Card, PageTitle, fmtDate } from "../components/ui";
import RechargeForm from "../components/RechargeForm";
import SmsEnAttente from "../components/SmsEnAttente";
import { compteursDeOrg, derniersMois, orgCourante, rechargesDeOrg, sitesDeOrg, useStore, moisDe } from "../store/useStore";
import { fmtF, fmtKwh } from "../lib/tarif";

export default function Recharges() {
  const s = useStore();
  const org = orgCourante(s)!;
  const [form, setForm] = useState(false);
  const [mois, setMois] = useState("");
  const [siteId, setSiteId] = useState("");
  const [q, setQ] = useState("");
  const compteurs = compteursDeOrg(s, org.id);
  const sites = sitesDeOrg(s, org.id);

  const lignes = useMemo(() => {
    return rechargesDeOrg(s, org.id)
      .map((r) => {
        const c = compteurs.find((x) => x.id === r.compteurId);
        const site = sites.find((x) => x.id === c?.siteId);
        return { r, c, site };
      })
      .filter(({ r, c, site }) => (!mois || moisDe(r.date) === mois) && (!siteId || site?.id === siteId) && (!q || `${c?.numero} ${c?.libelle} ${r.referencePaiement}`.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => (a.r.date < b.r.date ? 1 : -1));
  }, [s, org.id, compteurs, sites, mois, siteId, q]);

  const total = lignes.reduce((a, l) => a + l.r.montant, 0);
  const totalKwh = lignes.reduce((a, l) => a + l.r.kwh, 0);

  function exporter() {
    const rows = [["Date", "Site", "Compteur", "Numero", "Montant", "kWh", "Redevance", "Energie", "Taxe", "TVA", "Tranche", "Canal", "Reference"]];
    for (const { r, c, site } of lignes) rows.push([r.date, site?.nom ?? "", c?.libelle ?? "", c?.numero ?? "", String(r.montant), String(r.kwh), String(r.redevance), String(r.energie), String(r.taxeCommunale), String(r.tva), String(r.trancheAtteinte), r.canal, r.referencePaiement ?? ""]);
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `kuran-recharges-${mois || "tout"}.csv`;
    a.click();
  }

  return (
    <>
      <PageTitle title="Recharges" subtitle={`${lignes.length} recharges · ${fmtF(total)} · ${fmtKwh(totalKwh)}`} action={
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exporter}><Download size={16} /> Export CSV</button>
          <button className="btn-primary" onClick={() => setForm(true)}><Plus size={16} /> Recharge</button>
        </div>
      } />
      <SmsEnAttente />
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <select className="input w-auto" value={mois} onChange={(e) => setMois(e.target.value)}>
            <option value="">Tous les mois</option>
            {derniersMois(12).reverse().map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="input w-auto" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Tous les sites</option>
            {sites.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
          <input className="input w-56" placeholder="N° compteur, libellé, référence…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th pl-0">Date</th><th className="th">Site</th><th className="th">Compteur</th><th className="th text-right">Montant</th><th className="th text-right">kWh</th><th className="th">Tranche</th><th className="th">Canal</th><th className="th">Saisi par</th></tr></thead>
            <tbody>
              {lignes.map(({ r, c, site }) => (
                <tr key={r.id}>
                  <td className="td pl-0 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="td">{site?.nom}</td>
                  <td className="td"><Link to={`/compteur/${c?.id}`} className="text-brand-700 hover:underline">{c?.libelle ?? c?.numero}</Link></td>
                  <td className="td text-right font-medium">{fmtF(r.montant)}</td>
                  <td className="td text-right">{fmtKwh(r.kwh)}</td>
                  <td className="td"><Badge tone={r.trancheAtteinte === 1 ? "green" : r.trancheAtteinte === 2 ? "amber" : "red"}>T{r.trancheAtteinte}</Badge></td>
                  <td className="td"><Badge tone={r.canal === "sms" ? "teal" : "slate"}>{r.canal}</Badge></td>
                  <td className="td text-xs text-slate-500">{s.utilisateurs.find((u) => u.id === r.saisiPar)?.nom ?? r.saisiPar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {form && <RechargeForm onClose={() => setForm(false)} />}
    </>
  );
}
