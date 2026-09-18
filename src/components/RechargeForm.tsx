import { useMemo, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Badge, Field, Modal } from "./ui";
import { compteursDeOrg, cumulPeriode, orgCourante, useStore } from "../store/useStore";
import { calculerRecharge, clePeriode, fmtF, fmtKwh, grilleEnVigueur } from "../lib/tarif";
import { repartir, LIBELLE_REGLE } from "../lib/repartition";
import { parserSms, EXEMPLE_SMS } from "../lib/sms";
import type { CanalRecharge } from "../types";

export default function RechargeForm({ compteurId: initial, onClose }: { compteurId?: string; onClose: () => void }) {
  const s = useStore();
  const org = orgCourante(s)!;
  const compteurs = compteursDeOrg(s, org.id).filter((c) => c.statut === "actif");

  const [compteurId, setCompteurId] = useState(initial ?? compteurs[0]?.id ?? "");
  const [montant, setMontant] = useState(5000);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [canal, setCanal] = useState<CanalRecharge>("manuel");
  const [code, setCode] = useState("");
  const [ref, setRef] = useState("");
  const [sms, setSms] = useState("");
  const [smsOpen, setSmsOpen] = useState(false);
  const [refacturer, setRefacturer] = useState(false);
  const [erreur, setErreur] = useState("");

  const compteur = compteurs.find((c) => c.id === compteurId);
  const site = s.sites.find((x) => x.id === compteur?.siteId);
  const dateISO = new Date(date).toISOString();
  const grille = grilleEnVigueur(s.grilles, dateISO);

  const apercu = useMemo(() => {
    if (!compteur || montant <= 0) return null;
    const periode = clePeriode(dateISO, grille.periode);
    const avant = s.recharges.filter((r) => r.compteurId === compteur.id && clePeriode(r.date, grille.periode) === periode && r.date < dateISO);
    return calculerRecharge(montant, grille, { kwhCumulePeriode: avant.reduce((a, r) => a + r.kwh, 0), premiereRechargeDuMois: avant.length === 0 });
  }, [compteur, montant, dateISO, grille, s.recharges]);

  const parts = useMemo(() => {
    if (!compteur || !(compteur.partage || refacturer)) return [];
    const rattachements = s.rattachements.filter((r) => r.compteurId === compteur.id);
    const regle = s.regles.find((r) => r.compteurId === compteur.id)?.regle ?? "egal";
    return repartir(montant, { regle, rattachements, lots: s.lots, occupants: s.occupants, releves: s.releves, dateRecharge: dateISO }).map((p) => ({
      ...p,
      lot: s.lots.find((l) => l.id === p.lotId)?.reference ?? "?",
      occupant: s.occupants.find((o) => o.id === p.occupantId)?.nom ?? "— (lot vacant)",
      regle,
    }));
  }, [compteur, refacturer, montant, dateISO, s]);

  function appliquerSms() {
    const p = parserSms(sms);
    if (p.montant) setMontant(p.montant);
    if (p.codes[0]) setCode(p.codes[0]);
    if (p.reference) setRef(p.reference);
    if (p.compteur) {
      const c = compteurs.find((x) => x.numero === p.compteur);
      if (c) setCompteurId(c.id);
      else setErreur(`Compteur ${p.compteur} inconnu dans votre parc — vérifiez ou créez-le d'abord.`);
    }
    setCanal("sms");
    setSmsOpen(false);
  }

  function valider() {
    if (!compteur) return setErreur("Choisissez un compteur.");
    if (montant < 500) return setErreur("Montant minimum 500 F.");
    s.addRecharge({ compteurId: compteur.id, date: dateISO, montant, canal, codeRecharge: code || undefined, referencePaiement: ref || undefined, refacturer });
    onClose();
  }

  return (
    <Modal title="Enregistrer une recharge" onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <button className="btn-secondary w-full justify-center" onClick={() => setSmsOpen(!smsOpen)}>
            <MessageSquareText size={16} /> Coller le SMS Wave / Orange Money
          </button>
          {smsOpen && (
            <div className="space-y-2">
              <textarea className="input h-28" value={sms} onChange={(e) => setSms(e.target.value)} placeholder={EXEMPLE_SMS} />
              <div className="flex gap-2">
                <button className="btn-primary" onClick={appliquerSms} disabled={!sms.trim()}>Analyser</button>
                <button className="btn-ghost" onClick={() => setSms(EXEMPLE_SMS)}>Exemple</button>
              </div>
            </div>
          )}

          <Field label="Compteur">
            <select className="input" value={compteurId} onChange={(e) => setCompteurId(e.target.value)}>
              {compteurs.map((c) => {
                const st = s.sites.find((x) => x.id === c.siteId);
                return <option key={c.id} value={c.id}>{st?.nom} — {c.libelle ?? c.numero} ({c.numero})</option>;
              })}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant (F CFA)">
              <input type="number" className="input" value={montant} min={500} step={500} onChange={(e) => setMontant(Number(e.target.value))} />
            </Field>
            <Field label="Date et heure">
              <input type="datetime-local" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Canal">
              <select className="input" value={canal} onChange={(e) => setCanal(e.target.value as CanalRecharge)}>
                <option value="manuel">Saisie manuelle</option>
                <option value="sms">SMS opérateur</option>
                <option value="ocr">Photo ticket</option>
              </select>
            </Field>
            <Field label="Référence paiement">
              <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="WV8H2K9Q" />
            </Field>
          </div>
          <Field label="Code de recharge (20 chiffres)">
            <input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="1234 5678 9012 3456 7890" />
          </Field>
          {compteur && !compteur.partage && org.type === "immo" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={refacturer} onChange={(e) => setRefacturer(e.target.checked)} />
              Refacturer à l'occupant du lot (générer une quote-part)
            </label>
          )}
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Aperçu du calcul — {grille.libelle}</div>
            {apercu ? (
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-slate-500">kWh crédités</dt><dd className="font-semibold text-right">{fmtKwh(apercu.kwh)}</dd>
                <dt className="text-slate-500">Redevance mensuelle</dt><dd className="text-right">{apercu.redevance ? fmtF(apercu.redevance) : <span className="text-slate-400">déjà prélevée</span>}</dd>
                <dt className="text-slate-500">Énergie HT</dt><dd className="text-right">{fmtF(apercu.energie)}</dd>
                <dt className="text-slate-500">Taxe communale</dt><dd className="text-right">{fmtF(apercu.taxeCommunale)}</dd>
                <dt className="text-slate-500">TVA</dt><dd className="text-right">{apercu.tva ? fmtF(apercu.tva) : <span className="text-slate-400">non applicable</span>}</dd>
                <dt className="text-slate-500">Tranche atteinte</dt><dd className="text-right"><Badge tone={apercu.trancheAtteinte === 1 ? "green" : apercu.trancheAtteinte === 2 ? "amber" : "red"}>Tranche {apercu.trancheAtteinte}</Badge></dd>
                {compteur && (
                  <>
                    <dt className="text-slate-500">Cumul période après</dt>
                    <dd className="text-right">{fmtKwh(cumulPeriode(s, compteur.id, dateISO).kwh + apercu.kwh)}</dd>
                  </>
                )}
              </dl>
            ) : <p className="text-sm text-slate-400">Saisissez un montant.</p>}
          </div>

          {parts.length > 0 && (
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
              <div className="text-xs font-semibold uppercase text-brand-800 mb-2">
                Répartition — {LIBELLE_REGLE[parts[0].regle]} · {site?.nom}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.lotId} className="border-t border-brand-100">
                      <td className="py-1">{p.lot}</td>
                      <td className="py-1 text-slate-600">{p.occupant}</td>
                      <td className="py-1 text-xs text-slate-500">{p.base}</td>
                      <td className="py-1 text-right font-semibold">{fmtF(p.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-brand-800 mt-2">Les quotes-parts seront créées « dues » pour chaque occupant en place.</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={valider}>Enregistrer la recharge</button>
      </div>
    </Modal>
  );
}
