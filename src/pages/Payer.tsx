import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Receipt, Smartphone } from "lucide-react";
import { api } from "../api/client";
import { fmtF } from "../lib/tarif";
import { fmtDate } from "../components/ui";

interface Page {
  occupant: { nom: string; lot: string; site: string };
  organisation: { nom: string; contact?: string | null };
  dues: { id: string; montant: number; date: string; montantRecharge: number; compteur: string }[];
  total: number;
  moyens: { moyen: "wave" | "om"; libelle: string; simulation: boolean }[];
  paiementEnCours: string | null;
}

/** Page publique (lien signé envoyé par WhatsApp / SMS) : l'occupant voit ce qu'il doit et paie par Wave ou Orange Money. */
export default function Payer() {
  const { occupantId } = useParams();
  const [params] = useSearchParams();
  const t = params.get("t") ?? "";
  const [page, setPage] = useState<Page | null>(null);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState<"wave" | "om" | null>(null);

  useEffect(() => {
    api<Page>(`/public/occupants/${occupantId}?t=${t}`, { auth: false }).then(setPage).catch((e) => setErreur(e.message));
  }, [occupantId, t]);

  async function payer(moyen: "wave" | "om") {
    setOccupe(moyen);
    try {
      const r = await api<{ url: string }>(`/public/occupants/${occupantId}/payer?t=${t}`, { body: { moyen }, auth: false });
      window.location.href = r.url;
    } catch (e: any) {
      setErreur(e.message);
      setOccupe(null);
    }
  }

  return (
    <Cadre>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {!page && !erreur && <p className="text-sm text-slate-500">Chargement…</p>}
      {page && (
        <>
          <div className="text-xs uppercase font-semibold text-slate-500">{page.organisation.nom}</div>
          <h1 className="text-xl font-bold mt-1">{page.occupant.nom}</h1>
          <div className="text-sm text-slate-500">{page.occupant.site} · {page.occupant.lot}</div>

          {page.total === 0 ? (
            <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3 text-emerald-800"><CheckCircle2 /> Vous n'avez rien à payer. Merci !</div>
          ) : (
            <>
              <div className="mt-5 rounded-xl bg-slate-50 border p-4">
                <div className="text-xs text-slate-500">Électricité à régler</div>
                <div className="text-3xl font-extrabold text-brand-700">{fmtF(page.total)}</div>
              </div>
              <table className="w-full mt-4 text-sm">
                <tbody>
                  {page.dues.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100">
                      <td className="py-2">{fmtDate(d.date)}<div className="text-xs text-slate-500">{d.compteur} · recharge {fmtF(d.montantRecharge)}</div></td>
                      <td className="py-2 text-right font-semibold whitespace-nowrap">{fmtF(d.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-5 space-y-2">
                {page.moyens.map((m) => (
                  <button key={m.moyen} disabled={!!occupe} onClick={() => payer(m.moyen)} className={`w-full rounded-xl py-3 font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${m.moyen === "wave" ? "bg-[#1dc3f0]" : "bg-[#ff7900]"}`}>
                    <Smartphone size={18} /> {occupe === m.moyen ? "Redirection…" : `Payer ${fmtF(page.total)} avec ${m.libelle}`}
                  </button>
                ))}
                {page.moyens.some((m) => m.simulation) && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">Mode démonstration : le paiement est simulé, aucun argent n'est débité.</p>}
              </div>
            </>
          )}
          {page.organisation.contact && <p className="mt-6 text-xs text-slate-500">Une question ? {page.organisation.contact}</p>}
        </>
      )}
    </Cadre>
  );
}

/** Page de retour après le fournisseur : suit le statut jusqu'à confirmation. */
export function PaiementRetour() {
  const { id } = useParams();
  const [etat, setEtat] = useState<{ statut: string; montant: number; moyen: string; quittanceUrl: string | null; urlPaiement: string | null; type: string } | null>(null);
  const [tentatives, setTentatives] = useState(0);

  useEffect(() => {
    let actif = true;
    const tick = async () => {
      try {
        const r = await api(`/public/paiements/${id}`, { auth: false });
        if (!actif) return;
        setEtat(r);
        if (r.statut === "en_attente" && tentatives < 20) setTimeout(() => setTentatives((n) => n + 1), 3000);
      } catch { /* réessai au prochain tick */ }
    };
    void tick();
    return () => { actif = false; };
  }, [id, tentatives]);

  return (
    <Cadre>
      {!etat && <p className="text-sm text-slate-500">Vérification du paiement…</p>}
      {etat?.statut === "paye" && (
        <div className="text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
          <h1 className="text-xl font-bold mt-3">Paiement confirmé</h1>
          <p className="text-slate-600 mt-1">{fmtF(etat.montant)} · {etat.moyen === "wave" ? "Wave" : "Orange Money"}</p>
          {etat.quittanceUrl && <a className="btn-primary mt-5 inline-flex" href={etat.quittanceUrl} target="_blank" rel="noreferrer"><Receipt size={16} /> Télécharger ma quittance</a>}
          {etat.type === "abonnement" && <a className="btn-primary mt-5 inline-flex" href="/parametres">Retour à KURAÑ</a>}
        </div>
      )}
      {etat?.statut === "en_attente" && (
        <div className="text-center">
          <p className="text-slate-600">Paiement en cours de confirmation par l'opérateur…</p>
          {etat.urlPaiement && tentatives > 3 && <a className="btn-secondary mt-4 inline-flex" href={etat.urlPaiement}>Reprendre le paiement</a>}
        </div>
      )}
      {(etat?.statut === "echec" || etat?.statut === "expire") && (
        <div className="text-center">
          <h1 className="text-xl font-bold">Paiement non abouti</h1>
          <p className="text-slate-600 mt-1">Aucun montant n'a été débité. Vous pouvez réessayer depuis le lien reçu.</p>
        </div>
      )}
    </Cadre>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-900 p-4 flex items-start justify-center">
      <div className="w-full max-w-md">
        <div className="text-center text-white my-6"><div className="inline-flex items-center gap-2 text-2xl font-bold"><Receipt className="text-brand-500" /> KURAÑ</div></div>
        <div className="card p-5">{children}</div>
        <p className="text-center text-xs text-slate-500 mt-4">Électricité prépayée Woyofal · processingenierie</p>
      </div>
    </div>
  );
}
