import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, Building2, Gauge, LayoutDashboard, LogOut, Menu, Receipt, Settings, Store, Users, Wallet, Zap } from "lucide-react";
import { useState } from "react";
import { alertesDeOrg, orgCourante, userCourant, useStore } from "../store/useStore";

const ROLE_LIBELLE: Record<string, string> = { superadmin: "Super-admin", admin: "Administrateur", gestionnaire: "Gestionnaire", agent: "Agent de site", occupant: "Occupant", lecture: "Lecture seule" };

export default function Layout() {
  const s = useStore();
  const org = orgCourante(s);
  const user = userCourant(s);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!org || !user) return null;
  const nbAlertes = alertesDeOrg(s, org.id).filter((a) => !a.traitee).length;
  const immo = org.type === "immo";

  const liens = [
    { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
    { to: "/parc", label: immo ? "Parc (immeubles)" : "Sites & compteurs", icon: immo ? Building2 : Store },
    { to: "/recharges", label: "Recharges", icon: Zap },
    ...(immo
      ? [
          { to: "/occupants", label: "Occupants", icon: Users },
          { to: "/recouvrement", label: "Recouvrement", icon: Wallet },
        ]
      : []),
    { to: "/alertes", label: "Alertes", icon: Bell, badge: nbAlertes },
    { to: "/grille", label: "Grille tarifaire", icon: Gauge },
    { to: "/parametres", label: "Paramètres", icon: Settings },
  ];

  const menu = (
    <nav className="flex flex-col gap-0.5 p-3">
      {liens.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === "/"}
          onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-brand-700 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
        >
          <l.icon size={18} />
          <span className="flex-1">{l.label}</span>
          {l.badge ? <span className="bg-amber-500 text-slate-900 text-xs font-bold rounded-full px-1.5">{l.badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-full flex">
      <aside className="hidden lg:flex w-64 flex-col bg-slate-900 text-white">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xl font-bold tracking-tight"><Receipt className="text-brand-500" /> KURAÑ</div>
          <div className="text-xs text-slate-400 mt-1">Parc de compteurs Woyofal</div>
        </div>
        <div className="px-5 py-3 border-b border-slate-800">
          <div className="text-sm font-medium truncate">{org.nom}</div>
          <div className="text-xs text-slate-400">{immo ? "Édition Immo" : "Édition Entreprise"}</div>
        </div>
        {menu}
        <div className="mt-auto px-5 py-4 border-t border-slate-800 text-sm">
          <div className="font-medium">{user.nom}</div>
          <div className="text-xs text-slate-400">{ROLE_LIBELLE[user.role]}</div>
          <button className="mt-2 text-xs text-slate-400 hover:text-white flex items-center gap-1" onClick={() => { s.logout(); nav("/login"); }}><LogOut size={14} /> Changer d'utilisateur</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden flex items-center justify-between bg-slate-900 text-white px-4 py-3">
          <div className="font-bold flex items-center gap-2"><Receipt className="text-brand-500" size={20} /> KURAÑ</div>
          <button onClick={() => setOpen(!open)} aria-label="Menu"><Menu /></button>
        </header>
        {open && <div className="lg:hidden bg-slate-900">{menu}</div>}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
