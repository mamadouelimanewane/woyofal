import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge, Modal } from "./ui";
import { api } from "../api/client";
import { signaler } from "./erreur";
import { orgCourante, useStore } from "../store/useStore";

/**
 * Import du parc depuis Excel (EF-PARC-06) : le classeur est lu côté client (SheetJS),
 * converti en JSON, simulé sur le serveur (rapport ligne par ligne), puis importé.
 */
interface Rapport { sites: number; lots: number; compteurs: number; occupants: number; erreurs: { onglet: string; ligne: number; message: string }[]; importe: boolean }

const ONGLETS = {
  Sites: ["nom", "type", "adresse", "surfaceM2", "budgetMensuel"],
  Lots: ["site", "reference", "surfaceM2", "etage"],
  Compteurs: ["site", "numero", "typeTarif", "libelle", "lots", "regle"],
  Occupants: ["site", "lot", "nom", "telephone", "dateEntree", "caution"],
} as const;

export function telechargerModele(type: "immo" | "entreprise") {
  const wb = XLSX.utils.book_new();
  const ex = type === "immo"
    ? {
        Sites: [{ nom: "Immeuble Sérigne Fallou", type: "immeuble", adresse: "Sacré-Cœur 3", surfaceM2: 620, budgetMensuel: "" }],
        Lots: [{ site: "Immeuble Sérigne Fallou", reference: "Appt 1", surfaceM2: 85, etage: "1" }, { site: "Immeuble Sérigne Fallou", reference: "Appt 2", surfaceM2: 110, etage: "1" }],
        Compteurs: [{ site: "Immeuble Sérigne Fallou", numero: "14210034561", typeTarif: "DPP", libelle: "Appt 1", lots: "Appt 1", regle: "egal" }, { site: "Immeuble Sérigne Fallou", numero: "14210034599", typeTarif: "DPP", libelle: "Parties communes", lots: "Appt 1; Appt 2", regle: "surface" }],
        Occupants: [{ site: "Immeuble Sérigne Fallou", lot: "Appt 1", nom: "Mariama Diallo", telephone: "77 201 00 01", dateEntree: "2025-02-01", caution: 25000 }],
      }
    : {
        Sites: [{ nom: "Pharmacie Liberté 6", type: "pharmacie", adresse: "Liberté 6", surfaceM2: 72, budgetMensuel: 110000 }],
        Lots: [{ site: "Pharmacie Liberté 6", reference: "Officine", surfaceM2: "", etage: "" }],
        Compteurs: [{ site: "Pharmacie Liberté 6", numero: "14200011122", typeTarif: "PRO", libelle: "Officine", lots: "Officine", regle: "" }],
        Occupants: [],
      };
  for (const [nom, cols] of Object.entries(ONGLETS)) {
    const ws = XLSX.utils.json_to_sheet((ex as any)[nom], { header: [...cols] });
    XLSX.utils.book_append_sheet(wb, ws, nom);
  }
  XLSX.writeFile(wb, "kuran-modele-import.xlsx");
}

function lire(fichier: File): Promise<Record<string, any[]>> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Lecture du fichier impossible"));
    fr.onload = () => {
      const wb = XLSX.read(fr.result, { type: "array" });
      const out: Record<string, any[]> = {};
      for (const nom of Object.keys(ONGLETS)) {
        const ws = wb.Sheets[nom] ?? wb.Sheets[nom.toLowerCase()];
        out[nom] = ws ? XLSX.utils.sheet_to_json(ws, { defval: "" }) : [];
      }
      resolve(out);
    };
    fr.readAsArrayBuffer(fichier);
  });
}

const num = (v: unknown) => (v === "" || v == null ? undefined : Number(v));
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const dateISO = (v: unknown) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
};

