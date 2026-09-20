/**
 * État de l'application agent : session, instantané léger de l'organisation (sites, lots,
 * compteurs, recharges du mois) et file hors ligne des recharges / relevés à synchroniser.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ecrireSession, lireSession } from "./api";

export interface Site { id: string; nom: string; type: string; adresse: string }
export interface Lot { id: string; siteId: string; reference: string }
export interface Compteur { id: string; siteId: string; numero: string; libelle?: string; typeTarif: string; statut: string; partage: boolean; prevision?: { kwhParJour: number; soldeEstime: number; joursRestants: number | null; dateZero: string | null; nbRecharges: number; kwhPourFinDeMois: number } | null }
export interface Recharge { id: string; compteurId: string; date: string; montant: number; kwh: number; trancheAtteinte: number; canal: string }
export interface Utilisateur { id: string; nom: string; role: string; telephone: string }

export interface EnAttente {
  id: string;
  type: "recharge" | "releve";
  creeLe: string;
  corps: Record<string, unknown>;
  erreur?: string;
}

interface State {
  etat: "init" | "anonyme" | "pret" | "horsligne";
  utilisateur: Utilisateur | null;
  organisation: { id: string; nom: string; type: string } | null;
  sites: Site[]; lots: Lot[]; compteurs: Compteur[]; recharges: Recharge[];
  grille: { tranche1: number; seuilT1: number; seuilT2: number; redevance: number } | null;
  file: EnAttente[];
  synchroEnCours: boolean;
  chargeLe: string | null;

  demarrer: () => Promise<void>;
  charger: () => Promise<void>;
  demanderOtp: (telephone: string) => Promise<{ devCode?: string }>;
  connecter: (telephone: string, code: string) => Promise<void>;
  connecterEmail: (email: string, motDePasse: string) => Promise<void>;
  deconnecter: () => Promise<void>;
  enregistrerRecharge: (corps: Record<string, unknown>) => Promise<{ enLigne: boolean; resultat?: any }>;
  enregistrerReleve: (corps: Record<string, unknown>) => Promise<{ enLigne: boolean }>;
  synchroniser: () => Promise<{ envoyes: number; echecs: number }>;
  retirerDeLaFile: (id: string) => Promise<void>;
}

const CLE_CACHE = "kuran-cache";
const CLE_FILE = "kuran-file";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export const useStore = create<State>()((set, get) => ({
  etat: "init", utilisateur: null, organisation: null, sites: [], lots: [], compteurs: [], recharges: [], grille: null, file: [], synchroEnCours: false, chargeLe: null,

  demarrer: async () => {
    const file = JSON.parse((await AsyncStorage.getItem(CLE_FILE)) ?? "[]");
    set({ file });
    if (!(await lireSession())) return set({ etat: "anonyme" });
    const cache = await AsyncStorage.getItem(CLE_CACHE);
    if (cache) set({ ...JSON.parse(cache), etat: "horsligne" });
    await get().charger();
  },

  charger: async () => {
    try {
      const [me, snap] = await Promise.all([api("/auth/me"), api("/snapshot")]);
      const g = snap.grilles?.[snap.grilles.length - 1];
      const donnees = {
        utilisateur: { id: me.utilisateur.id, nom: me.utilisateur.nom, role: me.utilisateur.role, telephone: me.utilisateur.telephone },
        organisation: snap.organisation, sites: snap.sites, lots: snap.lots,
        compteurs: snap.compteurs.filter((c: Compteur) => c.statut === "actif"),
        recharges: (snap.recharges as Recharge[]).slice(0, 2000),
        grille: g ? { tranche1: g.tranche1, seuilT1: g.seuilT1, seuilT2: g.seuilT2, redevance: g.redevance } : null,
        chargeLe: new Date().toISOString(),
      };
      await AsyncStorage.setItem(CLE_CACHE, JSON.stringify(donnees));
      set({ ...donnees, etat: "pret" });
      if (get().file.length) void get().synchroniser();
    } catch (e: any) {
      if (e?.status === 401) { await ecrireSession(null); set({ etat: "anonyme", utilisateur: null, organisation: null }); }
      else set({ etat: get().organisation ? "horsligne" : get().etat === "init" ? "anonyme" : get().etat });
    }
  },

  demanderOtp: (telephone) => api("/auth/otp/request", { body: { telephone }, auth: false }),
  connecter: async (telephone, code) => {
    const j = await api("/auth/otp/verify", { body: { telephone, code }, auth: false });
    await ecrireSession({ accessToken: j.accessToken, refreshToken: j.refreshToken });
    await get().charger();
  },
  connecterEmail: async (email, motDePasse) => {
    const j = await api("/auth/login", { body: { email, motDePasse }, auth: false });
    await ecrireSession({ accessToken: j.accessToken, refreshToken: j.refreshToken });
    await get().charger();
  },
  deconnecter: async () => {
    await ecrireSession(null);
    await AsyncStorage.removeItem(CLE_CACHE);
    set({ etat: "anonyme", utilisateur: null, organisation: null, sites: [], lots: [], compteurs: [], recharges: [] });
  },

  enregistrerRecharge: async (corps) => {
    try {
      const resultat = await api("/recharges", { body: corps, timeoutMs: 15_000 });
      void get().charger();
      return { enLigne: true, resultat };
    } catch (e: any) {
      if (e instanceof Error && e.name !== "AbortError" && (e as any).status) throw e; // erreur métier (doublon, validation) : ne pas mettre en file
      const file = [...get().file, { id: uid(), type: "recharge" as const, creeLe: new Date().toISOString(), corps }];
      await AsyncStorage.setItem(CLE_FILE, JSON.stringify(file));
      set({ file });
      return { enLigne: false };
    }
  },

  enregistrerReleve: async (corps) => {
    try {
      await api("/releves", { body: corps, timeoutMs: 15_000 });
      return { enLigne: true };
    } catch (e: any) {
      if ((e as any).status) throw e;
      const file = [...get().file, { id: uid(), type: "releve" as const, creeLe: new Date().toISOString(), corps }];
      await AsyncStorage.setItem(CLE_FILE, JSON.stringify(file));
      set({ file });
      return { enLigne: false };
    }
  },

  synchroniser: async () => {
    if (get().synchroEnCours) return { envoyes: 0, echecs: 0 };
    set({ synchroEnCours: true });
    let envoyes = 0, echecs = 0;
    let file = [...get().file];
    for (const item of [...file]) {
      try {
        await api(item.type === "recharge" ? "/recharges" : "/releves", { body: item.corps, timeoutMs: 15_000 });
        file = file.filter((x) => x.id !== item.id);
        envoyes++;
      } catch (e: any) {
        if (e?.status === 409) { file = file.filter((x) => x.id !== item.id); envoyes++; continue; } // déjà enregistrée côté serveur
        if (e?.status) file = file.map((x) => (x.id === item.id ? { ...x, erreur: e.message } : x)); // erreur métier : conservée avec le motif
        echecs++;
      }
    }
    await AsyncStorage.setItem(CLE_FILE, JSON.stringify(file));
    set({ file, synchroEnCours: false });
    if (envoyes) void get().charger();
    return { envoyes, echecs };
  },

  retirerDeLaFile: async (id) => {
    const file = get().file.filter((x) => x.id !== id);
    await AsyncStorage.setItem(CLE_FILE, JSON.stringify(file));
    set({ file });
  },
}));

/** Cumul du mois courant d'un compteur (recharges en cache). */
export function cumulMois(recharges: Recharge[], compteurId: string): { kwh: number; montant: number; nb: number } {
  const now = new Date();
  const sel = recharges.filter((r) => r.compteurId === compteurId && new Date(r.date).getFullYear() === now.getFullYear() && new Date(r.date).getMonth() === now.getMonth());
  return { kwh: sel.reduce((a, r) => a + r.kwh, 0), montant: sel.reduce((a, r) => a + r.montant, 0), nb: sel.length };
}

export const fmtF = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} F`;
