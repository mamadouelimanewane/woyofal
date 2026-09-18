import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Alerte, Compteur, CompteurLot, GrilleTarifaire, Lot, Occupant, Organisation, QuotePart, Recharge,
  RegleCompteur, RegleRepartition, ReleveSousCompteur, Site, Utilisateur, CanalRecharge,
} from "../types";
import { GRILLE_2026, calculerRecharge, clePeriode, grilleEnVigueur } from "../lib/tarif";
import { repartir } from "../lib/repartition";
import * as demo from "../data/demo";

const uid = () => Math.random().toString(36).slice(2, 10);

export interface NouvelleRecharge {
  compteurId: string;
  date: string;
  montant: number;
  canal: CanalRecharge;
  codeRecharge?: string;
  referencePaiement?: string;
  note?: string;
  /** Générer des quotes-parts pour les occupants (auto pour les compteurs partagés). */
  refacturer?: boolean;
}

interface State {
  version: number;
  sessionUserId: string | null;
  organisations: Organisation[];
  utilisateurs: Utilisateur[];
  sites: Site[];
  lots: Lot[];
  compteurs: Compteur[];
  rattachements: CompteurLot[];
  regles: RegleCompteur[];
  occupants: Occupant[];
  recharges: Recharge[];
  quotesParts: QuotePart[];
  releves: ReleveSousCompteur[];
  grilles: GrilleTarifaire[];
  alertesTraitees: string[];

  login: (userId: string) => void;
  logout: () => void;
  reset: () => void;

  addSite: (s: Omit<Site, "id">) => Site;
  updateSite: (id: string, patch: Partial<Site>) => void;
  addLot: (l: Omit<Lot, "id">) => Lot;
  addCompteur: (c: Omit<Compteur, "id">, lotIds?: string[]) => Compteur;
  updateCompteur: (id: string, patch: Partial<Compteur>) => void;
  setRattachements: (compteurId: string, lotIds: string[]) => void;
  setForfait: (compteurId: string, lotId: string, forfait: number) => void;
  setRegle: (compteurId: string, regle: RegleRepartition) => void;

  addOccupant: (o: Omit<Occupant, "id">) => Occupant;
  sortieOccupant: (id: string, dateSortie: string) => void;
  addReleve: (r: Omit<ReleveSousCompteur, "id">) => void;

  addRecharge: (r: NouvelleRecharge) => Recharge;
  deleteRecharge: (id: string) => void;
  payerQuotePart: (id: string, moyen: string, date?: string) => void;
  annulerQuotePart: (id: string) => void;

  addGrille: (g: Omit<GrilleTarifaire, "id">) => void;
  traiterAlerte: (id: string) => void;
}

function etatInitial() {
  return {
    version: 1,
    sessionUserId: null as string | null,
    organisations: demo.ORGANISATIONS,
    utilisateurs: demo.UTILISATEURS,
    sites: demo.SITES,
    lots: demo.LOTS,
    compteurs: demo.COMPTEURS,
    rattachements: demo.RATTACHEMENTS,
    regles: demo.REGLES,
    occupants: demo.OCCUPANTS,
    recharges: [] as Recharge[],
    quotesParts: [] as QuotePart[],
    releves: demo.RELEVES,
    grilles: [GRILLE_2026],
    alertesTraitees: [] as string[],
  };
}

/** Calcule tarif + quotes-parts d'une recharge à partir de l'état courant (pur). */
function construireRecharge(s: State, n: NouvelleRecharge, saisiPar: string): { recharge: Recharge; parts: QuotePart[] } {
  const grille = grilleEnVigueur(s.grilles, n.date);
  const periode = clePeriode(n.date, grille.periode);
  const memePeriode = s.recharges.filter(
    (r) => r.compteurId === n.compteurId && clePeriode(r.date, grille.periode) === periode && r.date < n.date,
  );
  const detail = calculerRecharge(n.montant, grille, {
    kwhCumulePeriode: memePeriode.reduce((sum, r) => sum + r.kwh, 0),
    premiereRechargeDuMois: memePeriode.length === 0,
  });
  const recharge: Recharge = {
    id: uid(), compteurId: n.compteurId, date: n.date, montant: n.montant, canal: n.canal,
    codeRecharge: n.codeRecharge, referencePaiement: n.referencePaiement, note: n.note, saisiPar, ...detail,
  };

  const compteur = s.compteurs.find((c) => c.id === n.compteurId);
  const doitRefacturer = compteur?.partage || n.refacturer;
  let parts: QuotePart[] = [];
  if (compteur && doitRefacturer) {
    const rattachements = s.rattachements.filter((r) => r.compteurId === compteur.id);
    const regle = s.regles.find((r) => r.compteurId === compteur.id)?.regle ?? "egal";
    parts = repartir(n.montant, { regle, rattachements, lots: s.lots, occupants: s.occupants, releves: s.releves, dateRecharge: n.date })
      .filter((p) => p.occupantId)
      .map((p) => ({ id: uid(), rechargeId: recharge.id, occupantId: p.occupantId!, lotId: p.lotId, montant: p.montant, statut: "due" as const }));
  }
  return { recharge, parts };
}

