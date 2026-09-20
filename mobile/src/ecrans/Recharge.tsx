import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Badge, Bouton, C, Carte, Champ, Ecran, Libelle, Titre } from "../ui";
import { fmtF, useStore } from "../store";
import { parserSms, type SmsParse } from "../sms";
import { photographierEtLire } from "../ocr";

/**
 * Enregistrer une recharge : collage du SMS (ou détection automatique du presse-papiers),
 * choix du compteur, montant, kWh du ticket. Hors ligne → file de synchronisation.
 */
export default function Recharge({ route, navigation }: any) {
  const s = useStore();
  const [compteurId, setCompteurId] = useState<string>(route?.params?.compteurId ?? "");
  const [montant, setMontant] = useState("");
  const [kwhTicket, setKwhTicket] = useState("");
  const [code, setCode] = useState("");
  const [ref, setRef] = useState("");
  const [sms, setSms] = useState("");
  const [canal, setCanal] = useState<"sms" | "manuel">("manuel");
  const [analyse, setAnalyse] = useState<SmsParse | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [filtre, setFiltre] = useState("");
  const [ocr, setOcr] = useState(false);

  async function lireTicket(source: "camera" | "galerie") {
    setOcr(true);
    try {
      const r = await photographierEtLire("ticket", source);
      if (!r) return;
      if (r.montant) setMontant(String(Math.round(r.montant)));
      if (r.kwh) setKwhTicket(String(r.kwh));
      if (r.code) setCode(r.code);
      if (r.compteurId) setCompteurId(r.compteurId);
      setCanal("manuel");
      setAnalyse({ operateur: "senelec", montant: r.montant, compteur: r.compteur, kwh: r.kwh, codes: r.code ? [r.code] : [], brut: r.texte });
      Alert.alert("Ticket lu", `${r.moteur} · confiance ${Math.round(r.confiance * 100)} %${r.compteur && !r.compteurId ? `\nCompteur ${r.compteur} inconnu dans votre parc` : ""}\nVérifiez les valeurs avant d'enregistrer.`);
    } catch (e: any) {
      Alert.alert("Lecture impossible", e?.message ?? "Erreur");
    } finally { setOcr(false); }
  }

  useEffect(() => { if (route?.params?.compteurId) setCompteurId(route.params.compteurId); }, [route?.params?.compteurId]);

  // Détection du presse-papiers : si l'agent vient de copier un SMS de recharge, on le propose.
  useEffect(() => {
    const unsub = navigation.addListener("focus", async () => {
      try {
        if (!(await Clipboard.hasStringAsync())) return;
        const t = await Clipboard.getStringAsync();
        if (!t || t === sms) return;
        const p = parserSms(t);
        if (p.montant && p.compteur) {
          Alert.alert("SMS de recharge détecté", `${p.operateur} · ${fmtF(p.montant)} · compteur ${p.compteur}`, [{ text: "Ignorer", style: "cancel" }, { text: "Utiliser", onPress: () => appliquer(t) }]);
        }
      } catch { /* presse-papiers indisponible */ }
    });
    return unsub;
  }, [navigation, sms, s.compteurs]);

  function appliquer(texte: string) {
    const p = parserSms(texte);
    setSms(texte); setAnalyse(p); setCanal("sms");
    if (p.montant) setMontant(String(Math.round(p.montant)));
    if (p.kwh) setKwhTicket(String(p.kwh));
    if (p.codes[0]) setCode(p.codes[0]);
    if (p.reference) setRef(p.reference);
    if (p.compteur) {
      const c = s.compteurs.find((x) => x.numero === p.compteur);
      if (c) setCompteurId(c.id);
      else Alert.alert("Compteur inconnu", `Le compteur ${p.compteur} n'est pas dans votre parc. Choisissez-le dans la liste ou demandez à votre gestionnaire de le créer.`);
    }
  }

  const compteur = s.compteurs.find((c) => c.id === compteurId);
  const site = s.sites.find((x) => x.id === compteur?.siteId);
  const m = Number(montant);

  async function valider() {
    if (!compteur) return Alert.alert("Compteur", "Choisissez un compteur.");
    if (!m || m < 500) return Alert.alert("Montant", "Montant minimum 500 F.");
    setOccupe(true);
    try {
      const r = await s.enregistrerRecharge({ compteurId: compteur.id, date: new Date().toISOString(), montant: m, canal, codeRecharge: code || undefined, referencePaiement: ref || undefined, kwhTicket: kwhTicket ? Number(kwhTicket) : undefined, smsBrut: sms || undefined });
      const detail = r.enLigne ? `${r.resultat.recharge.kwh} kWh crédités${r.resultat.quotesParts?.length ? ` · ${r.resultat.quotesParts.length} quotes-parts envoyées` : ""}` : "Pas de réseau : la recharge est enregistrée sur le téléphone et sera envoyée automatiquement.";
      Alert.alert(r.enLigne ? "Recharge enregistrée" : "Enregistrée hors ligne", detail, [{ text: "OK", onPress: () => { reinitialiser(); navigation.navigate("Compteurs"); } }]);
    } catch (e: any) {
      Alert.alert("Refusé", e?.message ?? "Erreur");
    } finally { setOccupe(false); }
  }

  function reinitialiser() { setMontant(""); setKwhTicket(""); setCode(""); setRef(""); setSms(""); setAnalyse(null); setCanal("manuel"); }

  const liste = s.compteurs.filter((c) => { const t = filtre.toLowerCase(); return !t || c.numero.includes(t) || (c.libelle ?? "").toLowerCase().includes(t) || (s.sites.find((x) => x.id === c.siteId)?.nom ?? "").toLowerCase().includes(t); }).slice(0, 30);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, backgroundColor: C.fond }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Titre>Nouvelle recharge</Titre>

        <Carte>
          <Text style={{ fontWeight: "700", color: C.texte }}>1. Coller le SMS Wave / Orange Money</Text>
          <Text style={{ color: C.gris, fontSize: 12, marginBottom: 6 }}>Copiez le SMS de confirmation, puis collez-le ici (ou il est détecté automatiquement à l'ouverture).</Text>
          <Champ value={sms} onChangeText={setSms} multiline numberOfLines={3} placeholder="Wave: Vous avez acheté du crédit Woyofal de 10 000 FCFA pour le compteur 14210034567…" style={{ minHeight: 70, textAlignVertical: "top" }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Bouton titre="Coller" variante="secondaire" onPress={async () => { const t = await Clipboard.getStringAsync(); if (t) appliquer(t); }} /></View>
            <View style={{ flex: 1 }}><Bouton titre="Analyser" disabled={!sms.trim()} onPress={() => appliquer(sms)} /></View>
          </View>
          {analyse && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              <Badge texte={analyse.operateur} ton="teal" />
              {analyse.montant ? <Badge texte={fmtF(analyse.montant)} ton="vert" /> : <Badge texte="montant ?" ton="rouge" />}
              {analyse.compteur ? <Badge texte={`cpt ${analyse.compteur}`} ton={compteur ? "vert" : "rouge"} /> : <Badge texte="compteur ?" ton="rouge" />}
              {analyse.kwh ? <Badge texte={`${analyse.kwh} kWh`} ton="gris" /> : null}
            </View>
          )}
        </Carte>

        <Carte>
          <Text style={{ fontWeight: "700", color: C.texte }}>Ou photographier le ticket</Text>
          <Text style={{ color: C.gris, fontSize: 12, marginBottom: 4 }}>Ticket de boutique ou d'agence Senelec, écran de confirmation : les valeurs sont lues et proposées.</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Bouton titre="Appareil photo" occupe={ocr} onPress={() => lireTicket("camera")} /></View>
            <View style={{ flex: 1 }}><Bouton titre="Galerie" variante="secondaire" disabled={ocr} onPress={() => lireTicket("galerie")} /></View>
          </View>
        </Carte>

        <Carte>
          <Text style={{ fontWeight: "700", color: C.texte }}>2. Compteur</Text>
          {compteur ? (
            <Pressable onPress={() => setCompteurId("")} style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: C.tealClair }}>
              <Text style={{ fontWeight: "700", color: C.teal }}>{compteur.libelle ?? compteur.numero}</Text>
              <Text style={{ color: C.gris, fontSize: 12 }}>{site?.nom} · {compteur.numero}{compteur.partage ? " · partagé" : ""} — toucher pour changer</Text>
            </Pressable>
          ) : (
            <>
              <Champ value={filtre} onChangeText={setFiltre} placeholder="Filtrer par n°, libellé ou site" style={{ marginTop: 8 }} />
              {liste.map((c) => (
                <Pressable key={c.id} onPress={() => setCompteurId(c.id)} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.bordure }}>
                  <Text style={{ fontWeight: "600", color: C.texte }}>{c.libelle ?? c.numero}</Text>
                  <Text style={{ color: C.gris, fontSize: 12 }}>{s.sites.find((x) => x.id === c.siteId)?.nom} · {c.numero}</Text>
                </Pressable>
              ))}
            </>
          )}
        </Carte>

        <Carte>
          <Text style={{ fontWeight: "700", color: C.texte }}>3. Montant</Text>
          <Libelle>Montant payé (F CFA)</Libelle>
          <Champ value={montant} onChangeText={(t) => setMontant(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="5000" />
          <Libelle>kWh indiqués sur le ticket (facultatif)</Libelle>
          <Champ value={kwhTicket} onChangeText={setKwhTicket} keyboardType="decimal-pad" placeholder="41.2" />
          <Libelle>Code de recharge (20 chiffres, facultatif)</Libelle>
          <Champ value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 20))} keyboardType="number-pad" placeholder="1234 5678 9012 3456 7890" />
          {s.grille && m >= 500 && <Text style={{ color: C.gris, fontSize: 12, marginTop: 8 }}>Redevance de {fmtF(s.grille.redevance)} prélevée si c'est la première recharge du mois. Le calcul exact est fait par le serveur.</Text>}
        </Carte>

        <Bouton titre={s.etat === "horsligne" ? "Enregistrer (hors ligne)" : "Enregistrer la recharge"} occupe={occupe} disabled={!compteur || m < 500} onPress={valider} />
        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
