import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useDialogue, useToasts } from "./erreur";

/** File de toasts + boîte de dialogue globale (confirmation / saisie). À monter une fois dans App. */
export default function Toasts() {
  const toasts = useToasts();
  const dialogue = useDialogue();
  const [valeur, setValeur] = useState("");
  useEffect(() => { setValeur(dialogue?.saisie?.valeur ?? ""); }, [dialogue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 w-[min(92vw,380px)]">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 rounded-xl px-4 py-3 shadow-lg text-sm text-white ${t.ton === "erreur" ? "bg-red-600" : t.ton === "succes" ? "bg-emerald-600" : "bg-slate-800"}`}>
            {t.ton === "erreur" ? <AlertCircle size={18} className="shrink-0 mt-0.5" /> : t.ton === "succes" ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <Info size={18} className="shrink-0 mt-0.5" />}
            <span>{t.texte}</span>
          </div>
        ))}
      </div>
      {dialogue && (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4" onClick={() => dialogue.resoudre(null)}>
          <div className="card p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold text-lg">{dialogue.titre}</div>
            {dialogue.texte && <p className="text-sm text-slate-600 mt-1">{dialogue.texte}</p>}
            {dialogue.saisie && (
              dialogue.saisie.options ? (
                <select className="input mt-3" value={valeur} onChange={(e) => setValeur(e.target.value)} autoFocus>{dialogue.saisie.options.map((o) => <option key={o}>{o}</option>)}</select>
              ) : (
                <input className="input mt-3" type={dialogue.saisie.type ?? "text"} placeholder={dialogue.saisie.placeholder} value={valeur} onChange={(e) => setValeur(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") dialogue.resoudre(valeur); }} />
              )
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn-secondary" onClick={() => dialogue.resoudre(null)}>{dialogue.annuler}</button>
              <button className="btn-primary" onClick={() => dialogue.resoudre(dialogue.saisie ? valeur : "ok")}>{dialogue.confirmer}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
