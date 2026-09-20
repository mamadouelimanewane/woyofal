import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Site } from "../types";

export interface PointSite { site: Site; depense: number; ratio: number | null; nbCompteurs: number }

/** Carte des sites géolocalisés (OpenStreetMap). Couleur = position vs budget. */
export default function CarteSites({ points, selection, onSelect }: { points: PointSite[]; selection?: string; onSelect?: (siteId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const calque = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!ref.current || carte.current) return;
    carte.current = L.map(ref.current, { zoomControl: true, attributionControl: true }).setView([14.716, -17.467], 11); // Dakar
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(carte.current);
    calque.current = L.layerGroup().addTo(carte.current);
    return () => { carte.current?.remove(); carte.current = null; };
  }, []);

  useEffect(() => {
    const m = carte.current, g = calque.current;
    if (!m || !g) return;
    g.clearLayers();
    const geo = points.filter((p) => p.site.geo);
    for (const p of geo) {
      const couleur = p.ratio == null ? "#0f766e" : p.ratio >= 1 ? "#dc2626" : p.ratio >= 0.8 ? "#d97706" : "#059669";
      const marqueur = L.circleMarker([p.site.geo!.lat, p.site.geo!.lng], { radius: p.site.id === selection ? 12 : 9, color: "#fff", weight: 2, fillColor: couleur, fillOpacity: 0.9 })
        .bindTooltip(`<strong>${p.site.nom}</strong><br>${p.depense.toLocaleString("fr-FR")} F ce mois${p.ratio != null ? ` · ${Math.round(p.ratio * 100)} % du budget` : ""}<br>${p.nbCompteurs} compteur(s)`)
        .on("click", () => onSelect?.(p.site.id));
      marqueur.addTo(g);
    }
    if (geo.length) m.fitBounds(L.latLngBounds(geo.map((p) => [p.site.geo!.lat, p.site.geo!.lng] as [number, number])).pad(0.3), { maxZoom: 14 });
    setTimeout(() => m.invalidateSize(), 50);
  }, [points, selection, onSelect]);

  const sansGeo = points.length - points.filter((p) => p.site.geo).length;
  return (
    <div>
      <div ref={ref} className="h-72 rounded-xl overflow-hidden border border-slate-200" />
      {sansGeo > 0 && <p className="text-xs text-slate-500 mt-1">{sansGeo} site(s) sans position : ouvrez la fiche du site et cliquez « Géolocaliser ».</p>}
    </div>
  );
}
