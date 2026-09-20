import { useEffect, useState } from "react";
import { Copy, CreditCard, KeyRound, RefreshCw, UserPlus } from "lucide-react";
import { Badge, Card, Field, Modal, PageTitle } from "../components/ui";
import { compteursDeOrg, orgCourante, sitesDeOrg, userCourant, useStore } from "../store/useStore";
import { api } from "../api/client";
import { confirmer, signaler, toast } from "../components/erreur";

const PLAN: Record<string, string> = { gratuit: "Gratuit — jusqu'à 5 compteurs", starter: "Starter — 10 000 F/mois", immo: "Immo — 600 F/compteur/mois", entreprise: "Entreprise — 3 000 F/site/mois", groupe: "Groupe — sur devis" };
const ROLE: Record<string, string> = { admin: "Administrateur", gestionnaire: "Gestionnaire", agent: "Agent de site", lecture: "Lecture seule" };

export default function Parametres() {
  const s = useStore();
  const org = orgCourante(s)!;
  const moi = userCourant(s)!;
  const nbCompteurs = compteursDeOrg(s, org.id).filter((c) => c.statut === "actif").length;
  const nbSites = sitesDeOrg(s, org.id).length;
  const [cleApi, setCleApi] = useState<string | null>(null);
  const [invitation, setInvitation] = useState(false);
  const admin = moi.role === "admin" || moi.role === "superadmin";

  useEffect(() => {
    if (admin) api("/auth/me").then((m) => setCleApi(m.organisation?.cleApi ?? null)).catch(() => undefined);
  }, [admin]);

  const finEssai = org.finEssai ? new Date(org.finEssai) : null;
  const joursEssai = finEssai ? Math.max(0, Math.ceil((finEssai.getTime() - Date.now()) / 86400000)) : null;

  return (
    <>
      <PageTitle title="Paramètres" />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Organisation">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Nom</dt><dd className="text-right font-medium">{org.nom}</dd>
            <dt className="text-slate-500">Édition</dt><dd className="text-right"><Badge tone="teal">{org.type === "immo" ? "Immo" : "Entreprise"}</Badge></dd>
            <dt className="text-slate-500">NINEA</dt><dd className="text-right font-mono">{org.ninea ?? "—"}</dd>
            <dt className="text-slate-500">Plan</dt><dd className="text-right">{PLAN[org.plan] ?? org.plan}</dd>
            <dt className="text-slate-500">Statut</dt><dd className="text-right">{org.statut === "essai" ? <Badge tone="amber">Essai{joursEssai != null ? ` · ${joursEssai} j restants` : ""}</Badge> : org.statut === "lecture_seule" ? <Badge tone="red">Lecture seule</Badge> : <Badge tone="green">Actif</Badge>}</dd>
            <dt className="text-slate-500">Compteurs actifs / sites</dt><dd className="text-right">{nbCompteurs} / {nbSites}</dd>
          </dl>
        </Card>

        {admin && <AbonnementCard />}

        <Card title="Utilisateurs" action={admin && <button className="btn-secondary" onClick={() => setInvitation(true)}><UserPlus size={16} /> Inviter</button>}>
          <ul className="text-sm divide-y divide-slate-100">
            {s.utilisateurs.map((u) => (
              <li key={u.id} className="flex justify-between py-2"><span>{u.nom} <span className="text-xs text-slate-500">{u.telephone}</span></span><Badge>{ROLE[u.role] ?? u.role}</Badge></li>
            ))}
          </ul>
        </Card>

        {admin && (
          <Card title="Capture automatique des SMS" className="lg:col-span-2">
            <p className="text-sm text-slate-600 mb-3">
              Chaque SMS de confirmation Wave / Orange Money / Free Money peut être transmis automatiquement à KURAÑ par une application de transfert de SMS sur le téléphone qui recharge.
              Configurez-la pour envoyer un <code className="font-mono text-xs">POST</code> vers <code className="font-mono text-xs">{location.origin}/api/recharges/sms</code> avec l'en-tête <code className="font-mono text-xs">X-Api-Key</code> ci-dessous et le corps <code className="font-mono text-xs">{"{ \"texte\": \"…\" }"}</code>.
              Les SMS dont le compteur n'est pas reconnu attendent dans la page Recharges.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <KeyRound size={16} className="text-slate-400" />
              <code className="font-mono text-sm bg-slate-100 rounded px-2 py-1 select-all">{cleApi ?? "…"}</code>
              <button className="btn-ghost" title="Copier" onClick={() => cleApi && navigator.clipboard?.writeText(cleApi)}><Copy size={16} /></button>
              <button className="btn-ghost" title="Régénérer (l'ancienne clé cesse de fonctionner)" onClick={async () => { if (await confirmer("Régénérer la clé d'organisation ?", "L'ancienne clé cessera de fonctionner immédiatement : les applications de transfert de SMS devront être reconfigurées.", { confirmer: "Régénérer" })) api("/organisations/me/cle-api", { body: {} }).then((r) => { setCleApi(r.cleApi); toast("Nouvelle clé générée", "succes"); }, signaler); }}><RefreshCw size={16} /></button>
            </div>
          </Card>
        )}
      </div>
      {invitation && <InvitationModal onClose={() => setInvitation(false)} />}
    </>
  );
}

