import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Badge, Bouton, C, Carte, Champ, Ecran, Libelle, Ligne, Titre } from "../ui";
import { fmtF, useStore } from "../store";
import { URL_DEFAUT, definirUrlServeur, urlServeur } from "../api";

const ROLE: Record<string, string> = { admin: "Administrateur", gestionnaire: "Gestionnaire", agent: "Agent de site", lecture: "Lecture seule", superadmin: "Super-admin" };

export default function Profil() {
  const s = useStore();
  const [url, setUrl] = useState("");
  const [editUrl, setEditUrl] = useState(false);
  useEffect(() => { urlServeur().then(setUrl); }, []);

  return (
    <Ecran>
      <Titre>Profil</Titre>
      <ScrollView>
        <Carte>
          <Text style={{ fontWeight: "800", fontSize: 18, color: C.texte }}>{s.utilisateur?.nom}</Text>
          <Text style={{ color: C.gris }}>{ROLE[s.utilisateur?.role ?? ""] ?? s.utilisateur?.role} · {s.utilisateur?.telephone}</Text>
          <Text style={{ color: C.teal, fontWeight: "700", marginTop: 8 }}>{s.organisation?.nom}</Text>
          <Text style={{ color: C.gris, fontSize: 12 }}>{s.organisation?.type === "immo" ? "Édition Immo" : "Édition Entreprise"} · {s.sites.length} site(s) · {s.compteurs.length} compteur(s)</Text>
          <Text style={{ color: C.gris, fontSize: 11, marginTop: 6 }}>Données mises à jour : {s.chargeLe ? new Date(s.chargeLe).toLocaleString("fr-FR") : "—"} {s.etat === "horsligne" ? "(hors ligne)" : ""}</Text>
          <Bouton titre="Actualiser" variante="secondaire" onPress={() => s.charger()} />
        </Carte>

        <Carte>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "700", color: C.texte }}>À synchroniser</Text>
            <Badge texte={String(s.file.length)} ton={s.file.length ? "ambre" : "vert"} />
          </View>
          {s.file.length === 0 ? (
            <Text style={{ color: C.gris, fontSize: 12, marginTop: 6 }}>Tout est envoyé au serveur.</Text>
          ) : (
            <>
              {s.file.map((f) => (
                <Ligne key={f.id}
                  gauche={<><Text style={{ fontWeight: "600", color: C.texte }}>{f.type === "recharge" ? `Recharge ${fmtF(Number(f.corps.montant))}` : `Relevé index ${f.corps.index}`}</Text><Text style={{ color: f.erreur ? C.rouge : C.gris, fontSize: 11 }}>{f.erreur ?? new Date(f.creeLe).toLocaleString("fr-FR")}</Text></>}
                  droite={f.erreur ? <Text onPress={() => Alert.alert("Retirer ?", "Cet élément a été refusé par le serveur. Le retirer de la file ?", [{ text: "Annuler" }, { text: "Retirer", style: "destructive", onPress: () => s.retirerDeLaFile(f.id) }])} style={{ color: C.rouge, fontWeight: "700" }}>Retirer</Text> : null}
                />
              ))}
              <Bouton titre="Synchroniser maintenant" occupe={s.synchroEnCours} onPress={async () => { const r = await s.synchroniser(); Alert.alert("Synchronisation", `${r.envoyes} envoyé(s), ${r.echecs} en échec`); }} />
            </>
          )}
        </Carte>

        <Carte>
          <Text style={{ fontWeight: "700", color: C.texte }}>Capture automatique des SMS</Text>
          <Text style={{ color: C.gris, fontSize: 12, marginTop: 4 }}>Sur Android, la version installée (hors Expo Go) lit les SMS Wave / Orange Money et les envoie seule. En attendant : copiez le SMS, ouvrez KURAÑ, il est détecté et proposé automatiquement.</Text>
        </Carte>

        <Carte>
          <Text style={{ fontWeight: "700", color: C.texte }}>Serveur</Text>
          {editUrl ? (
            <>
              <Libelle>URL</Libelle>
              <Champ value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder={URL_DEFAUT} />
              <Bouton titre="Enregistrer" onPress={async () => { await definirUrlServeur(url || URL_DEFAUT); setEditUrl(false); await s.charger(); }} />
            </>
          ) : (
            <Text onPress={() => setEditUrl(true)} style={{ color: C.gris, fontSize: 12, marginTop: 4 }}>{url} — toucher pour modifier (tests locaux : http://IP-du-PC:3001)</Text>
          )}
        </Carte>

        <Bouton titre="Se déconnecter" variante="danger" onPress={() => Alert.alert("Se déconnecter ?", s.file.length ? `${s.file.length} élément(s) non synchronisé(s) seront conservés sur le téléphone.` : "", [{ text: "Annuler" }, { text: "Se déconnecter", style: "destructive", onPress: () => s.deconnecter() }])} />
        <View style={{ height: 30 }} />
      </ScrollView>
    </Ecran>
  );
}