function versPayload(f: Record<string, any[]>) {
  return {
    sites: f.Sites.filter((r) => str(r.nom)).map((r) => ({ nom: str(r.nom), type: str(r.type) || undefined, adresse: str(r.adresse) || undefined, surfaceM2: num(r.surfaceM2), budgetMensuel: num(r.budgetMensuel) })),
    lots: f.Lots.filter((r) => str(r.reference)).map((r) => ({ site: str(r.site), reference: str(r.reference), surfaceM2: num(r.surfaceM2), etage: str(r.etage) || undefined })),
    compteurs: f.Compteurs.filter((r) => str(r.numero)).map((r) => ({ site: str(r.site), numero: str(r.numero), typeTarif: (["DPP", "DMP", "PRO"].includes(str(r.typeTarif)) ? str(r.typeTarif) : undefined) as any, libelle: str(r.libelle) || undefined, lots: str(r.lots).split(/[;,]/).map((x) => x.trim()).filter(Boolean), regle: (["egal", "surface", "sous_compteur", "forfait"].includes(str(r.regle)) ? str(r.regle) : undefined) as any })),
    occupants: f.Occupants.filter((r) => str(r.nom)).map((r) => ({ site: str(r.site), lot: str(r.lot), nom: str(r.nom), telephone: str(r.telephone) || undefined, dateEntree: dateISO(r.dateEntree), caution: num(r.caution) })),
  };
}

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const org = orgCourante(s)!;
  const [payload, setPayload] = useState<ReturnType<typeof versPayload> | null>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [occupe, setOccupe] = useState(false);

  async function choisir(fichier: File) {
    setOccupe(true);
    setRapport(null);
    try {
      const p = versPayload(await lire(fichier));
      setPayload(p);
      setRapport(await api<Rapport>("/parc/import", { body: { ...p, simuler: true } }));
    } catch (e: any) {
      if (e?.status === 422 && e.corps?.erreurs) setRapport(e.corps as Rapport); // rapport avec erreurs
      else signaler(e);
    } finally { setOccupe(false); }
  }

  async function importer() {
    if (!payload) return;
    setOccupe(true);
    try {
      const r = await api<Rapport>("/parc/import", { body: payload });
      setRapport(r);
      await s.charger();
    } catch (e) { signaler(e); } finally { setOccupe(false); }
  }

  return (
    <Modal title="Importer le parc depuis Excel" onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Classeur à 4 onglets : <strong>Sites</strong>, <strong>Lots</strong>, <strong>Compteurs</strong> (colonne <code>lots</code> = références séparées par « ; », plusieurs lots = compteur partagé), <strong>Occupants</strong>. Les sites et lots déjà présents sont reconnus par leur nom, jamais dupliqués.</p>
          <button className="btn-secondary w-full justify-center" onClick={() => telechargerModele(org.type)}><Download size={16} /> Télécharger le modèle Excel</button>
          <label className="btn-primary w-full justify-center cursor-pointer">
            <Upload size={16} /> Choisir mon fichier .xlsx
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && choisir(e.target.files[0])} />
          </label>
        </div>
        <div className="rounded-xl border bg-slate-50 p-4 text-sm min-h-40">
          {!rapport && !occupe && <div className="text-slate-500 flex items-center gap-2"><FileSpreadsheet size={18} /> Le rapport d'analyse s'affichera ici avant l'import.</div>}
          {occupe && <div className="text-slate-500">Analyse en cours…</div>}
          {rapport && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge tone="teal">{rapport.sites} site(s)</Badge><Badge tone="teal">{rapport.lots} lot(s)</Badge><Badge tone="teal">{rapport.compteurs} compteur(s)</Badge><Badge tone="teal">{rapport.occupants} occupant(s)</Badge>
              </div>
              {rapport.erreurs.length > 0 ? (
                <div>
                  <div className="font-medium text-red-700 mb-1">{rapport.erreurs.length} erreur(s) à corriger dans le fichier :</div>
                  <ul className="max-h-48 overflow-y-auto space-y-0.5">
                    {rapport.erreurs.map((e, i) => <li key={i} className="text-xs"><span className="font-mono text-slate-500">{e.onglet} L{e.ligne}</span> — {e.message}</li>)}
                  </ul>
                </div>
              ) : rapport.importe ? (
                <div className="font-medium text-emerald-700">Import terminé.</div>
              ) : (
                <div className="text-emerald-700">Aucune erreur : prêt à importer.</div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>{rapport?.importe ? "Fermer" : "Annuler"}</button>
        {rapport && !rapport.importe && rapport.erreurs.length === 0 && <button className="btn-primary" disabled={occupe} onClick={importer}>Importer</button>}
      </div>
    </Modal>
  );
}
