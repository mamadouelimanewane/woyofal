import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Receipt } from "lucide-react";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Parc from "./pages/Parc";
import CompteurDetail from "./pages/CompteurDetail";
import Recharges from "./pages/Recharges";
import Occupants from "./pages/Occupants";
import Recouvrement from "./pages/Recouvrement";
import Alertes from "./pages/Alertes";
import Grille from "./pages/Grille";
import Parametres from "./pages/Parametres";
import Payer, { PaiementRetour } from "./pages/Payer";
import Rapports from "./pages/Rapports";
import Groupe from "./pages/Groupe";
import { orgCourante, useStore } from "./store/useStore";

export default function App() {
  const s = useStore();
  const org = orgCourante(s);
  useEffect(() => { void s.demarrer(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pages publiques (liens signés envoyés aux occupants), indépendantes de la session
  const chemin = window.location.pathname;
  if (chemin.startsWith("/payer/") || chemin.startsWith("/paiement/")) {
    return (
      <Routes>
        <Route path="/payer/:occupantId" element={<Payer />} />
        <Route path="/paiement/:id" element={<PaiementRetour />} />
      </Routes>
    );
  }

  if (s.etat === "init" || s.etat === "chargement") {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-900 text-white">
        <div className="flex items-center gap-2 text-2xl font-bold animate-pulse"><Receipt className="text-brand-500" /> KURAÑ</div>
      </div>
    );
  }
  if (s.etat === "erreur") {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-900 text-white p-4">
        <div className="card p-6 text-slate-800 max-w-md text-center">
          <div className="font-semibold mb-2">Impossible de charger vos données</div>
          <p className="text-sm text-slate-600 mb-4">{s.erreur}</p>
          <div className="flex justify-center gap-2">
            <button className="btn-primary" onClick={() => s.charger()}>Réessayer</button>
            <button className="btn-secondary" onClick={() => s.logout()}>Se déconnecter</button>
          </div>
        </div>
      </div>
    );
  }
  if (!org) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parc" element={<Parc />} />
        <Route path="/compteur/:id" element={<CompteurDetail />} />
        <Route path="/recharges" element={<Recharges />} />
        {org.type === "immo" && <Route path="/occupants" element={<Occupants />} />}
        {org.type === "immo" && <Route path="/recouvrement" element={<Recouvrement />} />}
        <Route path="/alertes" element={<Alertes />} />
        <Route path="/rapports" element={<Rapports />} />
        <Route path="/groupe" element={<Groupe />} />
        <Route path="/grille" element={<Grille />} />
        <Route path="/parametres" element={<Parametres />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
