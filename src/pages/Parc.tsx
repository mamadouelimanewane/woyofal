import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Plus, Share2, Zap } from "lucide-react";
import { Badge, Card, Empty, Field, Modal, PageTitle } from "../components/ui";
import RechargeForm from "../components/RechargeForm";
import { compteursDeSite, cumulPeriode, depenseSiteMois, moisCourant, orgCourante, rechargesDeCompteur, sitesDeOrg, useStore } from "../store/useStore";
import { fmtF, fmtKwh } from "../lib/tarif";
import { occupantDuLot } from "../lib/repartition";
import type { TypeTarif } from "../types";

export default function Parc() {
  const s = useStore();
  const org = orgCourante(s)!;
  const immo = org.type === "immo";
  const [params, setParams] = useSearchParams();
  const sites = sitesDeOrg(s, org.id);
  const siteId = params.get("site") ?? "";
  const site = sites.find((x) => x.id === siteId);
  const [modal, setModal] = useState<null | "site" | "lot" | "compteur">(null);
  const [recharge, setRecharge] = useState<string | null>(null);
  const mois = moisCourant();

  return (
    <>
      <PageTitle title={immo ? "Parc immobilier" : "Sites et compteurs"} subtitle={`${sites.length} ${immo ? "immeubles / cours" : "sites"} · ${s.compteurs.filter((c) => sites.some((x) => x.id === c.siteId)).length} compteurs`} action={<button className="btn-primary" onClick={() => setModal("site")}><Plus size={16} /> {immo ? "Immeuble" : "Site"}</button>} />

      <div className="grid lg:grid-cols-[300px_1fr] gap-4">
        <div className="space-y-2">
          {sites.map((x) => {
            const dep = depenseSiteMois(s, x.id, mois);
            const ratio = x.budgetMensuel ? dep / x.budgetMensuel : null;
            return (
              <button key={x.id} onClick={() => setParams({ site: x.id })} className={`w-full text-left card p-3 hover:border-brand-500 ${x.id === siteId ? "border-brand-600 ring-1 ring-brand-500" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{x.nom}</div>
                  <span className="text-xs text-slate-500">{compteursDeSite(s, x.id).length} cpt</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{x.type} · {x.adresse}</div>
                <div className="flex items-center justify-between mt-1.5 text-sm">
                  <span className="font-medium">{fmtF(dep)}</span>
                  {ratio !== null && <Badge tone={ratio >= 1 ? "red" : ratio >= 0.8 ? "amber" : "green"}>{Math.round(ratio * 100)} % budget</Badge>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {!site ? (
            <Card><Empty><Building2 className="mx-auto mb-2 text-slate-300" size={36} />Sélectionnez {immo ? "un immeuble" : "un site"} pour voir ses compteurs.</Empty></Card>
          ) : (
            <>
              <Card
                title={<span>{site.nom} <span className="text-slate-400 font-normal text-sm">· {site.adresse}</span></span>}
                action={
                  <div className="flex gap-2">
                    {immo && <button className="btn-secondary" onClick={() => setModal("lot")}><Plus size={14} /> Lot</button>}
                    <button className="btn-secondary" onClick={() => setModal("compteur")}><Plus size={14} /> Compteur</button>
                  </div>
                }
              >
                <div className="grid sm:grid-cols-3 gap-3 text-sm mb-4">
                  <div><div className="text-xs text-slate-500">Dépense du mois</div><div className="font-semibold text-lg">{fmtF(depenseSiteMois(s, site.id, mois))}</div></div>
                  <div><div className="text-xs text-slate-500">Budget mensuel</div><div className="font-semibold text-lg">{site.budgetMensuel ? fmtF(site.budgetMensuel) : "—"}</div></div>
                  <div><div className="text-xs text-slate-500">{immo ? "Lots" : "Responsable"}</div><div className="font-semibold text-lg">{immo ? s.lots.filter((l) => l.siteId === site.id).length : site.responsable ?? "—"}</div></div>
                </div>

                <table className="w-full">
                  <thead><tr><th className="th pl-0">Compteur</th><th className="th">Lots rattachés</th><th className="th text-right">Cumul période</th><th className="th text-right">Dernière recharge</th><th className="th"></th></tr></thead>
                  <tbody>
                    {compteursDeSite(s, site.id).map((c) => {
                      const cum = cumulPeriode(s, c.id);
                      const der = rechargesDeCompteur(s, c.id)[0];
                      const lots = s.rattachements.filter((r) => r.compteurId === c.id).map((r) => s.lots.find((l) => l.id === r.lotId)?.reference).filter(Boolean);
                      return (
                        <tr key={c.id}>
                          <td className="td pl-0">
                            <Link to={`/compteur/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.libelle ?? c.numero}</Link>
                            <div className="text-xs text-slate-500 font-mono">{c.numero} · {c.typeTarif}{c.partage && <Badge tone="blue"><Share2 size={10} className="inline mr-1" />partagé</Badge>}</div>
                          </td>
                          <td className="td text-slate-600 text-xs">{lots.length ? lots.join(", ") : <span className="text-slate-400">aucun</span>}</td>
                          <td className="td text-right"><div>{fmtKwh(cum.kwh)}</div><div className="text-xs text-slate-500">{fmtF(cum.montant)} · <Badge tone={cum.kwh <= 150 ? "green" : cum.kwh <= 250 ? "amber" : "red"}>T{cum.kwh <= 150 ? 1 : cum.kwh <= 250 ? 2 : 3}</Badge></div></td>
                          <td className="td text-right text-xs text-slate-600">{der ? `${new Date(der.date).toLocaleDateString("fr-FR")} · ${fmtF(der.montant)}` : "—"}</td>
                          <td className="td text-right"><button className="btn-ghost text-brand-700" onClick={() => setRecharge(c.id)}><Zap size={14} /> Recharger</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              {immo && (
                <Card title="Lots et occupants">
                  <table className="w-full">
                    <thead><tr><th className="th pl-0">Lot</th><th className="th">Surface</th><th className="th">Occupant</th><th className="th">Compteurs</th></tr></thead>
                    <tbody>
                      {s.lots.filter((l) => l.siteId === site.id).map((l) => {
                        const occ = occupantDuLot(l.id, s.occupants, new Date().toISOString());
                        const cpts = s.rattachements.filter((r) => r.lotId === l.id).map((r) => s.compteurs.find((c) => c.id === r.compteurId)).filter(Boolean);
                        return (
                          <tr key={l.id}>
                            <td className="td pl-0 font-medium">{l.reference}{l.etage && <span className="text-xs text-slate-500"> · ét. {l.etage}</span>}</td>
                            <td className="td">{l.surfaceM2 ? `${l.surfaceM2} m²` : "—"}</td>
                            <td className="td">{occ ? <span>{occ.nom} <span className="text-xs text-slate-500">{occ.telephone}</span></span> : <Badge tone="amber">vacant</Badge>}</td>
                            <td className="td text-xs text-slate-600">{cpts.map((c) => c!.libelle ?? c!.numero).join(", ") || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {modal === "site" && <SiteModal onClose={() => setModal(null)} />}
      {modal === "lot" && site && <LotModal siteId={site.id} onClose={() => setModal(null)} />}
      {modal === "compteur" && site && <CompteurModal siteId={site.id} onClose={() => setModal(null)} />}
      {recharge && <RechargeForm compteurId={recharge} onClose={() => setRecharge(null)} />}
    </>
  );
}

function SiteModal({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const org = orgCourante(s)!;
  const [, setParams] = useSearchParams();
  const [f, setF] = useState({ nom: "", type: org.type === "immo" ? "immeuble" : "agence", adresse: "", budgetMensuel: "", responsable: "", surfaceM2: "" });
  return (
    <Modal title={org.type === "immo" ? "Nouvel immeuble / cour" : "Nouveau site"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nom"><input className="input" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><input className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></Field>
          <Field label="Surface (m²)"><input type="number" className="input" value={f.surfaceM2} onChange={(e) => setF({ ...f, surfaceM2: e.target.value })} /></Field>
        </div>
        <Field label="Adresse"><input className="input" value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget mensuel (F)"><input type="number" className="input" value={f.budgetMensuel} onChange={(e) => setF({ ...f, budgetMensuel: e.target.value })} /></Field>
          <Field label="Responsable"><input className="input" value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={!f.nom} onClick={() => {
          const site = s.addSite({ organisationId: org.id, nom: f.nom, type: f.type, adresse: f.adresse, budgetMensuel: f.budgetMensuel ? Number(f.budgetMensuel) : undefined, responsable: f.responsable || undefined, surfaceM2: f.surfaceM2 ? Number(f.surfaceM2) : undefined });
          if (org.type === "entreprise") s.addLot({ siteId: site.id, reference: "Site" });
          setParams({ site: site.id }); onClose();
        }}>Créer</button>
      </div>
    </Modal>
  );
}

function LotModal({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ reference: "", surfaceM2: "", etage: "" });
  return (
    <Modal title="Nouveau lot" onClose={onClose}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Référence"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Appt 7" /></Field>
        <Field label="Surface (m²)"><input type="number" className="input" value={f.surfaceM2} onChange={(e) => setF({ ...f, surfaceM2: e.target.value })} /></Field>
        <Field label="Étage"><input className="input" value={f.etage} onChange={(e) => setF({ ...f, etage: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={!f.reference} onClick={() => { s.addLot({ siteId, reference: f.reference, surfaceM2: f.surfaceM2 ? Number(f.surfaceM2) : undefined, etage: f.etage || undefined }); onClose(); }}>Créer</button>
      </div>
    </Modal>
  );
}

function CompteurModal({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const s = useStore();
  const lots = s.lots.filter((l) => l.siteId === siteId);
  const [f, setF] = useState({ numero: "", libelle: "", typeTarif: "DPP" as TypeTarif, puissance: "3.3" });
  const [lotIds, setLotIds] = useState<string[]>(lots.length === 1 ? [lots[0].id] : []);
  const valide = /^\d{11}$/.test(f.numero);
  return (
    <Modal title="Nouveau compteur" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Numéro de compteur (11 chiffres)" hint={f.numero && !valide ? "11 chiffres attendus" : undefined}><input className="input font-mono" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Libellé"><input className="input" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="Appt 7, Officine…" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarif"><select className="input" value={f.typeTarif} onChange={(e) => setF({ ...f, typeTarif: e.target.value as TypeTarif })}><option>DPP</option><option>DMP</option><option>PRO</option></select></Field>
          <Field label="Puissance (kVA)"><input className="input" value={f.puissance} onChange={(e) => setF({ ...f, puissance: e.target.value })} /></Field>
        </div>
        {lots.length > 0 && (
          <Field label="Lots desservis (plusieurs = compteur partagé)">
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
              {lots.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lotIds.includes(l.id)} onChange={(e) => setLotIds(e.target.checked ? [...lotIds, l.id] : lotIds.filter((x) => x !== l.id))} />{l.reference}</label>
              ))}
            </div>
          </Field>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={!valide} onClick={() => { s.addCompteur({ siteId, numero: f.numero, libelle: f.libelle || undefined, typeTarif: f.typeTarif, puissanceKva: Number(f.puissance) || undefined, statut: "actif", partage: lotIds.length > 1 }, lotIds); onClose(); }}>Créer</button>
      </div>
    </Modal>
  );
}
