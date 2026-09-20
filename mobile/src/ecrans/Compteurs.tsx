import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Badge, C, Carte, Champ, Ecran, Titre } from "../ui";
import { cumulMois, fmtF, useStore, type Compteur } from "../store";

/** Liste des compteurs de l'agent avec le cumul du mois ; touche = enregistrer une recharge. */
export default function Compteurs({ navigation }: any) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [rafraichit, setRafraichit] = useState(false);
  const g = s.grille;

  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return s.compteurs
      .filter((c) => !t || c.numero.includes(t) || (c.libelle ?? "").toLowerCase().includes(t) || (s.sites.find((x) => x.id === c.siteId)?.nom ?? "").toLowerCase().includes(t))
      .map((c) => ({ c, site: s.sites.find((x) => x.id === c.siteId), cumul: cumulMois(s.recharges, c.id), derniere: s.recharges.filter((r) => r.compteurId === c.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0] }))
      .sort((a, b) => (a.site?.nom ?? "").localeCompare(b.site?.nom ?? "") || (a.c.libelle ?? a.c.numero).localeCompare(b.c.libelle ?? b.c.numero));
  }, [s.compteurs, s.sites, s.recharges, q]);

  const tranche = (kwh: number) => (!g ? null : kwh <= g.seuilT1 ? { t: "T1", ton: "vert" as const, reste: g.seuilT1 - kwh } : kwh <= g.seuilT2 ? { t: "T2", ton: "ambre" as const, reste: g.seuilT2 - kwh } : { t: "T3", ton: "rouge" as const, reste: 0 });

  return (
    <Ecran>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Titre>Mes compteurs</Titre>
        {s.etat === "horsligne" && <Badge texte="hors ligne" ton="ambre" />}
      </View>
      <Champ value={q} onChangeText={setQ} placeholder="Rechercher : n°, libellé, site…" style={{ marginBottom: 10 }} />
      <FlatList
        data={lignes}
        keyExtractor={(l) => l.c.id}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={async () => { setRafraichit(true); await s.charger(); setRafraichit(false); }} />}
        ListEmptyComponent={<Text style={{ color: C.gris, textAlign: "center", marginTop: 30 }}>Aucun compteur. Votre gestionnaire doit vous assigner des sites.</Text>}
        renderItem={({ item: { c, site, cumul, derniere } }) => {
          const tr = tranche(cumul.kwh);
          const jours = derniere ? Math.floor((Date.now() - new Date(derniere.date).getTime()) / 86400_000) : null;
          return (
            <Pressable onPress={() => navigation.navigate("Recharge", { compteurId: c.id })}>
              <Carte>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", fontSize: 16, color: C.texte }}>{c.libelle ?? c.numero}</Text>
                    <Text style={{ color: C.gris, fontSize: 12 }}>{site?.nom} · <Text style={{ fontFamily: "monospace" }}>{c.numero}</Text>{c.partage ? " · partagé" : ""}</Text>
                  </View>
                  {tr && <Badge texte={tr.t} ton={tr.ton} />}
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
                  <View><Text style={{ color: C.gris, fontSize: 11 }}>Ce mois</Text><Text style={{ fontWeight: "700", color: C.texte }}>{fmtF(cumul.montant)} · {cumul.kwh.toFixed(1)} kWh</Text></View>
                  <View style={{ alignItems: "flex-end" }}><Text style={{ color: C.gris, fontSize: 11 }}>Dernière recharge</Text><Text style={{ fontWeight: "600", color: jours != null && jours > 12 ? C.rouge : C.texte }}>{jours == null ? "—" : jours === 0 ? "aujourd'hui" : `il y a ${jours} j`}</Text></View>
                </View>
                {tr && tr.reste > 0 && <Text style={{ color: C.teal, fontSize: 12, marginTop: 6 }}>Encore {Math.round(tr.reste)} kWh en {tr.t} ce mois</Text>}
                {c.prevision && c.prevision.joursRestants != null && (
                  <Text style={{ color: c.prevision.joursRestants <= 2 ? C.rouge : c.prevision.joursRestants <= 5 ? C.ambre : C.gris, fontSize: 12, marginTop: 4, fontWeight: c.prevision.joursRestants <= 2 ? "700" : "400" }}>
                    {c.prevision.joursRestants === 0 ? "Coupure probable aujourd'hui" : `Solde estimé ${c.prevision.soldeEstime} kWh · ≈ ${c.prevision.joursRestants} j restants`} · {c.prevision.kwhParJour} kWh/j
                  </Text>
                )}
              </Carte>
            </Pressable>
          );
        }}
      />
    </Ecran>
  );
}
