import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Bouton, C, Champ, Ecran, Libelle } from "../ui";
import { useStore } from "../store";

export default function Connexion() {
  const s = useStore();
  const [telephone, setTelephone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [etape, setEtape] = useState<"telephone" | "code">("telephone");
  const [mode, setMode] = useState<"otp" | "email">("otp");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  async function lancer(fn: () => Promise<unknown>) {
    setErreur(""); setOccupe(true);
    try { await fn(); } catch (e: any) { setErreur(e?.message ?? "Erreur réseau"); } finally { setOccupe(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Ecran style={{ backgroundColor: C.sombre, justifyContent: "center" }}>
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <Text style={{ color: "#fff", fontSize: 34, fontWeight: "900" }}>KURAÑ</Text>
          <Text style={{ color: "#94a3b8", marginTop: 4 }}>Application agent · compteurs Woyofal</Text>
        </View>
        <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 18 }}>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            {(["otp", "email"] as const).map((m) => (
              <Text key={m} onPress={() => { setMode(m); setErreur(""); }} style={{ flex: 1, textAlign: "center", paddingVertical: 8, fontWeight: "700", color: mode === m ? C.teal : C.gris, borderBottomWidth: 2, borderBottomColor: mode === m ? C.teal : C.bordure }}>{m === "otp" ? "Téléphone" : "E-mail"}</Text>
            ))}
          </View>
          {mode === "email" ? (
            <>
              <Libelle>E-mail</Libelle>
              <Champ value={email} onChangeText={setEmail} placeholder="agent@demo.kuran.sn" keyboardType="email-address" autoCapitalize="none" />
              <Libelle>Mot de passe</Libelle>
              <Champ value={motDePasse} onChangeText={setMotDePasse} placeholder="••••••••" secureTextEntry />
              {erreur ? <Text style={{ color: C.rouge, marginTop: 8 }}>{erreur}</Text> : null}
              <Bouton titre="Se connecter" occupe={occupe} disabled={!email.includes("@") || motDePasse.length < 10} onPress={() => lancer(() => s.connecterEmail(email.trim(), motDePasse))} />
            </>
          ) : (
          <>
          <Libelle>Numéro de téléphone</Libelle>
          <Champ value={telephone} onChangeText={setTelephone} placeholder="77 000 00 00" keyboardType="phone-pad" editable={etape === "telephone"} />
          {etape === "code" && (
            <>
              <Libelle>Code reçu par SMS</Libelle>
              <Champ value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" keyboardType="number-pad" autoFocus style={{ textAlign: "center", letterSpacing: 6, fontSize: 22 }} />
              {devCode && <Text style={{ color: C.ambre, fontSize: 12, marginTop: 6 }}>Mode démonstration — code : {devCode}</Text>}
            </>
          )}
          {erreur ? <Text style={{ color: C.rouge, marginTop: 8 }}>{erreur}</Text> : null}
          {etape === "telephone" ? (
            <Bouton titre="Recevoir un code" occupe={occupe} disabled={telephone.replace(/\D/g, "").length < 9} onPress={() => lancer(async () => { const r = await s.demanderOtp(telephone); setDevCode(r.devCode ?? null); setEtape("code"); })} />
          ) : (
            <>
              <Bouton titre="Se connecter" occupe={occupe} disabled={code.length !== 6} onPress={() => lancer(() => s.connecter(telephone, code))} />
              <Bouton titre="Changer de numéro" variante="secondaire" onPress={() => { setEtape("telephone"); setCode(""); }} />
            </>
          )}
          </>
          )}
        </View>
        <Text style={{ color: "#64748b", fontSize: 11, textAlign: "center", marginTop: 16 }}>Demandez une invitation à votre gestionnaire si votre numéro n'est pas reconnu.</Text>
      </Ecran>
    </KeyboardAvoidingView>
  );
}
