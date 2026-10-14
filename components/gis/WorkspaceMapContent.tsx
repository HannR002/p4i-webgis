'use client';
import { useEffect, useState } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import {
  GeoJSON,
  Pane,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
  ScaleControl,
  Polyline,
  CircleMarker,
} from 'react-leaflet';
import useSWR from 'swr';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { sphericalDistance } from '../../lib/gis/geometry';
import { record } from '../../lib/gis/validation';
interface Props {
  tool: 'pan' | 'pixel' | 'measure';
  onInspect: (latitude: number, longitude: number) => void;
  onMeasure: (metres: number) => void;
}
async function loadVectors(
  ids: string[],
): Promise<Record<string, FeatureCollection<Geometry>>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(`/api/gis/vector/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error('Vektor belum tersedia');
      const d: unknown = await r.json();
      if (
        !record(d) ||
        d.type !== 'FeatureCollection' ||
        !Array.isArray(d.features)
      )
        throw new Error('Vektor tidak valid');
      return [id, d as unknown as FeatureCollection<Geometry>] as const;
    }),
  );
  return Object.fromEntries(entries);
}
export default function WorkspaceMapContent({
  tool,
  onInspect,
  onMeasure,
}: Props) {
  const { recipe, mode, catalog, action, trackViewport } = useWorkspaceStore();
  const map = useMap();
  const [points, setPoints] = useState<[number, number][]>([]);
  const ids = recipe.layers
    .filter(
      (l) =>
        l.visible &&
        l.type === 'vector' &&
        catalog.find((d) => d.id === l.datasetId)?.status === 'demo',
    )
    .map((l) => l.datasetId);
  const { data: vectors = {}, error } = useSWR(
    ids.length ? ['workspace-vectors', ids.join(',')] : null,
    () => loadVectors(ids),
    { revalidateOnFocus: false },
  );
  const [lat, lng] = recipe.viewport.center;
  const zoom = recipe.viewport.zoom;
  useEffect(() => {
    const element = map.getContainer();
    element.setAttribute(
      'aria-label',
      'Peta interaktif P4I. Gunakan panah untuk menggeser dan tombol plus atau minus untuk zoom.',
    );
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: false }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    // React Leaflet creates Pane styles once; update the actual panes after reordering.
    recipe.layers
      .filter((l) => l.visible)
      .forEach((layer, index) => {
        const pane = map.getPane(`workspace-${layer.id}`);
        if (pane) pane.style.zIndex = String(460 + index);
      });
  }, [map, recipe.layers]);
  useEffect(() => {
    const c = map.getCenter();
    if (
      Math.abs(c.lat - lat) > 0.00001 ||
      Math.abs(c.lng - lng) > 0.00001 ||
      map.getZoom() !== zoom
    )
      // Recipe commits/Undo/Redo must settle immediately. Animated programmatic
      // moves can emit a late moveend that overwrites a newer recipe viewport.
      map.setView([lat, lng], zoom, { animate: false });
  }, [map, lat, lng, zoom]);
  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      trackViewport(
        [Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6))],
        map.getZoom(),
      );
    },
    click: (e) => {
      if (tool === 'pixel') onInspect(e.latlng.lat, e.latlng.lng);
      if (tool === 'measure') {
        const next: [number, number][] =
          points.length === 1
            ? [points[0], [e.latlng.lat, e.latlng.lng]]
            : [[e.latlng.lat, e.latlng.lng]];
        setPoints(next);
        onMeasure(
          next.length === 2
            ? sphericalDistance(
                [next[0][1], next[0][0]],
                [next[1][1], next[1][0]],
              )
            : 0,
        );
      }
    },
  });
  return (
    <>
      <ZoomControl position="topright" />
      <ScaleControl position="bottomleft" />
      {mode === 'demo' &&
        recipe.layers
          .filter((l) => l.visible)
          .map((l, index) => {
            if (l.type === 'raster' && 'palette' in l.style) {
              const style = l.style;
              const q = new URLSearchParams({
                palette: style.palette.join(','),
                ...(style.band ? { band: style.band } : {}),
                min: String(style.min),
                max: String(style.max),
              });
              return (
                <Pane
                  key={l.id}
                  name={`workspace-${l.id}`}
                  style={{ zIndex: 460 + index }}
                >
                  <TileLayer
                    key={`${l.id}-${q}`}
                    url={`/api/gis/tiles/${l.datasetId}/{z}/{x}/{y}?${q}`}
                    opacity={l.opacity}
                    bounds={
                      catalog.find((d) => d.id === l.datasetId)?.bounds
                        ? [
                            [
                              catalog.find((d) => d.id === l.datasetId)!
                                .bounds[1],
                              catalog.find((d) => d.id === l.datasetId)!
                                .bounds[0],
                            ],
                            [
                              catalog.find((d) => d.id === l.datasetId)!
                                .bounds[3],
                              catalog.find((d) => d.id === l.datasetId)!
                                .bounds[2],
                            ],
                          ]
                        : undefined
                    }
                    attribution="P4I · data sintetik"
                  />
                </Pane>
              );
            }
            const data = vectors[l.datasetId];
            if (!data || !('color' in l.style)) return null;
            return (
              <Pane
                key={l.id}
                name={`workspace-${l.id}`}
                style={{ zIndex: 460 + index }}
              >
                <GeoJSON
                  key={`${l.id}-${l.opacity}-${JSON.stringify(l.style)}-${tool}`}
                  pane={`workspace-${l.id}`}
                  data={data}
                  style={{
                    color: l.style.color,
                    fillColor: l.style.fillColor,
                    weight: l.style.weight,
                    opacity: l.opacity,
                    fillOpacity: l.opacity * 0.15,
                  }}
                  onEachFeature={(f, layer) => {
                    const element = document.createElement('span');
                    element.textContent = String(
                      f.properties?.name ?? 'Area contoh',
                    );
                    layer.bindTooltip(element);
                    layer.on('click', () => {
                      if (tool === 'pan' && typeof f.id === 'string')
                        action({ tool: 'selectAOI', aoiId: f.id });
                    });
                  }}
                />
              </Pane>
            );
          })}
      {tool === 'measure' &&
        points.map((p, i) => (
          <CircleMarker
            key={i}
            center={p}
            radius={4}
            pathOptions={{ color: '#0f766e' }}
          />
        ))}
      {tool === 'measure' && points.length === 2 && (
        <Polyline
          positions={points}
          pathOptions={{ color: '#0f766e', weight: 3 }}
        />
      )}
      {error && (
        <div className="gis-map-notice">Vektor contoh tidak dapat dimuat.</div>
      )}
    </>
  );
}