function seedRecharges(s: State): Pick<State, "recharges" | "quotesParts"> {
  let recharges: Recharge[] = [];
  let quotesParts: QuotePart[] = [];
  for (const d of demo.rechargesDemo()) {
    const { recharge, parts } = construireRecharge({ ...s, recharges, quotesParts }, { ...d }, "u-agent-immo");
    recharges = [...recharges, recharge];
    // Historique démo : les quotes-parts de plus de 45 jours sont payées, les récentes restent dues
    const anciennes = Date.now() - new Date(recharge.date).getTime() > 45 * 86400000;
    quotesParts = [...quotesParts, ...parts.map((p) => (anciennes ? { ...p, statut: "payee" as const, datePaiement: recharge.date.slice(0, 10), moyenPaiement: "Wave" } : p))];
  }
  return { recharges, quotesParts };
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...etatInitial(),

      login: (userId) => set({ sessionUserId: userId }),
      logout: () => set({ sessionUserId: null }),
      reset: () => {
        const base = { ...get(), ...etatInitial() };
        set({ ...etatInitial(), ...seedRecharges(base as State) });
      },

      addSite: (s) => { const site = { ...s, id: uid() }; set({ sites: [...get().sites, site] }); return site; },
      updateSite: (id, patch) => set({ sites: get().sites.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
      addLot: (l) => { const lot = { ...l, id: uid() }; set({ lots: [...get().lots, lot] }); return lot; },
      addCompteur: (c, lotIds = []) => {
        const compteur = { ...c, id: uid() };
        set({ compteurs: [...get().compteurs, compteur], rattachements: [...get().rattachements, ...lotIds.map((lotId) => ({ compteurId: compteur.id, lotId }))] });
        return compteur;
      },
      updateCompteur: (id, patch) => set({ compteurs: get().compteurs.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
      setRattachements: (compteurId, lotIds) =>
        set({
          rattachements: [
            ...get().rattachements.filter((r) => r.compteurId !== compteurId),
            ...lotIds.map((lotId) => ({ compteurId, lotId, forfait: get().rattachements.find((r) => r.compteurId === compteurId && r.lotId === lotId)?.forfait })),
          ],
          compteurs: get().compteurs.map((c) => (c.id === compteurId ? { ...c, partage: lotIds.length > 1 } : c)),
        }),
      setForfait: (compteurId, lotId, forfait) =>
        set({ rattachements: get().rattachements.map((r) => (r.compteurId === compteurId && r.lotId === lotId ? { ...r, forfait } : r)) }),
      setRegle: (compteurId, regle) => set({ regles: [...get().regles.filter((r) => r.compteurId !== compteurId), { compteurId, regle }] }),

      addOccupant: (o) => { const occ = { ...o, id: uid() }; set({ occupants: [...get().occupants, occ] }); return occ; },
      sortieOccupant: (id, dateSortie) => set({ occupants: get().occupants.map((o) => (o.id === id ? { ...o, dateSortie } : o)) }),
      addReleve: (r) => set({ releves: [...get().releves, { ...r, id: uid() }] }),

      addRecharge: (n) => {
        const s = get();
        const { recharge, parts } = construireRecharge(s, n, s.sessionUserId ?? "inconnu");
        set({ recharges: [...s.recharges, recharge], quotesParts: [...s.quotesParts, ...parts] });
        return recharge;
      },
      deleteRecharge: (id) => set({ recharges: get().recharges.filter((r) => r.id !== id), quotesParts: get().quotesParts.filter((q) => q.rechargeId !== id) }),
      payerQuotePart: (id, moyen, date = new Date().toISOString().slice(0, 10)) =>
        set({ quotesParts: get().quotesParts.map((q) => (q.id === id ? { ...q, statut: "payee", moyenPaiement: moyen, datePaiement: date } : q)) }),
      annulerQuotePart: (id) => set({ quotesParts: get().quotesParts.map((q) => (q.id === id ? { ...q, statut: "annulee" } : q)) }),

      addGrille: (g) => set({ grilles: [...get().grilles, { ...g, id: uid() }] }),
      traiterAlerte: (id) => set({ alertesTraitees: [...get().alertesTraitees, id] }),
    }),
    {
      name: "kuran-v1",
      onRehydrateStorage: () => (state) => {
        if (state && state.recharges.length === 0) state.reset();
      },
    },
  ),
);

// ---------- Sélecteurs (purs, à utiliser dans les composants) ----------

export function orgCourante(s: State): Organisation | null {
  const u = s.utilisateurs.find((x) => x.id === s.sessionUserId);
  return s.organisations.find((o) => o.id === u?.organisationId) ?? null;
}

export function userCourant(s: State): Utilisateur | null {
  return s.utilisateurs.find((x) => x.id === s.sessionUserId) ?? null;
}

export function sitesDeOrg(s: State, orgId: string): Site[] {
  return s.sites.filter((x) => x.organisationId === orgId);
}

export function compteursDeSite(s: State, siteId: string): Compteur[] {
  return s.compteurs.filter((c) => c.siteId === siteId);
}

export function compteursDeOrg(s: State, orgId: string): Compteur[] {
  const ids = new Set(sitesDeOrg(s, orgId).map((x) => x.id));
  return s.compteurs.filter((c) => ids.has(c.siteId));
}

export function rechargesDeCompteur(s: State, compteurId: string): Recharge[] {
  return s.recharges.filter((r) => r.compteurId === compteurId).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function rechargesDeOrg(s: State, orgId: string): Recharge[] {
  const ids = new Set(compteursDeOrg(s, orgId).map((c) => c.id));
  return s.recharges.filter((r) => ids.has(r.compteurId));
}

export function cumulPeriode(s: State, compteurId: string, dateISO = new Date().toISOString()): { kwh: number; montant: number; nb: number } {
  const g = grilleEnVigueur(s.grilles, dateISO);
  const p = clePeriode(dateISO, g.periode);
  const rs = s.recharges.filter((r) => r.compteurId === compteurId && clePeriode(r.date, g.periode) === p);
  return { kwh: rs.reduce((a, r) => a + r.kwh, 0), montant: rs.reduce((a, r) => a + r.montant, 0), nb: rs.length };
}

export function depenseSiteMois(s: State, siteId: string, mois: string): number {
  const ids = new Set(compteursDeSite(s, siteId).map((c) => c.id));
  return s.recharges.filter((r) => ids.has(r.compteurId) && moisDe(r.date) === mois).reduce((a, r) => a + r.montant, 0);
}

/** YYYY-MM en heure locale (toISOString décale d'un jour en fuseau positif). */
export function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Mois local (YYYY-MM) d'une date ISO. */
export function moisDe(iso: string): string {
  return ym(new Date(iso));
}

export function moisCourant(): string {
  return ym(new Date());
}

/** Liste des 12 derniers mois au format YYYY-MM, du plus ancien au plus récent. */
export function derniersMois(n = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(ym(new Date(d.getFullYear(), d.getMonth() - i, 1)));
  return out;
}

/** Alertes calculées à la volée (budget, inactivité, anomalie). */
export function alertesDeOrg(s: State, orgId: string): Alerte[] {
  const out: Alerte[] = [];
  const mois = moisCourant();
  const now = Date.now();
  for (const site of sitesDeOrg(s, orgId)) {
    const dep = depenseSiteMois(s, site.id, mois);
    if (site.budgetMensuel) {
      const ratio = dep / site.budgetMensuel;
      if (ratio >= 1) out.push({ id: `budget100-${site.id}-${mois}`, siteId: site.id, type: "budget_100", message: `${site.nom} : budget dépassé (${Math.round(ratio * 100)} %)`, date: mois, traitee: false });
      else if (ratio >= 0.8) out.push({ id: `budget80-${site.id}-${mois}`, siteId: site.id, type: "budget_80", message: `${site.nom} : ${Math.round(ratio * 100)} % du budget consommé`, date: mois, traitee: false });
    }
    for (const c of compteursDeSite(s, site.id).filter((c) => c.statut === "actif")) {
      const rs = rechargesDeCompteur(s, c.id);
      const derniere = rs[0];
      const joursSans = derniere ? Math.floor((now - new Date(derniere.date).getTime()) / 86400000) : 999;
      // Seuil relatif à la cadence habituelle du compteur : 1,5 × intervalle moyen des 6 dernières recharges, minimum 12 jours
      const recentes = rs.slice(0, 6);
      const intervalle = recentes.length >= 2 ? (new Date(recentes[0].date).getTime() - new Date(recentes[recentes.length - 1].date).getTime()) / 86400000 / (recentes.length - 1) : 15;
      if (joursSans >= Math.max(12, Math.round(intervalle * 1.5))) out.push({ id: `inactif-${c.id}-${mois}`, siteId: site.id, compteurId: c.id, type: "inactif", message: `${site.nom} — ${c.libelle ?? c.numero} : aucune recharge depuis ${joursSans} jours`, date: mois, traitee: false });
      // Anomalie : dépense du mois > 150 % de la moyenne des 3 mois précédents
      const moisPrec = derniersMois(4).slice(0, 3);
      const moy = moisPrec.reduce((a, m) => a + rs.filter((r) => moisDe(r.date) === m).reduce((x, r) => x + r.montant, 0), 0) / 3;
      // Mois en cours projeté au prorata des jours écoulés, pour comparer à des mois complets
      const d = new Date();
      const joursMois = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const cur = (rs.filter((r) => moisDe(r.date) === mois).reduce((x, r) => x + r.montant, 0) * joursMois) / d.getDate();
      if (moy > 0 && cur > moy * 1.5) out.push({ id: `anomalie-${c.id}-${mois}`, siteId: site.id, compteurId: c.id, type: "anomalie", message: `${site.nom} — ${c.libelle ?? c.numero} : +${Math.round((cur / moy - 1) * 100)} % projeté vs moyenne 3 mois`, date: mois, traitee: false });
    }
  }
  return out.map((a) => ({ ...a, traitee: s.alertesTraitees.includes(a.id) }));
}
