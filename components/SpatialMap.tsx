'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Feature,
  FeatureCollection,
  GeoJsonObject,
  GeoJsonProperties,
  Geometry,
  MultiPolygon,
} from 'geojson';
import L, { type Layer } from 'leaflet';
import {
  GeoJSON,
  MapContainer,
  Pane,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import useSWR from 'swr';
import { useMapStore } from '../store/useMapStore';
import type {
  AdministrativeBoundaryProperties,
  AdministrativeBoundaryRow,
  AdministrativeLevel,
} from '../types/flood';
import { onEachFeature } from '../utils/spatialInteractions';
import MapLoadingOverlay from './MapLoadingOverlay';
import { calculateLegacyWLC } from '../utils/analysisPreferences';

interface ProjectLayer {
  id?: string;
  parsedGeojson: GeoJsonObject;
}

interface Viewport {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
  level: AdministrativeLevel;
  tolerance: number;
}

type BoundaryKey = readonly [
  'administrative-boundaries',
  AdministrativeLevel,
  number,
  number,
  number,
  number,
  number,
];

const DEFAULT_VIEWPORT: Viewport = {
  west: 94,
  south: -11,
  east: 142,
  north: 7,
  zoom: 5,
  level: 'provinsi',
  tolerance: 0.02,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGeoJsonObject(value: unknown): value is GeoJsonObject {
  return isRecord(value) && typeof value.type === 'string';
}

function boundaryLevelForZoom(zoom: number): AdministrativeLevel {
  if (zoom <= 5) return 'provinsi';
  if (zoom <= 8) return 'kota';
  return 'kecamatan';
}

function simplificationForZoom(zoom: number): number {
  if (zoom <= 5) return 0.02;
  if (zoom <= 8) return 0.005;
  if (zoom <= 11) return 0.001;
  return 0.0002;
}

function MapController({ layers }: { layers: ProjectLayer[] }) {
  const map = useMap();
  useEffect(() => {
    const targetGeojson = layers[0]?.parsedGeojson;
    if (!targetGeojson) return;
    const bounds = L.geoJSON(targetGeojson).getBounds();
    if (bounds.isValid())
      map.flyToBounds(bounds, { duration: 1.5, padding: [50, 50] });
  }, [layers, map]);
  return null;
}

function ViewportController({
  onViewport,
}: {
  onViewport: (viewport: Viewport) => void;
}) {
  const publish = useCallback(
    (map: L.Map) => {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      onViewport({
        west: Number(bounds.getWest().toFixed(6)),
        south: Number(bounds.getSouth().toFixed(6)),
        east: Number(bounds.getEast().toFixed(6)),
        north: Number(bounds.getNorth().toFixed(6)),
        zoom,
        level: boundaryLevelForZoom(zoom),
        tolerance: simplificationForZoom(zoom),
      });
    },
    [onViewport],
  );

  const map = useMapEvents({
    moveend: (event) => publish(event.target),
    zoomend: (event) => publish(event.target),
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => publish(map));
    return () => cancelAnimationFrame(frame);
  }, [map, publish]);
  return null;
}

const fetchProjectLayers = async (id: string): Promise<ProjectLayer[]> => {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(id)}/layers`,
  );
  if (!response.ok)
    throw new Error(`Project layer request failed (${response.status})`);
  const data: unknown = await response.json();

  return (Array.isArray(data) ? data : []).flatMap((row) => {
    if (!isRecord(row)) return [];
    let parsed: unknown = row.geojson;
    if (typeof row.geojson === 'string') {
      try {
        parsed = JSON.parse(row.geojson) as unknown;
      } catch {
        return [];
      }
    }
    return isGeoJsonObject(parsed)
      ? [
          {
            id: typeof row.id === 'string' ? row.id : undefined,
            parsedGeojson: parsed,
          },
        ]
      : [];
  });
};

const fetchBoundaries = async (
  key: BoundaryKey,
): Promise<AdministrativeBoundaryRow[]> => {
  const [, level, west, south, east, north, tolerance] = key;
  const params = new URLSearchParams({
    west: String(west),
    south: String(south),
    east: String(east),
    north: String(north),
    level,
    tolerance: String(tolerance),
  });
  const response = await fetch(`/api/boundaries?${params.toString()}`);
  if (!response.ok)
    throw new Error(`Boundary request failed (${response.status})`);
  const data: unknown = await response.json();

  const candidates: unknown[] = Array.isArray(data) ? data : [];
  return candidates.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      typeof candidate.nama !== 'string'
    ) {
      return [];
    }
    let geometry: unknown = candidate.geojson;
    if (typeof geometry === 'string') {
      try {
        geometry = JSON.parse(geometry) as unknown;
      } catch {
        return [];
      }
    }
    if (
      !isRecord(geometry) ||
      geometry.type !== 'MultiPolygon' ||
      !Array.isArray(geometry.coordinates)
    ) {
      return [];
    }
    if (
      candidate.level !== 'provinsi' &&
      candidate.level !== 'kota' &&
      candidate.level !== 'kecamatan'
    ) {
      return [];
    }
    return [
      {
        id: candidate.id,
        kode_wilayah: String(candidate.kode_wilayah ?? ''),
        level: candidate.level,
        parent_id:
          typeof candidate.parent_id === 'string' ? candidate.parent_id : null,
        nama: candidate.nama,
        source: String(candidate.source ?? ''),
        source_version: String(candidate.source_version ?? ''),
        geojson: geometry as unknown as MultiPolygon,
      },
    ];
  });
};

function numberProperty(
  properties: GeoJsonProperties | undefined,
  key: string,
): number | null {
  const value = properties?.[key];
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export default function SpatialMap({
  children,
  demo = false,
  basemap = 'osm',
}: {
  children?: ReactNode;
  demo?: boolean;
  basemap?: 'osm' | 'none';
}) {
  const {
    activeProjectId,
    activeBoundaryId,
    derivedWeights,
    floodAnalysisResult,
    isCrValid,
    mapCenter,
    setActiveBoundary,
  } = useMapStore();
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const handleViewport = useCallback((next: Viewport) => setViewport(next), []);

  const {
    data: layers = [],
    error: projectError,
    isLoading,
    isValidating,
  } = useSWR(demo ? null : activeProjectId, fetchProjectLayers, {
    revalidateOnFocus: false,
  });
  const boundaryKey: BoundaryKey = [
    'administrative-boundaries',
    viewport.level,
    viewport.west,
    viewport.south,
    viewport.east,
    viewport.north,
    viewport.tolerance,
  ];
  const {
    data: boundaries = [],
    error: boundaryError,
    isLoading: boundariesLoading,
  } = useSWR(demo ? null : boundaryKey, fetchBoundaries, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 1_000,
  });

  const boundaryGeoJson = useMemo<
    FeatureCollection<MultiPolygon, AdministrativeBoundaryProperties>
  >(
    () => ({
      type: 'FeatureCollection',
      features: boundaries.map((boundary) => ({
        type: 'Feature',
        id: boundary.id,
        geometry: boundary.geojson as unknown as MultiPolygon,
        properties: {
          id: boundary.id,
          kode_wilayah: boundary.kode_wilayah,
          nama: boundary.nama,
          level: boundary.level,
          parent_id: boundary.parent_id,
          source: boundary.source,
          source_version: boundary.source_version,
        },
      })),
    }),
    [boundaries],
  );

  const calculateSuitability = (
    feature?: Feature<Geometry, GeoJsonProperties>,
  ) => {
    const properties = feature?.properties;
    const risk = numberProperty(properties, 'skor_bencana');
    const fertility = numberProperty(properties, 'skor_kesuburan');
    const density = numberProperty(properties, 'skor_kepadatan');
    if (risk === null || fertility === null || density === null) return null;
    return calculateLegacyWLC(
      { bencana: risk, kesuburan: fertility, kepadatan: density },
      derivedWeights,
    );
  };

  const getPolygonColor = (score: number | null) => {
    if (!isCrValid || score === null) return '#cbd5e1';
    if (score >= 4) return '#22c55e';
    if (score >= 3) return '#eab308';
    if (score >= 2) return '#f97316';
    return '#ef4444';
  };

  const onEachBoundary = (
    feature: Feature<MultiPolygon, AdministrativeBoundaryProperties>,
    layer: Layer,
  ) => {
    const label = document.createElement('span');
    label.textContent = `${feature.properties.nama} · ${feature.properties.level}`;
    layer.bindTooltip(label, { sticky: true });
    if (feature.properties.level === 'kecamatan') {
      layer.on('click', () =>
        setActiveBoundary({
          id: feature.properties.id,
          name: feature.properties.nama,
          level: feature.properties.level,
        }),
      );
    }
  };

  const isMapLoading =
    ((isLoading || isValidating) && activeProjectId !== null) ||
    boundariesLoading;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={mapCenter}
        zoom={5}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false}
        preferCanvas
      >
        {basemap === 'osm' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            crossOrigin="anonymous"
          />
        )}

        <Pane name="flood-risk" style={{ zIndex: 350 }}>
          {!demo && floodAnalysisResult?.tile_url_template && (
            <TileLayer
              key={floodAnalysisResult.tile_url_template}
              url={floodAnalysisResult.tile_url_template}
              opacity={0.62}
              crossOrigin="anonymous"
              pane="flood-risk"
            />
          )}
        </Pane>

        <Pane name="project-layers" style={{ zIndex: 400 }}>
          {layers.map((layer, index) => (
            <GeoJSON
              key={`${layer.id ?? index}-${activeProjectId}-${isCrValid}-${derivedWeights.bencana}-${floodAnalysisResult?.score ?? 'no-flood'}`}
              data={layer.parsedGeojson}
              onEachFeature={onEachFeature}
              pane="project-layers"
              style={(feature) => ({
                fillColor: getPolygonColor(calculateSuitability(feature)),
                weight: 1,
                opacity: 1,
                color: 'white',
                fillOpacity: 0.7,
              })}
            />
          ))}
        </Pane>

        <Pane name="administrative-boundaries" style={{ zIndex: 450 }}>
          <GeoJSON
            key={`${viewport.level}-${activeBoundaryId}-${boundaries.map((item) => item.id).join('.')}`}
            data={boundaryGeoJson}
            onEachFeature={onEachBoundary}
            pane="administrative-boundaries"
            style={(feature) => ({
              color:
                feature?.properties.id === activeBoundaryId
                  ? '#0ea5e9'
                  : '#f8fafc',
              weight: feature?.properties.id === activeBoundaryId ? 3 : 1.5,
              opacity: 0.95,
              fillColor: '#38bdf8',
              fillOpacity:
                feature?.properties.id === activeBoundaryId ? 0.08 : 0.025,
            })}
          />
        </Pane>

        <MapController layers={layers} />
        <ViewportController onViewport={handleViewport} />
        {children}
        {isMapLoading && <MapLoadingOverlay />}
      </MapContainer>

      {(projectError || boundaryError) && (
        <div
          role="alert"
          className="absolute bottom-4 right-4 z-[500] max-w-xs rounded-lg bg-amber-50/95 px-3 py-2 text-xs text-amber-800 shadow-lg"
        >
          {projectError && (
            <p>
              Layer proyek tidak dapat dimuat. Coba muat ulang atau periksa
              akses proyek.
            </p>
          )}
          {boundaryError && (
            <p>Data batas wilayah P4I belum tersedia untuk lokasi ini.</p>
          )}
        </div>
      )}
    </div>
  );
}
