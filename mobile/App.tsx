import React, { useEffect } from "react";
import { ActivityIndicator, AppState, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Connexion from "./src/ecrans/Connexion";
import Compteurs from "./src/ecrans/Compteurs";
import Recharge from "./src/ecrans/Recharge";
import Releves from "./src/ecrans/Releves";
import Profil from "./src/ecrans/Profil";
import { useStore } from "./src/store";
import { C } from "./src/ui";

const Tab = createBottomTabNavigator();
const ICONES: Record<string, string> = { Compteurs: "⚡", Recharge: "＋", Relevés: "🔢", Profil: "👤" };

export default function App() {
  const s = useStore();
  useEffect(() => { void s.demarrer(); }, []);
  // Retour au premier plan : rafraîchir et pousser la file hors ligne
  useEffect(() => {
    const sub = AppState.addEventListener("change", (etat) => { if (etat === "active" && s.etat !== "anonyme" && s.etat !== "init") void s.charger(); });
    return () => sub.remove();
  }, [s.etat]);

  if (s.etat === "init") {
    return <View style={{ flex: 1, backgroundColor: C.sombre, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 30, fontWeight: "900" }}>KURAÑ</Text><ActivityIndicator color="#fff" style={{ marginTop: 16 }} /></View>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={s.etat === "anonyme" ? "light" : "dark"} />
      {s.etat === "anonyme" ? (
        <Connexion />
      ) : (
        <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.fond, primary: C.teal } }}>
          <Tab.Navigator screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: C.teal,
            tabBarInactiveTintColor: C.gris,
            tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>{ICONES[route.name]}</Text>,
            tabBarBadge: route.name === "Profil" && s.file.length ? s.file.length : undefined,
          })}>
            <Tab.Screen name="Compteurs" component={Compteurs} />
            <Tab.Screen name="Recharge" component={Recharge} />
            {s.organisation?.type === "immo" && <Tab.Screen name="Relevés" component={Releves} />}
            <Tab.Screen name="Profil" component={Profil} />
          </Tab.Navigator>
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}
