/**
 * Store client : un instantané de l'organisation courante chargé depuis l'API (/api/snapshot),
 * rafraîchi après chaque mutation. Les sélecteurs en bas de fichier restent purs ;
 * les actions appellent l'API et remontent les erreurs (ApiError) à l'appelant.
 */
import { create } from "zustand";
import type {
  Alerte, Compteur, CompteurLot, GrilleTarifaire, Lot, Occupant, Organisation, QuotePart, Recharge,
  RegleCompteur, RegleRepartition, ReleveSousCompteur, Site, Utilisateur, CanalRecharge,
} from "../types";
import { GRILLE_2026, clePeriode, grilleEnVigueur } from "../lib/tarif";
import { api, ecrireSession, lireSession } from "../api/client";

export interface NouvelleRecharge {
  compteurId: string;
  date: string;
  montant: number;
  canal: CanalRecharge;
  codeRecharge?: string;
  referencePaiement?: string;
  kwhTicket?: number;
  note?: string;
  /** Générer des quotes-parts pour les occupants (auto pour les compteurs partagés). */
  refacturer?: boolean;
}

export interface ResultatRecharge { recharge: Recharge; quotesParts: QuotePart[]; ecart: { kwhCalcule: number; kwhTicket: number; ecartPct: number } | null }

interface State {
  /** "init" au démarrage, "anonyme" sans session, "pret" quand l'instantané est chargé. */
  etat: "init" | "anonyme" | "chargement" | "pret" | "erreur";
  erreur: string | null;
  /** Compte super-admin (aucune organisation courante) : console d'administration. */
  superadmin: boolean;
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
  smsEnAttente: number;

  demarrer: () => Promise<void>;
  charger: () => Promise<void>;
  demanderOtp: (telephone: string) => Promise<{ devCode?: string }>;
  connecterOtp: (telephone: string, code: string) => Promise<void>;
  connecterEmail: (email: string, motDePasse: string) => Promise<void>;
  inscrire: (b: { telephone: string; code: string; nom: string; email?: string; motDePasse?: string; organisation: { nom: string; type: "immo" | "entreprise" } }) => Promise<void>;
  logout: () => Promise<void>;

  addSite: (s: Omit<Site, "id">) => Promise<Site>;
  updateSite: (id: string, patch: Partial<Site>) => Promise<void>;
  addLot: (l: Omit<Lot, "id">) => Promise<Lot>;
  addCompteur: (c: Omit<Compteur, "id">, lotIds?: string[]) => Promise<Compteur>;
  updateCompteur: (id: string, patch: Partial<Compteur>) => Promise<void>;
  setRattachements: (compteurId: string, lotIds: string[]) => Promise<void>;
  setForfait: (compteurId: string, lotId: string, forfait: number) => Promise<void>;
  setRegle: (compteurId: string, regle: RegleRepartition) => Promise<void>;

  addOccupant: (o: Omit<Occupant, "id">) => Promise<Occupant>;
  sortieOccupant: (id: string, dateSortie: string) => Promise<void>;
  addReleve: (r: Omit<ReleveSousCompteur, "id">) => Promise<void>;

  addRecharge: (r: NouvelleRecharge) => Promise<ResultatRecharge>;
  annulerRecharge: (id: string, motif: string) => Promise<void>;
  payerQuotePart: (id: string, moyen: string, reference?: string) => Promise<{ quittanceNumero: string }>;
  annulerQuotePart: (id: string) => Promise<void>;
  relancer: (occupantIds?: string[]) => Promise<number>;

  traiterAlerte: (id: string) => Promise<void>;
}

const vide = {
  sessionUserId: null as string | null,
  organisations: [] as Organisation[],
  utilisateurs: [] as Utilisateur[],
  sites: [] as Site[],
  lots: [] as Lot[],
  compteurs: [] as Compteur[],
  rattachements: [] as CompteurLot[],
  regles: [] as RegleCompteur[],
  occupants: [] as Occupant[],
  recharges: [] as Recharge[],
  quotesParts: [] as QuotePart[],
  releves: [] as ReleveSousCompteur[],
  grilles: [GRILLE_2026] as GrilleTarifaire[],
  alertesTraitees: [] as string[],
  smsEnAttente: 0,
};

/** Moyen saisi librement → valeur API. */
function moyenApi(m: string): "especes" | "wave" | "om" | "virement" | "versuspay" {
  const l = m.toLowerCase();
  if (l.includes("wave")) return "wave";
  if (l.includes("orange") || l === "om") return "om";
  if (l.includes("vire")) return "virement";
  if (l.includes("versus")) return "versuspay";
  return "especes";
}

