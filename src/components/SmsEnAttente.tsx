import { useEffect, useState } from "react";
import { Inbox, Link2, X } from "lucide-react";
import { Badge, Card, Field, Modal, fmtDate } from "./ui";
import { api } from "../api/client";
import { signaler } from "./erreur";
import { compteursDeOrg, orgCourante, useStore } from "../store/useStore";
import { fmtF } from "../lib/tarif";

interface SmsEntrant { id: string; brut: string; expediteur?: string; analyse: { operateur?: string; montant?: number; compteur?: string; kwh?: number }; recuLe: string }

/** SMS reçus par l'ingestion automatique dont le compteur n'a pas été reconnu (EF-RECH-05). */
export default function SmsEnAttente() {
  const s = useStore();
  const org = orgCourante(s)!;
  const [liste, setListe] = useState<SmsEntrant[]>([]);
  const [rattacher, setRattacher] = useState<SmsEntrant | null>(null);

  const charger = () => api<SmsEntrant[]>("/sms-entrants").then(setListe).catch(() => setListe([]));
  useEffect(() => { void charger(); }, [s.smsEnAttente]);

  if (liste.length === 0) return null;
  return (
    <>
      <Card title={<span className="flex items-center gap-2"><Inbox size={16} className="text-amber-600" /> SMS en attente de rattachement <Badge tone="amber">{liste.length}</Badge></span>} className="mb-4 border-amber-200">
        <p className="text-xs text-slate-500 mb-3">Reçus par la capture automatique, mais le numéro de compteur n'a pas été reconnu dans votre parc. Rattachez-les à un compteur ou ignorez-les.</p>
        <ul className="divide-y divide-slate-100">
          {liste.map((m) => (
            <li key={m.id} className="py-2 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-60">
                <div className="text-sm">{m.brut}</div>
                <div className="text-xs text-slate-500 mt-0.5">{fmtDate(m.recuLe)} · {m.analyse.operateur ?? "opérateur inconnu"} {m.analyse.montant ? `· ${fmtF(m.analyse.montant)}` : ""} {m.analyse.compteur ? `· compteur ${m.analyse.compteur}` : "· compteur non lu"}</div>
              </div>
              <button className="btn-secondary" onClick={() => setRattacher(m)}><Link2 size={14} /> Rattacher</button>
              <button className="btn-ghost text-slate-400 hover:text-red-600" title="Ignorer" onClick={() => api(`/sms-entrants/${m.id}/ignorer`, { body: {} }).then(charger, signaler)}><X size={16} /></button>
            </li>
          ))}
        </ul>
      </Card>
      {rattacher && <RattacherModal sms={rattacher} compteurs={compteursDeOrg(s, org.id)} onClose={() => { setRattacher(null); void charger(); void s.charger(); }} />}
    </>
  );
}

function RattacherModal({ sms, compteurs, onClose }: { sms: SmsEntrant; compteurs: ReturnType<typeof compteursDeOrg>; onClose: () => void }) {
  const s = useStore();
  const [compteurId, setCompteurId] = useState(compteurs[0]?.id ?? "");
  const [montant, setMontant] = useState(sms.analyse.montant ? String(Math.round(sms.analyse.montant)) : "");
  const [creer, setCreer] = useState(false);
  const [siteId, setSiteId] = useState(s.sites[0]?.id ?? "");
  const [occupe, setOccupe] = useState(false);
  const numero = sms.analyse.compteur;

  async function valider() {
    setOccupe(true);
    try {
      let cible = compteurId;
      if (creer && numero) {
        const c = await s.addCompteur({ siteId, numero, libelle: undefined, typeTarif: "DPP", statut: "actif", partage: false }, []);
        cible = c.id;
      }
      await api(`/sms-entrants/${sms.id}/rattacher`, { body: { compteurId: cible, montant: montant ? Number(montant) : undefined } });
      onClose();
    } catch (e) { signaler(e); } finally { setOccupe(false); }
  }

  return (
    <Modal title="Rattacher le SMS à un compteur" onClose={onClose}>
      <div className="rounded-lg bg-slate-50 border p-3 text-sm mb-4">{sms.brut}</div>
      <div className="space-y-3">
        {numero && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={creer} onChange={(e) => setCreer(e.target.checked)} /> Créer le compteur <span className="font-mono">{numero}</span> dans mon parc</label>
        )}
        {creer ? (
          <Field label="Site du nouveau compteur"><select className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>{s.sites.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></Field>
        ) : (
          <Field label="Compteur existant"><select className="input" value={compteurId} onChange={(e) => setCompteurId(e.target.value)}>{compteurs.map((c) => <option key={c.id} value={c.id}>{s.sites.find((x) => x.id === c.siteId)?.nom} — {c.libelle ?? c.numero} ({c.numero})</option>)}</select></Field>
        )}
        <Field label="Montant (F CFA)" hint={sms.analyse.montant ? undefined : "Montant non lu dans le SMS : saisissez-le"}><input type="number" className="input" value={montant} onChange={(e) => setMontant(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={occupe || !montant || (!creer && !compteurId)} onClick={valider}>{occupe ? "…" : "Enregistrer la recharge"}</button>
      </div>
    </Modal>
  );
}
