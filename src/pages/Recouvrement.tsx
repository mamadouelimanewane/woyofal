import { useState } from "react";
import { CheckCircle2, FileText, MessageCircle, XCircle } from "lucide-react";
import { Badge, Card, PageTitle, Stat, fmtDate } from "../components/ui";
import { moisDe, moisCourant, orgCourante, sitesDeOrg, useStore } from "../store/useStore";
import { signaler } from "../components/erreur";
import { api } from "../api/client";
import { fmtF } from "../lib/tarif";

export default function Recouvrement() {
  const s = useStore();
  const org = orgCourante(s)!;
  const sites = sitesDeOrg(s, org.id);
  const lotIds = new Set(s.lots.filter((l) => sites.some((x) => x.id === l.siteId)).map((l) => l.id));
  const [filtre, setFiltre] = useState<"due" | "payee" | "toutes">("due");

  const lignes = s.quotesParts
    .filter((q) => lotIds.has(q.lotId) && (filtre === "toutes" || q.statut === filtre))
    .map((q) => {
      const r = s.recharges.find((x) => x.id === q.rechargeId);
      const c = s.compteurs.find((x) => x.id === r?.compteurId);
      const lot = s.lots.find((x) => x.id === q.lotId);
      const site = sites.find((x) => x.id === lot?.siteId);
      const occ = s.occupants.find((x) => x.id === q.occupantId);
      const age = r ? Math.floor((Date.now() - new Date(r.date).getTime()) / 86400000) : 0;
      return { q, r, c, lot, site, occ, age };
    })
    .sort((a, b) => ((a.r?.date ?? "") < (b.r?.date ?? "") ? 1 : -1));

  const totalDu = s.quotesParts.filter((q) => lotIds.has(q.lotId) && q.statut === "due").reduce((a, q) => a + q.montant, 0);
  const enRetard = lignes.filter((l) => l.q.statut === "due" && l.age > 7);
  const mois = moisCourant();
  const encaisseMois = s.quotesParts.filter((q) => lotIds.has(q.lotId) && q.statut === "payee" && q.datePaiement && moisDe(q.datePaiement) === mois).reduce((a, q) => a + q.montant, 0);

  function relance(l: (typeof lignes)[number]) {
    const msg = `Bonjour ${l.occ?.nom}, votre part d'électricité (${l.site?.nom}, ${l.lot?.reference}) du ${l.r ? fmtDate(l.r.date) : ""} s'élève à ${fmtF(l.q.montant)}. Merci de régler par Wave ou Orange Money. — ${org.nom}`;
    window.open(`https://wa.me/221${(l.occ?.telephone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function quittance(l: (typeof lignes)[number]) {
    if (!l.q.quittanceNumero) return alert("Paiement enregistré avant la numérotation des quittances : pas de PDF disponible.");
    api(`/quittances/${encodeURIComponent(l.q.quittanceNumero)}`).then((d) => window.open(d.url, "_blank"), signaler);
  }

  return (
    <>
      <PageTitle title="Recouvrement" subtitle="Quotes-parts des compteurs partagés et refacturations" />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Total dû" value={fmtF(totalDu)} tone={totalDu ? "warn" : "good"} />
        <Stat label="En retard (> 7 j)" value={enRetard.length} hint={fmtF(enRetard.reduce((a, l) => a + l.q.montant, 0))} tone={enRetard.length ? "bad" : "good"} />
        <Stat label="Encaissé ce mois" value={fmtF(encaisseMois)} tone="good" />
      </div>
      <Card action={
        <div className="flex gap-1">
          {(["due", "payee", "toutes"] as const).map((f) => <button key={f} className={`btn text-xs ${filtre === f ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"}`} onClick={() => setFiltre(f)}>{f === "due" ? "Dues" : f === "payee" ? "Payées" : "Toutes"}</button>)}
        </div>
      }>
        <table className="w-full">
          <thead><tr><th className="th pl-0">Occupant</th><th className="th">Lot</th><th className="th">Recharge</th><th className="th text-right">Montant</th><th className="th">Statut</th><th className="th"></th></tr></thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.q.id}>
                <td className="td pl-0"><div className="font-medium">{l.occ?.nom ?? "—"}</div><div className="text-xs text-slate-500">{l.occ?.telephone}</div></td>
                <td className="td text-sm">{l.site?.nom}<div className="text-xs text-slate-500">{l.lot?.reference} · {l.c?.libelle}</div></td>
                <td className="td text-xs">{l.r ? <>{fmtDate(l.r.date)}<div className="text-slate-500">{fmtF(l.r.montant)} total</div></> : "—"}</td>
                <td className="td text-right font-semibold">{fmtF(l.q.montant)}</td>
                <td className="td">
                  {l.q.statut === "due" ? <Badge tone={l.age > 7 ? "red" : "amber"}>due · {l.age} j</Badge> : l.q.statut === "payee" ? <Badge tone="green">payée {l.q.moyenPaiement}</Badge> : <Badge>annulée</Badge>}
                </td>
                <td className="td text-right whitespace-nowrap">
                  {l.q.statut === "due" ? (
                    <>
                      <button className="btn-ghost p-1.5 text-emerald-700" title="Relancer WhatsApp" onClick={() => relance(l)}><MessageCircle size={16} /></button>
                      <button className="btn-ghost p-1.5 text-brand-700" title="Marquer payée" onClick={() => { const m = prompt("Moyen de paiement (Wave, Orange Money, espèces, virement) :", "Wave"); if (m) s.payerQuotePart(l.q.id, m).then((r) => alert(`Paiement enregistré — quittance ${r.quittanceNumero}`), signaler); }}><CheckCircle2 size={16} /></button>
                      <button className="btn-ghost p-1.5 text-slate-400 hover:text-red-600" title="Annuler" onClick={() => confirm("Annuler cette quote-part ?") && s.annulerQuotePart(l.q.id).catch(signaler)}><XCircle size={16} /></button>
                    </>
                  ) : l.q.statut === "payee" ? (
                    <button className="btn-ghost p-1.5" title="Quittance" onClick={() => quittance(l)}><FileText size={16} /></button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lignes.length === 0 && <p className="text-center text-sm text-slate-500 py-6">Rien à afficher.</p>}
      </Card>
    </>
  );
}
