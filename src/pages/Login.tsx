import { useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import { useStore } from "../store/useStore";

export default function Login() {
  const s = useStore();
  const nav = useNavigate();
  return (
    <div className="min-h-full flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center text-white mb-8">
          <div className="inline-flex items-center gap-2 text-3xl font-bold"><Receipt className="text-brand-500" size={32} /> KURAÑ</div>
          <p className="text-slate-400 mt-2">Gestion de parc de compteurs Woyofal — démonstration</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {s.organisations.map((org) => (
            <div key={org.id} className="card p-5">
              <div className="text-xs font-semibold uppercase text-brand-700">{org.type === "immo" ? "Édition Immo" : "Édition Entreprise"}</div>
              <div className="text-lg font-bold mt-1">{org.nom}</div>
              <div className="mt-4 space-y-2">
                {s.utilisateurs.filter((u) => u.organisationId === org.id).map((u) => (
                  <button key={u.id} className="btn-secondary w-full justify-between" onClick={() => { s.login(u.id); nav("/"); }}>
                    <span>{u.nom}</span>
                    <span className="text-xs text-slate-500">{u.role}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-slate-500 mt-6">Données de démonstration stockées localement. En production : OTP SMS + base Neon.</p>
      </div>
    </div>
  );
}