interface Abo {
  plan: string; planEffectif: string; planRecommande: string; statut: string; echeance: string | null;
  usage: { nbCompteurs: number; nbSites: number }; mensuel: number; annuel: number; detail: string;
  moyens: { moyen: "wave" | "om"; libelle: string; simulation: boolean }[];
  factures: { id: string; numero: string; periode: string; montant: number; statut: string; creeLe: string }[];
  paiementEnAttente: { id: string; url: string } | null;
}

/** Abonnement : montant selon l'usage, paiement Wave / Orange Money, factures. */
function AbonnementCard() {
  const s = useStore();
  const [abo, setAbo] = useState<Abo | null>(null);
  const [periodicite, setPeriodicite] = useState<"mensuel" | "annuel">("mensuel");
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { api<Abo>("/abonnement").then(setAbo).catch(() => undefined); }, [s.organisations]);
  if (!abo) return null;
  const montant = periodicite === "annuel" ? abo.annuel : abo.mensuel;

  async function payer(moyen: "wave" | "om") {
    setOccupe(true);
    try {
      const r = await api<{ url: string }>("/abonnement/payer", { body: { moyen, periodicite, plan: abo!.planEffectif === "gratuit" || abo!.planEffectif === "groupe" ? undefined : abo!.planEffectif } });
      window.location.href = r.url;
    } catch (e) { signaler(e); setOccupe(false); }
  }

  return (
    <Card title="Abonnement" className="lg:col-span-2">
      <div className="grid md:grid-cols-2 gap-5">
        <div className="text-sm space-y-2">
          <div className="flex justify-between"><span className="text-slate-500">Plan</span><span className="font-medium">{PLAN[abo.planEffectif] ?? abo.planEffectif}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Usage</span><span>{abo.usage.nbCompteurs} compteurs · {abo.usage.nbSites} sites</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Calcul</span><span className="text-right">{abo.detail}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Échéance</span><span>{abo.echeance ? new Date(abo.echeance).toLocaleDateString("fr-FR") : "—"}</span></div>
          {abo.planRecommande !== abo.plan && abo.plan === "gratuit" && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">Votre parc dépasse le plan gratuit : le plan <strong>{abo.planRecommande}</strong> s'applique à la fin de l'essai.</p>}
          {abo.factures.length > 0 && (
            <div className="pt-2">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Factures</div>
              <ul className="divide-y divide-slate-100">
                {abo.factures.map((f) => <li key={f.id} className="flex justify-between py-1.5"><span className="font-mono text-xs">{f.numero}</span><span className="text-xs text-slate-500">{f.periode}</span><span className="font-medium">{f.montant.toLocaleString("fr-FR")} F</span></li>)}
              </ul>
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-slate-50 p-4">
          {abo.mensuel > 0 ? (
            <>
              <div className="flex gap-1 mb-3">
                {(["mensuel", "annuel"] as const).map((p) => <button key={p} className={`btn text-xs ${periodicite === p ? "bg-brand-700 text-white" : "bg-white text-slate-600 border"}`} onClick={() => setPeriodicite(p)}>{p === "mensuel" ? "Mensuel" : "Annuel (−15 %)"}</button>)}
              </div>
              <div className="text-3xl font-extrabold text-brand-700">{montant.toLocaleString("fr-FR")} F <span className="text-sm font-normal text-slate-500">/ {periodicite === "annuel" ? "an" : "mois"}</span></div>
              <div className="mt-3 space-y-2">
                {abo.moyens.map((m) => (
                  <button key={m.moyen} disabled={occupe} onClick={() => payer(m.moyen)} className={`w-full rounded-lg py-2.5 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${m.moyen === "wave" ? "bg-[#1dc3f0]" : "bg-[#ff7900]"}`}><CreditCard size={16} /> Payer avec {m.libelle}</button>
                ))}
              </div>
              {abo.paiementEnAttente && <a className="block mt-2 text-xs text-brand-700 underline" href={abo.paiementEnAttente.url}>Un paiement est en cours : le reprendre</a>}
              {abo.moyens.some((m) => m.simulation) && <p className="mt-2 text-xs text-amber-700">Mode démonstration : paiement simulé.</p>}
            </>
          ) : (
            <p className="text-sm text-slate-600">Plan gratuit : aucun paiement nécessaire jusqu'à 5 compteurs.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function InvitationModal({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ nom: "", telephone: "", role: "gestionnaire" });
  return (
    <Modal title="Inviter un utilisateur" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nom"><input className="input" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <Field label="Téléphone (connexion par code SMS)"><input className="input" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} placeholder="77 000 00 00" /></Field>
        <Field label="Rôle">
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={!f.nom || f.telephone.replace(/\D/g, "").length < 9} onClick={() => api("/utilisateurs", { body: f }).then(() => s.charger()).then(onClose, signaler)}>Inviter</button>
      </div>
    </Modal>
  );
}