export const useStore = create<State>()((set, get) => {
  const apresSession = async (j: { accessToken: string; refreshToken: string }) => {
    ecrireSession({ accessToken: j.accessToken, refreshToken: j.refreshToken });
    await get().charger();
  };
  const maj = async <T,>(p: Promise<T>): Promise<T> => {
    const r = await p;
    await get().charger();
    return r;
  };

  return {
    ...vide,
    etat: "init",
    erreur: null,
    superadmin: false,

    demarrer: async () => {
      if (!lireSession()) return set({ etat: "anonyme" });
      await get().charger();
    },

    charger: async () => {
      set({ etat: get().etat === "pret" ? "pret" : "chargement" });
      try {
        const me = await api("/auth/me");
        if (me.utilisateur.role === "superadmin" && !me.organisation) {
          set({ ...vide, etat: "pret", erreur: null, superadmin: true, sessionUserId: me.utilisateur.id, utilisateurs: [me.utilisateur] });
          return;
        }
        const snap = await api("/snapshot");
        set({
          etat: "pret", erreur: null, superadmin: false,
          sessionUserId: me.utilisateur.id,
          organisations: [snap.organisation],
          utilisateurs: snap.utilisateurs,
          sites: snap.sites, lots: snap.lots, compteurs: snap.compteurs, rattachements: snap.rattachements, regles: snap.regles,
          occupants: snap.occupants, recharges: snap.recharges, quotesParts: snap.quotesParts, releves: snap.releves,
          grilles: snap.grilles.length ? snap.grilles : [GRILLE_2026], alertesTraitees: snap.alertesTraitees, smsEnAttente: snap.smsEnAttente,
        });
      } catch (e: any) {
        if (e?.status === 401) { ecrireSession(null); set({ ...vide, etat: "anonyme" }); }
        else set({ etat: "erreur", erreur: e?.message ?? "Erreur de chargement" });
      }
    },

    demanderOtp: (telephone) => api("/auth/otp/request", { body: { telephone }, auth: false }),
    connecterOtp: async (telephone, code) => apresSession(await api("/auth/otp/verify", { body: { telephone, code }, auth: false })),
    connecterEmail: async (email, motDePasse) => apresSession(await api("/auth/login", { body: { email, motDePasse }, auth: false })),
    inscrire: async (b) => apresSession(await api("/auth/inscription", { body: b, auth: false })),
    logout: async () => {
      const s = lireSession();
      if (s) api("/auth/logout", { body: { refreshToken: s.refreshToken } }).catch(() => undefined);
      ecrireSession(null);
      set({ ...vide, etat: "anonyme", superadmin: false });
    },

    addSite: ({ organisationId: _o, ...s }) => maj(api("/sites", { body: s })),
    updateSite: (id, patch) => maj(api(`/sites/${id}`, { method: "PATCH", body: patch })),
    addLot: (l) => maj(api("/lots", { body: l })),
    addCompteur: (c, lotIds = []) => maj(api("/compteurs", { body: { ...c, lotIds } })),
    updateCompteur: (id, patch) => maj(api(`/compteurs/${id}`, { method: "PATCH", body: patch })),
    setRattachements: (compteurId, lotIds) => {
      const actuels = get().rattachements.filter((r) => r.compteurId === compteurId);
      return maj(api(`/compteurs/${compteurId}/rattachements`, { method: "PUT", body: { lots: lotIds.map((lotId) => ({ lotId, forfait: actuels.find((r) => r.lotId === lotId)?.forfait })) } }));
    },
    setForfait: (compteurId, lotId, forfait) => {
      const liste = get().rattachements.filter((r) => r.compteurId === compteurId).map((r) => ({ lotId: r.lotId, forfait: r.lotId === lotId ? forfait : r.forfait }));
      return maj(api(`/compteurs/${compteurId}/rattachements`, { method: "PUT", body: { lots: liste } }));
    },
    setRegle: (compteurId, regle) => maj(api(`/compteurs/${compteurId}/repartition`, { method: "PUT", body: { regle } })),

    addOccupant: (o) => maj(api("/occupants", { body: { ...o, telephone: o.telephone || undefined } })),
    sortieOccupant: (id, dateSortie) => maj(api(`/occupants/${id}/sortie`, { body: { dateSortie } })),
    addReleve: (r) => maj(api("/releves", { body: r })),

    addRecharge: (n) => maj(api("/recharges", { body: n })),
    annulerRecharge: (id, motif) => maj(api(`/recharges/${id}/annuler`, { body: { motif } })),
    payerQuotePart: (id, moyen, reference) => {
      const q = get().quotesParts.find((x) => x.id === id);
      if (!q?.occupantId) return Promise.reject(new Error("Quote-part sans occupant (lot vacant) : rien à encaisser"));
      return maj(api(`/occupants/${q.occupantId}/paiements`, { body: { quotesPartsIds: [id], moyen: moyenApi(moyen), reference } }));
    },
    annulerQuotePart: (id) => maj(api(`/quotes-parts/${id}/annuler`, { body: {} })),
    relancer: async (occupantIds) => (await maj(api("/relances/envoyer", { body: { occupantIds } }))).relances,

    traiterAlerte: (id) => maj(api(`/alertes/${encodeURIComponent(id)}/traiter`, { body: {} })),
  };
});

/** Grille et période courantes (utilisées par les sélecteurs). */
export { clePeriode, grilleEnVigueur };

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
