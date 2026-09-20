/** Photo (appareil ou galerie) → OCR serveur (/api/recharges/ocr). Compression légère pour limiter l'envoi. */
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { api } from "./api";

export interface ResultatOcr { moteur: string; texte: string; montant?: number; compteur?: string; kwh?: number; code?: string; date?: string; index?: number; confiance: number; compteurId: string | null }

export async function photographierEtLire(mode: "ticket" | "index", source: "camera" | "galerie" = "camera"): Promise<ResultatOcr | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6, base64: true, allowsEditing: false };
  let res: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Appareil photo", "Autorisation refusée."); return null; }
    res = await ImagePicker.launchCameraAsync(options);
  } else {
    res = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  const a = res.assets[0];
  return api<ResultatOcr>("/recharges/ocr", { body: { image: a.base64, mediaType: a.mimeType ?? "image/jpeg", mode }, timeoutMs: 60_000 });
}
