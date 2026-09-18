import { useState } from "react";
import { LogOut, Plus } from "lucide-react";
import { Badge, Card, Field, Modal, PageTitle, fmtDate } from "../components/ui";
import { orgCourante, sitesDeOrg, useStore } from "../store/useStore";
import { fmtF } from "../lib/tarif";

export default function Occupants() {
  const s = useStore();
  const org = orgCourante(s)!;
  const sites = sitesDeOrg(s, org.id);
  const lots = s.lots.filter((l) => sites.some((x) => x.id === l.siteId));
  const [modal, setModal] = useState(false);
  const [sortie, setSortie] = useState<string | null>(null);
  const [voirSortis, setVoirSortis] = useState(false);

  const lignes = s.occupants
    .filter((o) => lots.some((l) => l.id === o.lotId) && (voirSortis || !o.dateSortie))
    .map((o) => {
      const lot = lots.find((l) => l.id === o.lotId)!;
      const site = sites.find((x) => x.id === lot.siteId)!;
      const qp = s.quotesParts.filter((q) => q.occupantId === o.id);
      return { o, lot, site, du: qp.filter((q) => q.statut === "due").reduce((a, q) => a + q.montant, 0), paye: qp.filter((q) => q.statut === "payee").reduce((a, q) => a + q.montant, 0) };
    })
    .sort((a, b) => b.du - a.du);

  return (
    <>
      <PageTitle title="Occupants" subtitle={`${lignes.length} occupants`} action={<button className="btn-primary" onClick={() => setModal(true)}><Plus size={16} /> Occupant</button>} />
      <Card action={<label className="text-sm flex items-center gap-2"><input type="checkbox" checked={voirSortis} onChange={(e) => setVoirSortis(e.target.checked)} /> Inclure les sortis</label>}>
        <table className="w-full">
          <thead><tr><th className="th pl-0">Occupant</th><th className="th">Lot</th><th className="th">Entrée</th><th className="th text-right">Payé</th><th className="th text-right">Solde dû</th><th className="th"></th></tr></thead>
          <tbody>
            {lignes.map(({ o, lot, site, du, paye }) => (
              <tr key={o.id} className={o.dateSortie ? "opacity-60" : ""}>
                <td className="td pl-0"><div className="font-medium">{o.nom}</div><div className="text-xs text-slate-500">{o.telephone}</div></td>
                <td className="td">{site.nom} · {lot.reference}</td>
                <td className="td text-xs">{fmtDate(o.dateEntree)}{o.dateSortie && <> → {fmtDate(o.dateSortie)}</>}</td>
                <td className="td text-right text-slate-600">{fmtF(paye)}</td>
                <td className="td text-right font-semibold">{du > 0 ? <span className="text-amber-700">{fmtF(du)}</span> : <Badge tone="green">à jour</Badge>}</td>
                <td className="td text-right">{!o.dateSortie && <button className="btn-ghost text-xs" onClick={() => setSortie(o.id)}><LogOut size={14} /> Sortie</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {modal && <OccupantModal onClose={() => setModal(false)} />}
      {sortie && <SortieModal id={sortie} onClose={() => setSortie(null)} />}
    </>
  );
}

function OccupantModal({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const org = orgCourante(s)!;
  const sites = sitesDeOrg(s, org.id);
  const lots = s.lots.filter((l) => sites.some((x) => x.id === l.siteId));
  const [f, setF] = useState({ nom: "", telephone: "", lotId: lots[0]?.id ?? "", dateEntree: new Date().toISOString().slice(0, 10), caution: "" });
  return (
    <Modal title="Nouvel occupant" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nom complet"><input className="input" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone"><input className="input" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} placeholder="77 000 00 00" /></Field>
          <Field label="Lot"><select className="input" value={f.lotId} onChange={(e) => setF({ ...f, lotId: e.target.value })}>{lots.map((l) => <option key={l.id} value={l.id}>{sites.find((x) => x.id === l.siteId)?.nom} · {l.reference}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date d'entrée"><input type="date" className="input" value={f.dateEntree} onChange={(e) => setF({ ...f, dateEntree: e.target.value })} /></Field>
          <Field label="Caution électricité (F)"><input type="number" className="input" value={f.caution} onChange={(e) => setF({ ...f, caution: e.target.value })} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={!f.nom || !f.lotId} onClick={() => { s.addOccupant({ nom: f.nom, telephone: f.telephone, lotId: f.lotId, dateEntree: f.dateEntree, caution: f.caution ? Number(f.caution) : undefined }); onClose(); }}>Créer</button>
      </div>
    </Modal>
  );
}

function SortieModal({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStore();
  const o = s.occupants.find((x) => x.id === id)!;
  const du = s.quotesParts.filter((q) => q.occupantId === id && q.statut === "due").reduce((a, q) => a + q.montant, 0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Modal title={`Sortie de ${o.nom}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Date de sortie"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="rounded-lg bg-slate-50 border p-3 text-sm">
          <div className="flex justify-between"><span>Solde dû</span><strong>{fmtF(du)}</strong></div>
          <div className="flex justify-between"><span>Caution détenue</span><strong>{fmtF(o.caution ?? 0)}</strong></div>
          <div className="flex justify-between border-t mt-2 pt-2"><span>{(o.caution ?? 0) - du >= 0 ? "À restituer" : "Reste à payer"}</span><strong>{fmtF(Math.abs((o.caution ?? 0) - du))}</strong></div>
        </div>
        <p className="text-xs text-slate-500">Les quotes-parts futures de ce lot ne lui seront plus attribuées après cette date.</p>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={() => { s.sortieOccupant(id, date); onClose(); }}>Confirmer la sortie</button>
      </div>
    </Modal>
  );
}
