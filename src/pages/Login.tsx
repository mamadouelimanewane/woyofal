import { useState } from "react";
import { Receipt, Smartphone, Mail, Building2 } from "lucide-react";
import { Field } from "../components/ui";
import { useStore } from "../store/useStore";

type Mode = "otp" | "email" | "inscription";

export default function Login() {
  const s = useStore();
  const [mode, setMode] = useState<Mode>("otp");
  const [telephone, setTelephone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [etape, setEtape] = useState<"telephone" | "code">("telephone");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [nom, setNom] = useState("");
  const [orgNom, setOrgNom] = useState("");
  const [orgType, setOrgType] = useState<"immo" | "entreprise">("immo");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  async function lancer(fn: () => Promise<unknown>) {
    setErreur("");
    setOccupe(true);
    try {
      await fn();
    } catch (e: any) {
      setErreur(e?.message ?? "Erreur");
    } finally {
      setOccupe(false);
    }
  }

  const demanderCode = () => lancer(async () => {
    const r = await s.demanderOtp(telephone);
    setDevCode(r.devCode ?? null);
    setEtape("code");
  });

  const onglet = (m: Mode, label: string, Icon: typeof Smartphone) => (
    <button className={`flex-1 py-2 text-sm font-medium border-b-2 flex items-center justify-center gap-1.5 ${mode === m ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500"}`} onClick={() => { setMode(m); setErreur(""); }}>
      <Icon size={15} /> {label}
    </button>
  );

  return (
    <div className="min-h-full flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center text-white mb-6">
          <div className="inline-flex items-center gap-2 text-3xl font-bold"><Receipt className="text-brand-500" size={32} /> KURAÑ</div>
          <p className="text-slate-400 mt-2">Pilotage de parc de compteurs Woyofal</p>
        </div>
        <div className="card p-5">
          <div className="flex border-b mb-4">
            {onglet("otp", "Téléphone", Smartphone)}
            {onglet("email", "E-mail", Mail)}
            {onglet("inscription", "Créer un compte", Building2)}
          </div>

          {mode === "otp" && (
            <div className="space-y-3">
              <Field label="Numéro de téléphone"><input className="input" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="77 000 00 00" disabled={etape === "code"} /></Field>
              {etape === "code" && (
                <Field label="Code reçu par SMS" hint={devCode ? `Mode démonstration — code : ${devCode}` : undefined}>
                  <input className="input font-mono tracking-widest text-center" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" autoFocus />
                </Field>
              )}
              {etape === "telephone"
                ? <button className="btn-primary w-full justify-center" disabled={occupe || telephone.replace(/\D/g, "").length < 9} onClick={demanderCode}>Recevoir un code</button>
                : <div className="flex gap-2"><button className="btn-secondary" onClick={() => { setEtape("telephone"); setCode(""); }}>Retour</button><button className="btn-primary flex-1 justify-center" disabled={occupe || code.length !== 6} onClick={() => lancer(() => s.connecterOtp(telephone, code))}>Se connecter</button></div>}
            </div>
          )}

          {mode === "email" && (
            <div className="space-y-3">
              <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Mot de passe"><input className="input" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} /></Field>
              <button className="btn-primary w-full justify-center" disabled={occupe || !email || !motDePasse} onClick={() => lancer(() => s.connecterEmail(email, motDePasse))}>Se connecter</button>
            </div>
          )}

          {mode === "inscription" && (
            <div className="space-y-3">
              <Field label="Nom de l'organisation"><input className="input" value={orgNom} onChange={(e) => setOrgNom(e.target.value)} placeholder="SCI Les Almadies, Pharmacies Sud…" /></Field>
              <Field label="Édition">
                <div className="grid grid-cols-2 gap-2">
                  {(["immo", "entreprise"] as const).map((t) => (
                    <button key={t} className={`rounded-lg border p-2 text-sm text-left ${orgType === t ? "border-brand-500 bg-brand-50" : "border-slate-200"}`} onClick={() => setOrgType(t)}>
                      <div className="font-semibold">{t === "immo" ? "Immo" : "Entreprise"}</div>
                      <div className="text-xs text-slate-500">{t === "immo" ? "Bailleurs, gérants, SCI, cités" : "Multi-sites : pharmacies, écoles, agences"}</div>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Votre nom"><input className="input" value={nom} onChange={(e) => setNom(e.target.value)} /></Field>
              <Field label="Téléphone"><input className="input" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="77 000 00 00" disabled={etape === "code"} /></Field>
              {etape === "code" && (
                <Field label="Code reçu par SMS" hint={devCode ? `Mode démonstration — code : ${devCode}` : undefined}>
                  <input className="input font-mono tracking-widest text-center" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" autoFocus />
                </Field>
              )}
              {etape === "telephone"
                ? <button className="btn-primary w-full justify-center" disabled={occupe || !orgNom || !nom || telephone.replace(/\D/g, "").length < 9} onClick={demanderCode}>Recevoir un code</button>
                : <button className="btn-primary w-full justify-center" disabled={occupe || code.length !== 6} onClick={() => lancer(() => s.inscrire({ telephone, code, nom, organisation: { nom: orgNom, type: orgType } }))}>Créer mon organisation</button>}
              <p className="text-xs text-slate-500">Essai gratuit 30 jours, toutes fonctionnalités. Gratuit jusqu'à 5 compteurs ensuite.</p>
            </div>
          )}

          {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}
        </div>
        <p className="text-center text-xs text-slate-500 mt-4">processingenierie · Dakar</p>
      </div>
    </div>
  );
}
