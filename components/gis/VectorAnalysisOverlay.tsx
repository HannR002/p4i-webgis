'use client';
import { GeoJSON, Pane } from 'react-leaflet';
import L from 'leaflet';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
/** Read-only overlay; excluded from editor snapping, selection and source persistence. */
export default function VectorAnalysisOverlay() {
  const result = useWorkspaceStore((s) => s.vectorAnalysisResult);
  if (!result || !result.layer.visible) return null;
  const layer = result.layer,
    style = {
      ...layer.style,
      opacity: layer.opacity,
      fillOpacity: layer.style.fillOpacity * layer.opacity,
    };
  return (
    <Pane name="vector-analysis-preview" style={{ zIndex: 620 }}>
      <GeoJSON
        key={JSON.stringify([result.createdAt, style])}
        data={layer.data}
        style={() => style}
        pointToLayer={(_, ll) => L.circleMarker(ll, { ...style, radius: 6 })}
        onEachFeature={(feature, path) => {
          const label = document.createElement('span');
          label.textContent = String(
            feature.properties?.name ?? 'Hasil PostGIS',
          );
          path.bindTooltip(label);
        }}
      />
    </Pane>
  );
}
