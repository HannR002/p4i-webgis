'use client';
import { useEffect, useRef } from 'react';
import {
  Pane,
  CircleMarker,
  Polygon,
  Polyline,
  Tooltip,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  geometryPaths,
  type LonLat,
  type SketchGeometry,
} from '../../lib/gis/vectorEditing';
import { snapCoordinate } from '../../lib/gis/vectorSnapping';
const latLng = (p: number[]): [number, number] => [p[1], p[0]];
const icon = L.divIcon({
  className: 'gis-vertex-handle',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
function snap(map: L.Map, p: LonLat, exclude?: string) {
  const s = useWorkspaceStore.getState();
  const target = snapCoordinate(
    p,
    s.recipe.sketchLayers ?? [],
    s.snapSettings,
    (p) => map.latLngToContainerPoint(latLng(p)),
    (p) => {
      const ll = map.containerPointToLatLng(L.point(p.x, p.y));
      return [ll.lng, ll.lat];
    },
    exclude,
  );
  s.setVectorEditor({
    snapTarget: target,
    vectorCursor: target?.coordinate ?? p,
  });
  return target?.coordinate ?? p;
}
function VertexHandle({
  coordinate,
  layerId,
  featureId,
  path,
  index,
}: {
  coordinate: LonLat;
  layerId: string;
  featureId: string;
  path: number[];
  index: number;
}) {
  const map = useMap(),
    marker = useRef<L.Marker>(null),
    s = useWorkspaceStore();
  useEffect(() => {
    if (!s.vectorEdit) marker.current?.setLatLng(latLng(coordinate));
  }, [s.vectorEdit, s.vectorEpoch, coordinate]);
  return (
    <Marker
      ref={marker}
      position={latLng(coordinate)}
      icon={icon}
      draggable
      keyboard
      title={`Vertex ${path.join('.') || '0'}:${index + 1}; alternatif koordinat di panel`}
      alt={`Vertex ${index + 1}`}
      autoPan={false}
      eventHandlers={{
        dragstart: () =>
          useWorkspaceStore
            .getState()
            .beginVertexDrag(layerId, featureId, path, index),
        drag: (e) => {
          const state = useWorkspaceStore.getState();
          if (!state.vectorEdit) return;
          const p = (e.target as L.Marker).getLatLng();
          state.previewVertexDrag(snap(map, [p.lng, p.lat], featureId));
        },
        dragend: (e) => {
          const state = useWorkspaceStore.getState();
          state.commitVertexDrag();
          const current = useWorkspaceStore
            .getState()
            .recipe.sketchLayers?.find((l) => l.id === layerId)
            ?.data.features.find((f) => f.id === featureId);
          const p =
            current &&
            geometryPaths(current.geometry).find(
              (p) => JSON.stringify(p.path) === JSON.stringify(path),
            )?.coordinates[index];
          if (p) (e.target as L.Marker).setLatLng(latLng(p));
        },
      }}
    />
  );
}
function Positions({
  geometry: g,
  options,
  events,
  bubble,
  name,
}: {
  geometry: SketchGeometry;
  options: L.PathOptions;
  events: L.LeafletEventHandlerFnMap;
  bubble: boolean;
  name: string;
}) {
  const tooltip = <Tooltip>{name}</Tooltip>;
  if (g.type === 'Point')
    return (
      <CircleMarker
        center={latLng(g.coordinates)}
        pathOptions={options}
        radius={(options as L.CircleMarkerOptions).radius ?? 7}
        bubblingMouseEvents={bubble}
        eventHandlers={events}
      >
        {tooltip}
      </CircleMarker>
    );
  if (g.type === 'LineString' || g.type === 'MultiLineString')
    return (
      <Polyline
        positions={
          g.type === 'LineString'
            ? g.coordinates.map(latLng)
            : g.coordinates.map((p) => p.map(latLng))
        }
        pathOptions={options}
        bubblingMouseEvents={bubble}
        eventHandlers={events}
      >
        {tooltip}
      </Polyline>
    );
  return (
    <Polygon
      positions={
        g.type === 'Polygon'
          ? g.coordinates.map((r) => r.map(latLng))
          : g.coordinates.map((p) => p.map((r) => r.map(latLng)))
      }
      pathOptions={options}
      bubblingMouseEvents={bubble}
      eventHandlers={events}
    >
      {tooltip}
    </Polygon>
  );
}
export default function WorkspaceVectors() {
  const s = useWorkspaceStore(),
    layers = s.recipe.sketchLayers ?? [];
  const map = useMapEvents({
    mousemove: (e) => {
      if (
        ['point', 'line', 'polygon'].includes(
          useWorkspaceStore.getState().vectorMode,
        )
      )
        snap(map, [e.latlng.lng, e.latlng.lat]);
    },
    mouseout: () =>
      useWorkspaceStore
        .getState()
        .setVectorEditor({ snapTarget: null, vectorCursor: null }),
    click: (e) => {
      const state = useWorkspaceStore.getState(),
        layer = state.recipe.sketchLayers?.find(
          (l) => l.id === state.vectorLayerId,
        );
      if (
        !layer?.visible ||
        !['point', 'line', 'polygon'].includes(state.vectorMode)
      )
        return;
      const p = snap(map, [
        Number(e.latlng.lng.toFixed(6)),
        Number(e.latlng.lat.toFixed(6)),
      ]);
      try {
        if (state.vectorMode === 'point')
          state.action({
            tool: 'createPoint',
            layerId: layer.id,
            name: `Titik ${layer.data.features.length + 1}`,
            coordinates: p,
          });
        else {
          if (state.vectorVertices.length >= 128)
            throw Error('Batas 128 vertex');
          // Explicit Finish is used. Double-click does not zoom or add a duplicate endpoint.
          if (JSON.stringify(state.vectorVertices.at(-1)) !== JSON.stringify(p))
            state.setVectorEditor({
              vectorVertices: [...state.vectorVertices, p],
            });
        }
        state.setVectorEditor({ vectorError: null });
      } catch (e) {
        state.setVectorEditor({
          vectorError: e instanceof Error ? e.message : 'Koordinat tidak valid',
        });
      }
    },
  });
  useEffect(() => {
    if (!['line', 'polygon', 'point', 'edit'].includes(s.vectorMode)) return;
    const enabled = map.doubleClickZoom.enabled();
    map.doubleClickZoom.disable();
    return () => {
      if (enabled) map.doubleClickZoom.enable();
    };
  }, [map, s.vectorMode]);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useWorkspaceStore.getState().cancelVectorEdit();
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  return (
    <>
      {layers
        .filter((l) => l.visible)
        .map((l, index) => (
          <Pane
            key={`${l.id}-${index}`}
            name={`sketch-${l.id}-${index}`}
            style={{ zIndex: 550 + index }}
          >
            {l.data.features.map((f) => {
              const style = f.properties.style ?? l.style,
                selected = s.selectedVectorIds.includes(f.id);
              const geometry =
                s.vectorEdit?.featureId === f.id
                  ? s.vectorEdit.preview
                  : f.geometry;
              const options = {
                ...style,
                opacity: (style.strokeOpacity ?? 1) * l.opacity,
                fillOpacity: style.fillOpacity * l.opacity,
                weight: selected
                  ? Math.min(12, style.weight + 3)
                  : style.weight,
                dashArray:
                  style.dash === 'dash'
                    ? '8 5'
                    : style.dash === 'dot'
                      ? '2 5'
                      : undefined,
              };
              const events = {
                click: () => {
                  if (
                    ['polygon', 'line'].includes(s.vectorMode) &&
                    f.geometry.type === 'Point' &&
                    s.vectorVertices.length < 128
                  )
                    s.setVectorEditor({
                      vectorVertices: [
                        ...s.vectorVertices,
                        [f.geometry.coordinates[0], f.geometry.coordinates[1]],
                      ],
                    });
                  if (['select', 'off', 'edit'].includes(s.vectorMode))
                    s.setVectorEditor({
                      vectorLayerId: l.id,
                      selectedVectorIds: [f.id],
                    });
                },
              };
              return (
                <Positions
                  key={f.id}
                  geometry={geometry}
                  options={options}
                  events={events}
                  bubble={s.vectorMode === 'off'}
                  name={f.properties.name}
                />
              );
            })}
          </Pane>
        ))}
      <Pane name="sketch-edit-handles" style={{ zIndex: 650 }}>
        {s.vectorVertices.length > 0 && (
          <Polyline
            positions={[
              ...s.vectorVertices,
              ...(s.vectorCursor ? [s.vectorCursor] : []),
            ].map(latLng)}
            pathOptions={{ color: '#b45309', dashArray: '5 5' }}
            interactive={false}
          />
        )}
        {s.vectorVertices.map((p, i) => (
          <CircleMarker
            key={i}
            center={latLng(p)}
            radius={4}
            pathOptions={{ color: '#92400e', fillOpacity: 1 }}
            interactive={false}
          >
            <Tooltip permanent>{i + 1}</Tooltip>
          </CircleMarker>
        ))}
        {s.snapTarget && (
          <CircleMarker
            center={latLng(s.snapTarget.coordinate)}
            radius={10}
            pathOptions={{ color: '#be123c', weight: 3, fillOpacity: 0 }}
            interactive={false}
          >
            <Tooltip permanent>Snap {s.snapTarget.kind}</Tooltip>
          </CircleMarker>
        )}
        {s.vectorMode === 'edit' &&
          layers
            .filter((l) => l.visible)
            .flatMap((l) =>
              l.data.features
                .filter((f) => s.selectedVectorIds.includes(f.id))
                .flatMap((f) =>
                  geometryPaths(
                    s.vectorEdit?.featureId === f.id
                      ? s.vectorEdit.preview
                      : f.geometry,
                  ).flatMap((path) =>
                    path.coordinates
                      .slice(0, path.closed ? -1 : undefined)
                      .map((p, i) => (
                        <VertexHandle
                          key={`${f.id}-${path.path.join('.')}-${i}`}
                          coordinate={p}
                          layerId={l.id}
                          featureId={f.id}
                          path={path.path}
                          index={i}
                        />
                      )),
                  ),
                ),
            )}
      </Pane>
    </>
  );
}
