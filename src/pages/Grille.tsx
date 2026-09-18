import { useState } from "react";
import { Card, Field, PageTitle } from "../components/ui";
import { useStore } from "../store/useStore";
import { GRILLE_2026, calculerRecharge, fmtF, fmtKwh, grilleEnVigueur } from "../lib/tarif";

export default function Grille() {
  const s = useStore();
  const g = grilleEnVigueur(s.grilles, new Date().toISOString());
  const [montant, setMontant] = useState(10000);
  const [cumul, setCumul] = useState(0);
  const [premiere, setPremiere] = useState(true);
  const sim = calculerRecharge(montant, g, { kwhCumulePeriode: cumul, premiereRechargeDuMois: premiere });

  return (
    <>
      <PageTitle title="Grille tarifaire" subtitle="Versionnée par date d'effet — un changement de tarif ne recalcule jamais le passé" />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={g.libelle}>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Tranche 1 (0 – {g.seuilT1} kWh)</dt><dd className="text-right font-medium">{g.tranche1} F/kWh</dd>
            <dt className="text-slate-500">Tranche 2 ({g.seuilT1} – {g.seuilT2} kWh)</dt><dd className="text-right font-medium">{g.tranche2} F/kWh</dd>
            <dt className="text-slate-500">Tranche 3 (&gt; {g.seuilT2} kWh)</dt><dd className="text-right font-medium">{g.tranche3} F/kWh</dd>
            <dt className="text-slate-500">Redevance mensuelle</dt><dd className="text-right font-medium">{fmtF(g.redevance)}</dd>
            <dt className="text-slate-500">TVA</dt><dd className="text-right font-medium">{g.tauxTva * 100} % au-delà de {g.seuilTva} kWh</dd>
            <dt className="text-slate-500">Taxe communale</dt><dd className="text-right font-medium">{(g.tauxTaxeCommunale * 100).toFixed(1)} % (indicatif)</dd>
            <dt className="text-slate-500">Période de remise à zéro</dt><dd className="text-right font-medium">{g.periode}</dd>
            <dt className="text-slate-500">Date d'effet</dt><dd className="text-right font-medium">{g.dateEffet}</dd>
          </dl>
          <p className="text-xs text-slate-500 mt-4">Source : grille CRSE applicable au 1er janvier 2026. La redevance ({GRILLE_2026.redevance} F = 450 location + 705 entretien) est prélevée à la première recharge du mois. À vérifier à chaque publication CRSE.</p>
          {s.grilles.length > 1 && <p className="text-xs text-slate-500 mt-2">{s.grilles.length} versions enregistrées.</p>}
        </Card>

        <Card title="Simulateur">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Montant (F)"><input type="number" className="input" value={montant} step={500} onChange={(e) => setMontant(Number(e.target.value))} /></Field>
            <Field label="kWh déjà achetés ce mois"><input type="number" className="input" value={cumul} onChange={(e) => setCumul(Number(e.target.value))} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm mb-4"><input type="checkbox" checked={premiere} onChange={(e) => setPremiere(e.target.checked)} /> Première recharge du mois (redevance)</label>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm rounded-lg bg-slate-50 border p-3">
            <dt className="text-slate-500">kWh crédités</dt><dd className="text-right font-bold text-lg">{fmtKwh(sim.kwh)}</dd>
            <dt className="text-slate-500">Redevance</dt><dd className="text-right">{fmtF(sim.redevance)}</dd>
            <dt className="text-slate-500">Énergie HT</dt><dd className="text-right">{fmtF(sim.energie)}</dd>
            <dt className="text-slate-500">Taxe communale</dt><dd className="text-right">{fmtF(sim.taxeCommunale)}</dd>
            <dt className="text-slate-500">TVA</dt><dd className="text-right">{fmtF(sim.tva)}</dd>
            <dt className="text-slate-500">Prix moyen</dt><dd className="text-right">{sim.kwh ? `${Math.round(montant / sim.kwh)} F/kWh` : "—"}</dd>
            <dt className="text-slate-500">Tranche atteinte</dt><dd className="text-right">T{sim.trancheAtteinte}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
