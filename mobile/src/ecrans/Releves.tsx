import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text } from "react-native";
import { Bouton, C, Carte, Champ, Ecran, Libelle, Titre } from "../ui";
import { useStore } from "../store";
import { photographierEtLire } from "../ocr";

/** Relevé d'index des sous-compteurs (lots des compteurs partagés en règle « sous_compteur »). */
export default function Releves() {
  const s = useStore();
  const [lotId, setLotId] = useState("");
  const [index, setIndex] = useState("");
  const [filtre, setFiltre] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [ocr, setOcr] = useState(false);

  async function lireIndex() {
    setOcr(true);
    try {
      const r = await photographierEtLire("index", "camera");
      if (!r) return;
      if (r.index != null) { setIndex(String(r.index)); Alert.alert("Index lu", `${r.index} kWh (confiance ${Math.round(r.confiance * 100)} %) — vérifiez avant d'enregistrer.`); }
      else Alert.alert("Index illisible", "Rapprochez-vous de l'afficheur, évitez les reflets, puis réessayez ou saisissez l'index.");
    } catch (e: any) { Alert.alert("Lecture impossible", e?.message ?? "Erreur"); } finally { setOcr(false); }
  }

  // Lots des sites visibles, présentés par site
  const lots = useMemo(() => s.lots.map((l) => ({ l, site: s.sites.find((x) => x.id === l.siteId) })).filter(({ l, site }) => { const t = filtre.toLowerCase(); return !t || l.reference.toLowerCase().includes(t) || (site?.nom ?? "").toLowerCase().includes(t); }).sort((a, b) => (a.site?.nom ?? "").localeCompare(b.site?.nom ?? "") || a.l.reference.localeCompare(b.l.reference)), [s.lots, s.sites, filtre]);
  const lot = lots.find((x) => x.l.id === lotId);

  async function valider() {
    if (!lot || !index) return;
    setOccupe(true);
    try {
      const r = await s.enregistrerReleve({ lotId: lot.l.id, date: new Date().toISOString().slice(0, 10), index: Number(index) });
      Alert.alert(r.enLigne ? "Relevé enregistré" : "Enregistré hors ligne", `${lot.site?.nom} · ${lot.l.reference} : index ${index}`);
      setIndex(""); setLotId("");
    } catch (e: any) { Alert.alert("Refusé", e?.message ?? "Erreur"); } finally { setOccupe(false); }
  }

  return (
    <Ecran>
      <Titre>Relevé de sous-compteur</Titre>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Carte>
          <Text style={{ color: C.gris, fontSize: 12 }}>Notez l'index affiché par le petit compteur divisionnaire de chaque lot. KURAÑ utilise la différence entre deux relevés pour répartir les recharges du compteur principal.</Text>
          {lot ? (
            <Pressable onPress={() => setLotId("")} style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: C.tealClair }}>
              <Text style={{ fontWeight: "700", color: C.teal }}>{lot.site?.nom} · {lot.l.reference}</Text>
              <Text style={{ color: C.gris, fontSize: 12 }}>toucher pour changer</Text>
            </Pressable>
          ) : (
            <>
              <Champ value={filtre} onChangeText={setFiltre} placeholder="Filtrer par site ou lot" style={{ marginTop: 10 }} />
              {lots.slice(0, 40).map(({ l, site }) => (
                <Pressable key={l.id} onPress={() => setLotId(l.id)} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.bordure }}>
                  <Text style={{ fontWeight: "600", color: C.texte }}>{l.reference}</Text>
                  <Text style={{ color: C.gris, fontSize: 12 }}>{site?.nom}</Text>
                </Pressable>
              ))}
            </>
          )}
          <Libelle>Index relevé (kWh)</Libelle>
          <Champ value={index} onChangeText={(t) => setIndex(t.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" placeholder="1234" />
          <Bouton titre="Photographier l'afficheur" variante="secondaire" occupe={ocr} onPress={lireIndex} />
          <Bouton titre="Enregistrer le relevé" occupe={occupe} disabled={!lot || !index} onPress={valider} />
        </Carte>
      </ScrollView>
    </Ecran>
  );
}
