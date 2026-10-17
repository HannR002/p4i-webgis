'use client';
import {
  Pane,
  CircleMarker,
  Polygon,
  Polyline,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
export default function WorkspaceVectors() {
  const s = useWorkspaceStore(),
    layers = s.recipe.sketchLayers ?? [];
  useMapEvents({
    click: (e) => {
      const layer = layers.find((l) => l.id === s.vectorLayerId);
      if (!layer) return;
      const p: [number, number] = [
        Number(e.latlng.lng.toFixed(6)),
        Number(e.latlng.lat.toFixed(6)),
      ];
      try {
        if (s.vectorMode === 'point')
          s.action({
            tool: 'createPoint',
            layerId: layer.id,
            name: `Titik ${layer.data.features.length + 1}`,
            coordinates: p,
          });
        if (s.vectorMode === 'polygon') {
          if (s.vectorVertices.length >= 128) throw Error('Batas 128 vertex');
          s.setVectorEditor({ vectorVertices: [...s.vectorVertices, p] });
        }
        s.setVectorEditor({ vectorError: null });
      } catch (e) {
        s.setVectorEditor({
          vectorError: e instanceof Error ? e.message : 'Koordinat tidak valid',
        });
      }
    },
  });
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
                selected = s.selectedVectorIds.includes(f.id),
                options = {
                  ...style,
                  opacity: l.opacity,
                  fillOpacity: style.fillOpacity * l.opacity,
                  weight: selected
                    ? Math.min(10, style.weight + 2)
                    : style.weight,
                };
              const events = {
                click: () => {
                  if (
                    s.vectorMode === 'polygon' &&
                    f.geometry.type === 'Point' &&
                    s.vectorVertices.length < 128
                  )
                    s.setVectorEditor({
                      vectorVertices: [
                        ...s.vectorVertices,
                        [f.geometry.coordinates[0], f.geometry.coordinates[1]],
                      ],
                    });
                  if (s.vectorMode === 'select' || s.vectorMode === 'off')
                    s.setVectorEditor({
                      vectorLayerId: l.id,
                      selectedVectorIds: [f.id],
                    });
                },
              };
              return f.geometry.type === 'Point' ? (
                <CircleMarker
                  key={f.id}
                  center={[
                    f.geometry.coordinates[1],
                    f.geometry.coordinates[0],
                  ]}
                  radius={style.radius}
                  pathOptions={options}
                  bubblingMouseEvents={s.vectorMode === 'off'}
                  eventHandlers={events}
                >
                  <Tooltip>{f.properties.name}</Tooltip>
                </CircleMarker>
              ) : (
                <Polygon
                  key={f.id}
                  positions={f.geometry.coordinates[0].map((p) => [p[1], p[0]])}
                  pathOptions={options}
                  bubblingMouseEvents={s.vectorMode === 'off'}
                  eventHandlers={events}
                >
                  <Tooltip>{f.properties.name}</Tooltip>
                </Polygon>
              );
            })}
          </Pane>
        ))}
      {s.vectorVertices.length > 0 && (
        <Polyline
          positions={s.vectorVertices.map((p) => [p[1], p[0]])}
          pathOptions={{ color: '#b45309', dashArray: '5 5' }}
        />
      )}
    </>
  );
}
