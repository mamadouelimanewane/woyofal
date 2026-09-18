import { Navigate, Route, Routes } from "react-router-dom";
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
import { orgCourante, useStore } from "./store/useStore";

export default function App() {
  const s = useStore();
  const org = orgCourante(s);
  if (!org) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/parc" element={<Parc />} />
        <Route path="/compteur/:id" element={<CompteurDetail />} />
        <Route path="/recharges" element={<Recharges />} />
        {org.type === "immo" && <Route path="/occupants" element={<Occupants />} />}
        {org.type === "immo" && <Route path="/recouvrement" element={<Recouvrement />} />}
        <Route path="/alertes" element={<Alertes />} />
        <Route path="/grille" element={<Grille />} />
        <Route path="/parametres" element={<Parametres />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
