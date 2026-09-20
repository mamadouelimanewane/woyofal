import { useEffect, useState } from "react";
import { Building2, Gauge, LogOut, MessageSquareText, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { Badge, Card, Field, Modal, Stat } from "../components/ui";
import { api } from "../api/client";
import { signaler, toast } from "../components/erreur";
import { useStore } from "../store/useStore";
import { fmtF } from "../lib/tarif";

interface Org { id: string; nom: string; type: string; plan: string; statut: string; finEssai: string | null; creeLe: string; nbCompteurs: number; nbSites: number; nbUtilisateurs: number }
interface Grille { id: string; dateEffet: string; libelle: string; tranche1: string; tranche2: string; tranche3: string; seuilT1: number; seuilT2: number; redevance: number; seuilTva: number; tauxTva: string; tauxTaxeCommunale: string }
interface Pattern { id: string; operateur: string; version: number; regex: string; champsMap: Record<string, number>; actif: boolean; dateEffet: string }
interface Notif { id: string; organisationId: string; destinataire: string; canal: string; modele: string; statut: string; tentatives: number; erreur: string | null; creeLe: string }

const PLANS = ["gratuit", "starter", "immo", "entreprise", "groupe"];
const STATUTS = ["essai", "actif", "lecture_seule", "resilie"];

function tarif(o: Org): number {
  switch (o.plan) {
    case "starter": return 10000;
    case "immo": { const p: [number, number][] = [[80, 40000], [200, 90000], [500, 200000]]; const f = p.find(([m]) => o.nbCompteurs <= m); const u = o.nbCompteurs * 600; return f && f[1] < u ? f[1] : u; }
    case "entreprise": return Math.max(10, o.nbSites) * 3000;
    default: return 0;
  }
}

/** Console super-admin (EF-ABO-06, EF-TARIF-02, EF-RECH-04) : organisations, grille, patterns SMS, file d'envoi. */
export default function Admin() {
  const s = useStore();
  const [onglet, setOnglet] = useState<"orgs" | "grille" | "sms" | "envois">("orgs");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [grilles, setGrilles] = useState<Grille[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [stats, setStats] = useState<{ total: number; rattaches: number; taux: number | null; alerte: boolean } | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [creer, setCreer] = useState(false);
  const [nouvelleGrille, setNouvelleGrille] = useState(false);
  const [nouveauPattern, setNouveauPattern] = useState(false);
  const [test, setTest] = useState({ texte: "", resultat: null as any });

  const charger = () => Promise.all([
    api<Org[]>("/admin/organisations").then(setOrgs),
    api<Grille[]>("/grille").then(setGrilles),
    api<Pattern[]>("/admin/patterns-sms").then(setPatterns),
    api("/admin/parsing/stats").then(setStats),
    api<Notif[]>("/admin/notifications").then(setNotifs),
  ]).catch(signaler);
  useEffect(() => { void charger(); }, []);

  const mrr = orgs.filter((o) => o.statut === "actif").reduce((a, o) => a + tarif(o), 0);
  const potentiel = orgs.reduce((a, o) => a + tarif(o), 0);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck className="text-brand-500" /> KURAÑ · Administration</div>
        <div className="flex items-center gap-3 text-sm"><span className="text-slate-400">{s.utilisateurs[0]?.nom ?? "Super-admin"}</span><button className="btn-ghost text-slate-300" onClick={() => s.logout()}><LogOut size={16} /></button></div>
      </header>
      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex gap-1 mb-5 flex-wrap">
          {([["orgs", "Organisations", Building2], ["grille", "Grille tarifaire", Gauge], ["sms", "Patterns SMS", MessageSquareText], ["envois", "File d'envoi", Send]] as const).map(([id, label, Icon]) => (
            <button key={id} className={`btn text-sm ${onglet === id ? "bg-brand-700 text-white" : "bg-white text-slate-600 border"}`} onClick={() => setOnglet(id)}><Icon size={15} /> {label}</button>
          ))}
          <button className="btn-ghost ml-auto" onClick={charger} title="Actualiser"><RefreshCw size={16} /></button>
        </div>

        {onglet === "orgs" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <Stat label="Organisations" value={orgs.length} hint={`${orgs.filter((o) => o.statut === "essai").length} en essai · ${orgs.filter((o) => o.statut === "actif").length} actives`} />
              <Stat label="Compteurs gérés" value={orgs.reduce((a, o) => a + o.nbCompteurs, 0)} hint={`${orgs.reduce((a, o) => a + o.nbSites, 0)} sites`} />
              <Stat label="MRR (organisations actives)" value={fmtF(mrr)} tone="good" />
              <Stat label="MRR potentiel (tout le parc)" value={fmtF(potentiel)} hint="au tarif public selon l'usage" />
            </div>
            <Card title="Organisations" action={<button className="btn-primary" onClick={() => setCreer(true)}><Plus size={16} /> Organisation</button>}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><th className="th pl-0">Organisation</th><th className="th">Type</th><th className="th">Plan</th><th className="th">Statut</th><th className="th text-right">Sites</th><th className="th text-right">Compteurs</th><th className="th text-right">Utilisateurs</th><th className="th text-right">Tarif / mois</th><th className="th">Échéance</th><th className="th">Créée</th></tr></thead>
                  <tbody>
                    {orgs.map((o) => (
                      <tr key={o.id}>
                        <td className="td pl-0 font-medium">{o.nom}</td>
                        <td className="td"><Badge tone="teal">{o.type}</Badge></td>
                        <td className="td"><select className="input py-1 text-xs w-auto" value={o.plan} onChange={(e) => api(`/admin/organisations/${o.id}`, { method: "PATCH", body: { plan: e.target.value } }).then(charger, signaler)}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select></td>
                        <td className="td"><select className="input py-1 text-xs w-auto" value={o.statut} onChange={(e) => api(`/admin/organisations/${o.id}`, { method: "PATCH", body: { statut: e.target.value } }).then(charger, signaler)}>{STATUTS.map((p) => <option key={p}>{p}</option>)}</select></td>
                        <td className="td text-right">{o.nbSites}</td>
                        <td className="td text-right">{o.nbCompteurs}</td>
                        <td className="td text-right">{o.nbUtilisateurs}</td>
                        <td className="td text-right font-semibold">{fmtF(tarif(o))}</td>
                        <td className="td text-xs">{o.finEssai ? new Date(o.finEssai).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="td text-xs text-slate-500">{new Date(o.creeLe).toLocaleDateString("fr-FR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {onglet === "grille" && (
          <Card title="Grilles tarifaires (versionnées par date d'effet)" action={<button className="btn-primary" onClick={() => setNouvelleGrille(true)}><Plus size={16} /> Nouvelle grille</button>}>
            <table className="w-full">
              <thead><tr><th className="th pl-0">Date d'effet</th><th className="th">Libellé</th><th className="th text-right">T1</th><th className="th text-right">T2</th><th className="th text-right">T3</th><th className="th text-right">Seuils</th><th className="th text-right">Redevance</th><th className="th text-right">TVA</th><th className="th text-right">Taxe com.</th></tr></thead>
              <tbody>{grilles.map((g) => <tr key={g.id}><td className="td pl-0 font-mono">{g.dateEffet}</td><td className="td">{g.libelle}</td><td className="td text-right">{g.tranche1}</td><td className="td text-right">{g.tranche2}</td><td className="td text-right">{g.tranche3}</td><td className="td text-right">{g.seuilT1} / {g.seuilT2} kWh</td><td className="td text-right">{g.redevance} F</td><td className="td text-right">{Math.round(Number(g.tauxTva) * 100)} % &gt; {g.seuilTva} kWh</td><td className="td text-right">{(Number(g.tauxTaxeCommunale) * 100).toFixed(1)} %</td></tr>)}</tbody>
            </table>
            <p className="text-xs text-slate-500 mt-3">Une nouvelle grille s'applique aux recharges à partir de sa date d'effet ; les recharges passées ne sont jamais recalculées.</p>
          </Card>
        )}

        {onglet === "sms" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="SMS reçus (7 j)" value={stats?.total ?? 0} />
              <Stat label="Rattachés automatiquement" value={stats?.rattaches ?? 0} />
              <Stat label="Taux de parsing" value={stats?.taux == null ? "—" : `${stats.taux} %`} tone={stats?.alerte ? "bad" : "good"} hint={stats?.alerte ? "sous 90 % : vérifier les formats opérateurs" : undefined} />
            </div>
            <Card title="Patterns par opérateur" action={<button className="btn-primary" onClick={() => setNouveauPattern(true)}><Plus size={16} /> Pattern</button>}>
              {patterns.length === 0 && <p className="text-sm text-slate-500">Aucun pattern spécifique : le parseur générique (montant, compteur 11 chiffres, code 20 chiffres, kWh) est utilisé.</p>}
              <ul className="divide-y divide-slate-100">
                {patterns.map((p) => (
                  <li key={p.id} className="py-2 flex items-center gap-3">
                    <Badge tone={p.actif ? "green" : "slate"}>{p.operateur} v{p.version}</Badge>
                    <code className="flex-1 text-xs font-mono break-all">{p.regex}</code>
                    <span className="text-xs text-slate-500">{p.dateEffet}</span>
                    <button className="btn-secondary text-xs" onClick={() => api(`/admin/patterns-sms/${p.id}`, { method: "PATCH", body: { actif: !p.actif } }).then(charger, signaler)}>{p.actif ? "Désactiver" : "Activer"}</button>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Tester un SMS">
              <textarea className="input h-20" value={test.texte} onChange={(e) => setTest({ ...test, texte: e.target.value })} placeholder="Collez un SMS Wave / Orange Money / Free…" />
              <button className="btn-secondary mt-2" onClick={() => api("/admin/patterns-sms/tester", { body: { texte: test.texte } }).then((r) => setTest({ ...test, resultat: r }), signaler)}>Analyser</button>
              {test.resultat && <pre className="mt-3 text-xs bg-slate-50 rounded-lg p-3 overflow-x-auto">{JSON.stringify({ ...test.resultat, brut: undefined }, null, 2)}</pre>}
            </Card>
          </div>
        )}

        {onglet === "envois" && (
          <Card title="File de notifications (200 dernières)" action={<button className="btn-secondary" onClick={() => api("/admin/notifications/traiter", { body: {} }).then((r) => { toast(`Envoyées : ${r.envoyees} · échecs : ${r.echecs} · reportées : ${r.reportees}`, "succes"); void charger(); }, signaler)}><Send size={16} /> Traiter la file</button>}>
            <p className="text-xs text-slate-500 mb-3">Sans fournisseur configuré (WhatsApp Business, SMS, Resend), les messages restent « en attente ».</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className="th pl-0">Date</th><th className="th">Canal</th><th className="th">Modèle</th><th className="th">Destinataire</th><th className="th">Statut</th><th className="th text-right">Essais</th></tr></thead>
                <tbody>{notifs.map((n) => <tr key={n.id}><td className="td pl-0 text-xs whitespace-nowrap">{new Date(n.creeLe).toLocaleString("fr-FR")}</td><td className="td"><Badge>{n.canal}</Badge></td><td className="td text-xs">{n.modele}</td><td className="td text-xs font-mono">{n.destinataire}</td><td className="td"><Badge tone={n.statut === "envoye" || n.statut === "delivre" ? "green" : n.statut === "echec" ? "red" : "amber"}>{n.statut}</Badge>{n.erreur && <span className="text-xs text-slate-500 ml-1">{n.erreur}</span>}</td><td className="td text-right">{n.tentatives}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        )}
      </main>

      {creer && <CreerOrgModal onClose={() => { setCreer(false); void charger(); }} />}
      {nouvelleGrille && <GrilleModal base={grilles[grilles.length - 1]} onClose={() => { setNouvelleGrille(false); void charger(); }} />}
      {nouveauPattern && <PatternModal onClose={() => { setNouveauPattern(false); void charger(); }} />}
    </div>
  );
}

function CreerOrgModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ nom: "", type: "immo", plan: "gratuit", adminNom: "", adminTel: "", adminEmail: "" });
  return (
    <Modal title="Nouvelle organisation" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nom"><input className="input" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Édition"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="immo">Immo</option><option value="entreprise">Entreprise</option></select></Field>
          <Field label="Plan"><select className="input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        </div>
        <Field label="Administrateur — nom"><input className="input" value={f.adminNom} onChange={(e) => setF({ ...f, adminNom: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone"><input className="input" value={f.adminTel} onChange={(e) => setF({ ...f, adminTel: e.target.value })} placeholder="77 000 00 00" /></Field>
          <Field label="E-mail (facultatif)"><input className="input" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={!f.nom || !f.adminNom || f.adminTel.replace(/\D/g, "").length < 9} onClick={() => api("/admin/organisations", { body: { nom: f.nom, type: f.type, plan: f.plan, admin: { nom: f.adminNom, telephone: f.adminTel, email: f.adminEmail || undefined } } }).then(onClose, signaler)}>Créer</button>
      </div>
    </Modal>
  );
}

function GrilleModal({ base, onClose }: { base?: Grille; onClose: () => void }) {
  const [f, setF] = useState({ dateEffet: "", libelle: "", tranche1: base?.tranche1 ?? "82", tranche2: base?.tranche2 ?? "136.49", tranche3: base?.tranche3 ?? "159.36", seuilT1: String(base?.seuilT1 ?? 150), seuilT2: String(base?.seuilT2 ?? 250), redevance: String(base?.redevance ?? 1155), seuilTva: String(base?.seuilTva ?? 250), tauxTva: base?.tauxTva ?? "0.18", tauxTaxeCommunale: base?.tauxTaxeCommunale ?? "0.025" });
  const champ = (k: keyof typeof f, label: string) => <Field label={label}><input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <Modal title="Nouvelle grille tarifaire" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {champ("dateEffet", "Date d'effet (AAAA-MM-JJ)")}{champ("libelle", "Libellé")}
        {champ("tranche1", "Tranche 1 (F/kWh)")}{champ("tranche2", "Tranche 2 (F/kWh)")}{champ("tranche3", "Tranche 3 (F/kWh)")}
        {champ("seuilT1", "Fin T1 (kWh)")}{champ("seuilT2", "Fin T2 (kWh)")}{champ("redevance", "Redevance (F/mois)")}
        {champ("seuilTva", "Seuil TVA (kWh)")}{champ("tauxTva", "Taux TVA (0.18)")}{champ("tauxTaxeCommunale", "Taxe communale (0.025)")}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(f.dateEffet) || f.libelle.length < 3} onClick={() => api("/admin/grille", { body: { dateEffet: f.dateEffet, libelle: f.libelle, tranche1: Number(f.tranche1), tranche2: Number(f.tranche2), tranche3: Number(f.tranche3), seuilT1: Number(f.seuilT1), seuilT2: Number(f.seuilT2), redevance: Number(f.redevance), seuilTva: Number(f.seuilTva), tauxTva: Number(f.tauxTva), tauxTaxeCommunale: Number(f.tauxTaxeCommunale) } }).then(onClose, signaler)}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function PatternModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ operateur: "wave", regex: "", champsMap: '{"montant": 1, "compteur": 2, "code": 3, "kwh": 4}', dateEffet: new Date().toISOString().slice(0, 10) });
  return (
    <Modal title="Nouveau pattern SMS" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opérateur"><select className="input" value={f.operateur} onChange={(e) => setF({ ...f, operateur: e.target.value })}><option value="wave">Wave</option><option value="orange">Orange Money</option><option value="free">Free Money</option><option value="senelec">Senelec</option></select></Field>
          <Field label="Date d'effet"><input className="input" value={f.dateEffet} onChange={(e) => setF({ ...f, dateEffet: e.target.value })} /></Field>
        </div>
        <Field label="Expression régulière (groupes capturants)" hint="Ex. : Woyofal de ([\d\s]+) ?F.*compteur (\d{11}).*Code: ([\d\s]{20,24}).*?([\d.]+) kWh"><input className="input font-mono" value={f.regex} onChange={(e) => setF({ ...f, regex: e.target.value })} /></Field>
        <Field label="Correspondance groupe → champ (JSON)"><input className="input font-mono" value={f.champsMap} onChange={(e) => setF({ ...f, champsMap: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={f.regex.length < 5} onClick={() => { let champsMap; try { champsMap = JSON.parse(f.champsMap); } catch { return toast("JSON invalide", "erreur"); } api("/admin/patterns-sms", { body: { ...f, champsMap } }).then(onClose, signaler); }}>Enregistrer</button>
      </div>
    </Modal>
  );
}
