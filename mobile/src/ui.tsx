import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewProps } from "react-native";

export const C = { teal: "#0f766e", tealClair: "#e6f4f2", fond: "#f1f5f9", carte: "#ffffff", texte: "#0f172a", gris: "#64748b", bordure: "#e2e8f0", rouge: "#dc2626", ambre: "#d97706", vert: "#059669", sombre: "#0f172a" };

export function Ecran({ children, style, ...p }: ViewProps) {
  return <View style={[{ flex: 1, backgroundColor: C.fond, padding: 16 }, style]} {...p}>{children}</View>;
}

export function Carte({ children, style, ...p }: ViewProps) {
  return <View style={[s.carte, style]} {...p}>{children}</View>;
}

export function Titre({ children }: { children: React.ReactNode }) {
  return <Text style={s.titre}>{children}</Text>;
}

export function Libelle({ children }: { children: React.ReactNode }) {
  return <Text style={s.libelle}>{children}</Text>;
}

export function Champ(p: TextInputProps) {
  return <TextInput placeholderTextColor="#94a3b8" {...p} style={[s.champ, p.style]} />;
}

export function Bouton({ titre, onPress, variante = "primaire", disabled, occupe }: { titre: string; onPress: () => void; variante?: "primaire" | "secondaire" | "danger"; disabled?: boolean; occupe?: boolean }) {
  const fond = variante === "primaire" ? C.teal : variante === "danger" ? C.rouge : C.carte;
  const couleur = variante === "secondaire" ? C.teal : "#fff";
  return (
    <Pressable onPress={onPress} disabled={disabled || occupe} style={({ pressed }) => [s.bouton, { backgroundColor: fond, borderColor: variante === "secondaire" ? C.teal : fond, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      {occupe ? <ActivityIndicator color={couleur} /> : <Text style={{ color: couleur, fontWeight: "700", fontSize: 15 }}>{titre}</Text>}
    </Pressable>
  );
}

export function Badge({ texte, ton = "gris" }: { texte: string; ton?: "gris" | "vert" | "ambre" | "rouge" | "teal" }) {
  const fond = { gris: "#e2e8f0", vert: "#d1fae5", ambre: "#fef3c7", rouge: "#fee2e2", teal: C.tealClair }[ton];
  const couleur = { gris: "#334155", vert: "#065f46", ambre: "#92400e", rouge: "#991b1b", teal: C.teal }[ton];
  return <View style={{ backgroundColor: fond, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: couleur, fontSize: 11, fontWeight: "700" }}>{texte}</Text></View>;
}

export function Ligne({ gauche, droite }: { gauche: React.ReactNode; droite?: React.ReactNode }) {
  return <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.bordure }}><View style={{ flex: 1 }}>{gauche}</View>{droite}</View>;
}

const s = StyleSheet.create({
  carte: { backgroundColor: C.carte, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.bordure, marginBottom: 12 },
  titre: { fontSize: 22, fontWeight: "800", color: C.texte, marginBottom: 10 },
  libelle: { fontSize: 12, color: C.gris, fontWeight: "600", marginBottom: 4, marginTop: 8, textTransform: "uppercase" },
  champ: { borderWidth: 1, borderColor: C.bordure, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: "#fff", color: C.texte },
  bouton: { borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, marginTop: 10 },
});
