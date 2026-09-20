import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Bell, BellOff, CheckCircle2, FileText, History, PlusCircle, Receipt, Smartphone, Zap } from "lucide-react";
import { api } from "../api/client";
import { fmtF, fmtKwh } from "../lib/tarif";
import { fmtDate } from "../components/ui";
import { parserSms } from "../lib/sms";

interface Ligne { id: string; montant: number; statut: string; date: string; montantRecharge: number; kwh: number; compteur: string; datePaiement?: string | null; moyen?: string | null; quittanceNumero?: string | null }
interface Portail {
  occupant: { nom: string; lot: string; site: string; dateEntree: string; dateSortie?: string | null; caution?: number | null; consentementNotifications: boolean };
  organisation: { nom: string; contact?: string | null };
  dues: Ligne[]; total: number; historique: Ligne[];
  paiements: { id: string; date: string; montant: number; moyen: string; quittanceNumero: string; quittanceUrl?: string | null }[];
  compteurs: { id: string; numero: string; libelle?: string | null; partage: boolean; regle: string; recharges: { id: string; date: string; montant: number; kwh: number; maPart: number | null }[] }[];
  declarations: { id: string; date: string; statut: string; analyse: { montant?: number; kwh?: number; date?: string } }[];
  moyens: { moyen: "wave" | "om"; libelle: string; simulation: boolean }[];
  paiementEnCours: string | null;
  consommation: { mois: string; maPart: number; moyenneAutresLots: number | null; nbLots: number }[];
}

type Onglet = "payer" | "historique" | "compteur" | "declarer";
type Langue = "fr" | "wo";
const T: Record<Langue, Record<string, string>> = {
  fr: { payer: "À payer", historique: "Historique", compteur: "Mon compteur", declarer: "Déclarer", rien: "Vous n'avez rien à payer. Merci !", aRegler: "Électricité à régler", payerAvec: "Payer {m} avec {op}", redirection: "Redirection…", demo: "Mode démonstration : le paiement est simulé, aucun argent n'est débité.", mesPaiements: "Mes paiements", quittance: "Quittance", aucunPaiement: "Aucun paiement enregistré.", reglees: "Mes quotes-parts réglées ou annulées", recharge: "Recharge", montant: "Montant", maPart: "Ma part", conso: "Ma consommation sur 6 mois", moyenne: "moyenne des autres lots", notifs: "Notifications WhatsApp / SMS", notifsSous: "Quotes-parts, relances, quittances", actives: "Activées", desactivees: "Désactivées", signaler: "Signaler un problème", envoyer: "Envoyer", question: "Une question ?", sorti: "sorti le", compteurPartage: "Compteur partagé · répartition", individuel: "Compteur individuel" },
  wo: { payer: "Lu war a fey", historique: "Li weesu", compteur: "Sama compteur", declarer: "Xamle", rien: "Amuloo dara loo war a fey. Jërëjëf !", aRegler: "Kurañ bi nga war a fey", payerAvec: "Fey {m} ak {op}", redirection: "Ñu ngi yóbbu la…", demo: "Jataay : fey bi du dëgg, amul xaalis bu génn.", mesPaiements: "Sama fey yi", quittance: "Quittance", aucunPaiement: "Amul fey bu bind.", reglees: "Sama wàll yi fey walla yi ñu dindi", recharge: "Recharge", montant: "Xaalis", maPart: "Sama wàll", conso: "Sama jëfandikoo ci 6 weer", moyenne: "moyenne bu ñeneen ñi", notifs: "Xibaar WhatsApp / SMS", notifsSous: "Wàll, fàttali, quittance", actives: "Ubbi na", desactivees: "Tëj na", signaler: "Xamle jafe-jafe", envoyer: "Yónnee", question: "Laaj ?", sorti: "génn na", compteurPartage: "Compteur bu ñu bokk · séddale", individuel: "Compteur bu kenn" },
};
const MOYEN: Record<string, string> = { wave: "Wave", om: "Orange Money", especes: "espèces", virement: "virement", versuspay: "VersusPay", recharge_directe: "recharge payée directement" };
const REGLE: Record<string, string> = { egal: "parts égales", surface: "prorata surface", sous_compteur: "prorata sous-compteurs", forfait: "forfait + solde" };

