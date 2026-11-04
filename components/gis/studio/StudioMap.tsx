"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { VectorFeature } from "../../../lib/gis/studio/model";
import {
  BASEMAPS,
  visibleFeatures,
  type StudioDocument,
  type StudioLayer,
} from "../../../lib/gis/studio/model";
export default function StudioMap({
  doc,
  onSelect,
  onCoordinate,
  onIssue,
}: {
  doc: StudioDocument;
  onSelect: (v: { layer: StudioLayer; feature: VectorFeature }) => void;
  onCoordinate: (v: [number, number]) => void;
  onIssue: (message: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    vectors = useRef<L.LayerGroup | null>(null),
    tile = useRef<L.TileLayer | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const m = L.map(element.current, {
      preferCanvas: true,
      minZoom: 1,
      maxZoom: 19,
      worldCopyJump: true,
    }).setView([0, 0], 2);
    map.current = m;
    vectors.current = L.layerGroup().addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    const grid = L.layerGroup();
    for (let lat = -60; lat <= 60; lat += 30)
      L.polyline(
        [
          [lat, -180],
          [lat, 180],
        ],
        { color: "#b8ccd0", weight: 0.5, interactive: false },
      ).addTo(grid);
    for (let lon = -180; lon <= 180; lon += 30)
      L.polyline(
        [
          [-85, lon],
          [85, lon],
        ],
        { color: "#b8ccd0", weight: 0.5, interactive: false },
      ).addTo(grid);
    grid.addTo(m);
    m.on("click", (e) => onCoordinate([e.latlng.lat, e.latlng.lng]));
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, [onCoordinate]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (tile.current) {
      m.removeLayer(tile.current);
      tile.current = null;
    }
    onIssue("");
    if (doc.basemap === "osm")
      tile.current = L.tileLayer(BASEMAPS.osm.url, {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        referrerPolicy: "strict-origin-when-cross-origin",
        updateWhenIdle: true,
        keepBuffer: 1,
      })
        .on("tileerror", () =>
          onIssue(
            "Tile OpenStreetMap tidak tersedia. Layer vektor lokal tetap dapat diperiksa; pilih Tanpa peta dasar.",
          ),
        )
        .addTo(m);
  }, [doc.basemap, onIssue]);
  useEffect(() => {
    const m = map.current,
      group = vectors.current;
    if (!m || !group) return;
    group.clearLayers();
    for (const layer of doc.layers.filter((l) => l.visible))
      L.geoJSON(visibleFeatures(layer), {
        style: () => ({
          color: layer.color,
          fillColor: layer.color,
          weight: 2,
          opacity: layer.opacity,
          fillOpacity: layer.opacity * 0.45,
        }),
        pointToLayer: (_, p) =>
          L.circleMarker(p, {
            radius: 6,
            color: layer.color,
            fillColor: layer.color,
            opacity: layer.opacity,
            fillOpacity: layer.opacity,
            weight: 2,
          }),
        onEachFeature: (feature, f) => {
          const label = document.createElement("span");
          label.textContent = layer.name;
          f.bindTooltip(label);
          f.on("click", (e) => {
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            onSelect({ layer, feature: feature as VectorFeature });
          });
        },
      }).addTo(group);
    const focus = doc.layers.find((l) => l.id === doc.focus && l.visible);
    if (focus) {
      const bounds = L.geoJSON(visibleFeatures(focus)).getBounds();
      if (bounds.isValid())
        m.fitBounds(bounds, { padding: [30, 30], maxZoom: 16, animate: false });
    }
  }, [doc.layers, doc.focus, doc.revision, onSelect]);
  return (
    <div
      ref={element}
      className="studio-map"
      role="region"
      aria-label="Peta vektor interaktif. Atribut juga tersedia pada tabel."
    />
  );
}