/** Portail occupant (lien signé envoyé par WhatsApp / SMS) : payer, historique, transparence du compteur partagé, déclarer, signaler. */
export default function Payer() {
  const { occupantId } = useParams();
  const [params] = useSearchParams();
  const jeton = params.get("t") ?? "";
  const [p, setP] = useState<Portail | null>(null);
  const [erreur, setErreur] = useState("");
  const [onglet, setOnglet] = useState<Onglet>("payer");
  const [occupe, setOccupe] = useState<string | null>(null);
  const [langue, setLangue] = useState<Langue>(() => { try { return (localStorage.getItem("kuran-langue") as Langue) || "fr"; } catch { return "fr"; } });
  const t = (k: string, v: Record<string, string | number> = {}) => Object.entries(v).reduce((acc, [kk, vv]) => acc.replace(`{${kk}}`, String(vv)), T[langue][k] ?? k);
  const changerLangue = (l: Langue) => { setLangue(l); try { localStorage.setItem("kuran-langue", l); } catch { /* ignoré */ } };
  const base = `/public/occupants/${occupantId}`;

  const charger = () => api<Portail>(`${base}?t=${jeton}`, { auth: false }).then(setP).catch((e) => setErreur(e.message));
  useEffect(() => { void charger(); }, [occupantId, jeton]); // eslint-disable-line react-hooks/exhaustive-deps

  async function payer(moyen: "wave" | "om") {
    setOccupe(moyen);
    try {
      const r = await api<{ url: string }>(`${base}/payer?t=${jeton}`, { body: { moyen }, auth: false });
      window.location.href = r.url;
    } catch (e: any) { setErreur(e.message); setOccupe(null); }
  }

  async function notifications(consentement: boolean) {
    await api(`${base}/notifications?t=${jeton}`, { body: { consentement }, auth: false }).then(charger).catch((e) => setErreur(e.message));
  }

  const onglets: { id: Onglet; label: string; Icon: typeof Receipt }[] = [
    { id: "payer", label: t("payer"), Icon: Receipt },
    { id: "historique", label: t("historique"), Icon: History },
    { id: "compteur", label: t("compteur"), Icon: Zap },
    { id: "declarer", label: t("declarer"), Icon: PlusCircle },
  ];

  return (
    <Cadre>
      {erreur && <p className="text-sm text-red-600 mb-2">{erreur}</p>}
      {!p && !erreur && <p className="text-sm text-slate-500">Chargement…</p>}
      {p && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500">{p.organisation.nom}</div>
              <h1 className="text-xl font-bold mt-1">{p.occupant.nom}</h1>
              <div className="text-sm text-slate-500">{p.occupant.site} · {p.occupant.lot}{p.occupant.dateSortie ? ` · ${t("sorti")} ${fmtDate(p.occupant.dateSortie)}` : ""}</div>
            </div>
            <div className="flex rounded-lg border overflow-hidden text-xs shrink-0">
              {(["fr", "wo"] as const).map((l) => <button key={l} onClick={() => changerLangue(l)} className={`px-2 py-1 font-semibold ${langue === l ? "bg-brand-700 text-white" : "text-slate-500"}`}>{l === "fr" ? "FR" : "WO"}</button>)}
            </div>
          </div>

          <div className="flex border-b mt-4 mb-4 -mx-1 overflow-x-auto">
            {onglets.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setOnglet(id)} className={`flex-1 min-w-20 py-2 text-xs font-medium border-b-2 flex flex-col items-center gap-0.5 ${onglet === id ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500"}`}>
                <Icon size={16} />{label}{id === "payer" && p.total > 0 && <span className="absolute" />}
              </button>
            ))}
          </div>

          {onglet === "payer" && (
            p.total === 0 ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3 text-emerald-800"><CheckCircle2 /> {t("rien")}</div>
            ) : (
              <>
                <div className="rounded-xl bg-slate-50 border p-4">
                  <div className="text-xs text-slate-500">{t("aRegler")}</div>
                  <div className="text-3xl font-extrabold text-brand-700">{fmtF(p.total)}</div>
                </div>
                <table className="w-full mt-4 text-sm">
                  <tbody>
                    {p.dues.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100">
                        <td className="py-2">{fmtDate(d.date)}<div className="text-xs text-slate-500">{d.compteur} · recharge {fmtF(d.montantRecharge)} · {fmtKwh(d.kwh)}</div></td>
                        <td className="py-2 text-right font-semibold whitespace-nowrap">{fmtF(d.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-5 space-y-2">
                  {p.moyens.map((m) => (
                    <button key={m.moyen} disabled={!!occupe} onClick={() => payer(m.moyen)} className={`w-full rounded-xl py-3 font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${m.moyen === "wave" ? "bg-[#1dc3f0]" : "bg-[#ff7900]"}`}>
                      <Smartphone size={18} /> {occupe === m.moyen ? t("redirection") : t("payerAvec", { m: fmtF(p.total), op: m.libelle })}
                    </button>
                  ))}
                  {p.moyens.some((m) => m.simulation) && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">{t("demo")}</p>}
                </div>
              </>
            )
          )}

          {onglet === "historique" && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500 mb-1">{t("mesPaiements")}</div>
                {p.paiements.length === 0 && <p className="text-sm text-slate-500">{t("aucunPaiement")}</p>}
                <ul className="divide-y divide-slate-100 text-sm">
                  {p.paiements.map((x) => (
                    <li key={x.id} className="py-2 flex items-center justify-between gap-2">
                      <div>{fmtDate(x.date)} · {MOYEN[x.moyen] ?? x.moyen}<div className="text-xs text-slate-500">Quittance {x.quittanceNumero}</div></div>
                      <div className="flex items-center gap-2"><span className="font-semibold">{fmtF(x.montant)}</span>{x.quittanceUrl && <a href={x.quittanceUrl} target="_blank" rel="noreferrer" className="btn-ghost p-1.5 text-brand-700" title="Quittance PDF"><FileText size={16} /></a>}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500 mb-1">{t("reglees")}</div>
                <ul className="divide-y divide-slate-100 text-sm">
                  {p.historique.map((h) => (
                    <li key={h.id} className="py-2 flex items-center justify-between gap-2">
                      <div>{fmtDate(h.date)} · {h.compteur}<div className="text-xs text-slate-500">recharge {fmtF(h.montantRecharge)} · {h.statut === "payee" ? `payée le ${h.datePaiement ? fmtDate(h.datePaiement) : ""} (${MOYEN[h.moyen ?? ""] ?? h.moyen ?? ""})` : "annulée"}</div></div>
                      <span className={`font-semibold ${h.statut === "annulee" ? "line-through text-slate-400" : ""}`}>{fmtF(h.montant)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {onglet === "compteur" && (
            <div className="space-y-4">
              {p.compteurs.map((c) => (
                <div key={c.id}>
                  <div className="font-semibold">{c.libelle ?? c.numero} <span className="text-xs font-mono text-slate-500">{c.numero}</span></div>
                  <div className="text-xs text-slate-500 mb-2">{c.partage ? `${t("compteurPartage")} ${REGLE[c.regle] ?? c.regle}` : t("individuel")}</div>
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-slate-500"><th className="text-left font-medium py-1">{t("recharge")}</th><th className="text-right font-medium">{t("montant")}</th><th className="text-right font-medium">kWh</th><th className="text-right font-medium">{t("maPart")}</th></tr></thead>
                    <tbody>
                      {c.recharges.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100"><td className="py-1.5">{fmtDate(r.date)}</td><td className="text-right">{fmtF(r.montant)}</td><td className="text-right text-slate-500">{r.kwh.toFixed(1)}</td><td className="text-right font-semibold">{r.maPart != null ? fmtF(r.maPart) : "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {p.compteurs.length === 0 && <p className="text-sm text-slate-500">Aucun compteur rattaché à votre lot.</p>}
              {p.consommation.some((m) => m.maPart > 0 || m.moyenneAutresLots) && (
                <div className="rounded-xl border p-3">
                  <div className="text-sm font-medium mb-2">{t("conso")}</div>
                  {(() => { const max = Math.max(1, ...p.consommation.map((m) => Math.max(m.maPart, m.moyenneAutresLots ?? 0))); return (
                    <div className="flex items-end gap-2 h-28">
                      {p.consommation.map((m) => (
                        <div key={m.mois} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex items-end justify-center gap-0.5 h-20">
                            <div className="w-2/5 bg-brand-600 rounded-t" style={{ height: `${(m.maPart / max) * 100}%` }} title={`${t("maPart")} : ${fmtF(m.maPart)}`} />
                            <div className="w-2/5 bg-slate-300 rounded-t" style={{ height: `${((m.moyenneAutresLots ?? 0) / max) * 100}%` }} title={`${t("moyenne")} : ${m.moyenneAutresLots != null ? fmtF(m.moyenneAutresLots) : "—"}`} />
                          </div>
                          <div className="text-[10px] text-slate-500">{m.mois.slice(5)}/{m.mois.slice(2, 4)}</div>
                        </div>
                      ))}
                    </div>); })()}
                  <div className="flex gap-4 text-xs text-slate-500 mt-2"><span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-brand-600 rounded-sm" /> {t("maPart")}</span><span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-slate-300 rounded-sm" /> {t("moyenne")} ({p.consommation[p.consommation.length - 1]?.nbLots ?? 0})</span></div>
                </div>
              )}
              <div className="rounded-xl border p-3 flex items-center justify-between gap-3">
                <div className="text-sm"><div className="font-medium">{t("notifs")}</div><div className="text-xs text-slate-500">{t("notifsSous")}</div></div>
                <button className="btn-secondary" onClick={() => notifications(!p.occupant.consentementNotifications)}>{p.occupant.consentementNotifications ? <><Bell size={14} /> {t("actives")}</> : <><BellOff size={14} /> {t("desactivees")}</>}</button>
              </div>
              <Signaler base={base} t={jeton} libelle={t("signaler")} envoyer={t("envoyer")} />
            </div>
          )}

          {onglet === "declarer" && <Declarer p={p} base={base} t={jeton} onFait={() => { void charger(); setOnglet("compteur"); }} />}

          {p.organisation.contact && <p className="mt-6 text-xs text-slate-500">{t("question")} {p.organisation.contact}</p>}
        </>
      )}
    </Cadre>
  );
}

function Declarer({ p, base, t, onFait }: { p: Portail; base: string; t: string; onFait: () => void }) {
  const [compteurId, setCompteurId] = useState(p.compteurs[0]?.id ?? "");
  const [montant, setMontant] = useState("");
  const [kwh, setKwh] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sms, setSms] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");
  const [msg, setMsg] = useState("");

  function analyser(texte: string) {
    setSms(texte);
    const a = parserSms(texte);
    if (a.montant) setMontant(String(Math.round(a.montant)));
    if (a.kwh) setKwh(String(a.kwh));
  }

  async function envoyer() {
    setEtat("envoi");
    try {
      const r = await api(`${base}/declarer?t=${t}`, { body: { compteurId, montant: Number(montant), kwh: kwh ? Number(kwh) : undefined, date, texteSms: sms || undefined, commentaire: commentaire || undefined }, auth: false });
      setMsg(r.message); setEtat("ok"); setTimeout(onFait, 1500);
    } catch (e: any) { setMsg(e.message); setEtat("erreur"); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Vous avez rechargé vous-même le compteur partagé ? Déclarez-le : votre gestionnaire valide, votre part est comptée comme réglée et le surplus vous est dû.</p>
      {p.declarations.length > 0 && (
        <ul className="text-xs text-slate-500 space-y-0.5">{p.declarations.map((d) => <li key={d.id}>{fmtDate(d.date)} · {d.analyse.montant ? fmtF(d.analyse.montant) : ""} · {d.statut === "en_attente" ? "en attente de validation" : d.statut === "rattache" ? "validée" : "ignorée"}</li>)}</ul>
      )}
      {p.compteurs.length > 1 && (
        <label className="block text-sm"><span className="text-xs text-slate-500">Compteur</span><select className="input" value={compteurId} onChange={(e) => setCompteurId(e.target.value)}>{p.compteurs.map((c) => <option key={c.id} value={c.id}>{c.libelle ?? c.numero}</option>)}</select></label>
      )}
      <label className="block text-sm"><span className="text-xs text-slate-500">Coller le SMS Wave / Orange Money (facultatif)</span><textarea className="input h-20" value={sms} onChange={(e) => analyser(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm"><span className="text-xs text-slate-500">Montant (F)</span><input className="input" type="number" value={montant} onChange={(e) => setMontant(e.target.value)} /></label>
        <label className="block text-sm"><span className="text-xs text-slate-500">kWh (ticket)</span><input className="input" type="number" step="0.1" value={kwh} onChange={(e) => setKwh(e.target.value)} /></label>
      </div>
      <label className="block text-sm"><span className="text-xs text-slate-500">Date de la recharge</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="block text-sm"><span className="text-xs text-slate-500">Commentaire</span><input className="input" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="payé à la boutique du coin…" /></label>
      {msg && <p className={`text-sm ${etat === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>}
      <button className="btn-primary w-full justify-center" disabled={etat === "envoi" || !compteurId || Number(montant) < 500} onClick={envoyer}>Transmettre la déclaration</button>
    </div>
  );
}

function Signaler({ base, t, libelle, envoyer }: { base: string; t: string; libelle: string; envoyer: string }) {
  const [message, setMessage] = useState("");
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");
  const [msg, setMsg] = useState("");
  return (
    <div className="rounded-xl border p-3">
      <div className="text-sm font-medium flex items-center gap-2"><AlertTriangle size={16} className="text-amber-600" /> {libelle}</div>
      <textarea className="input h-20 mt-2" placeholder="Compteur coupé, code refusé, part contestée…" value={message} onChange={(e) => setMessage(e.target.value)} />
      {msg && <p className={`text-xs mt-1 ${etat === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>}
      <button className="btn-secondary mt-2" disabled={etat === "envoi" || message.trim().length < 5} onClick={async () => { setEtat("envoi"); try { const r = await api(`${base}/signaler?t=${t}`, { body: { message }, auth: false }); setMsg(r.message); setEtat("ok"); setMessage(""); } catch (e: any) { setMsg(e.message); setEtat("erreur"); } }}>{envoyer}</button>
    </div>
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
    <div className="min-h-screen bg-slate-900 p-4 flex items-start justify-center">
      <div className="w-full max-w-md">
        <div className="text-center text-white my-6"><div className="inline-flex items-center gap-2 text-2xl font-bold"><Receipt className="text-brand-500" /> KURAÑ</div></div>
        <div className="card p-5">{children}</div>
        <p className="text-center text-xs text-slate-500 mt-4">Électricité prépayée Woyofal · processingenierie</p>
      </div>
    </div>
  );
}
