import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import type { Layer } from 'leaflet';

function nestedProperties(feature: Feature<Geometry, GeoJsonProperties>): Record<string, unknown> {
  const nested = feature.properties?.properties;
  return typeof nested === 'object' && nested !== null && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : {};
}

export const getFeatureStyle = (feature?: Feature<Geometry, GeoJsonProperties>) => {
  const risk = String((feature ? nestedProperties(feature) : {}).level_risiko ?? '')
    .toLowerCase();
  const fillColor = risk === 'tinggi'
    ? '#ef4444'
    : risk === 'sedang'
      ? '#eab308'
      : risk === 'rendah'
        ? '#22c55e'
        : '#3b82f6';

  return { color: fillColor, weight: 2, fillOpacity: 0.4 };
};

export const onEachFeature = (
  feature: Feature<Geometry, GeoJsonProperties>,
  layer: Layer,
) => {
  if (!feature.properties || !('bindTooltip' in layer)) return;
  const details = nestedProperties(feature);
  const container = document.createElement('div');
  container.className = 'text-sm text-slate-800 min-w-[150px]';

  const title = document.createElement('strong');
  title.className = 'block mb-2 pb-2 border-b border-gray-100';
  title.textContent = String(feature.properties.layer_name ?? 'Tanpa Nama');
  container.appendChild(title);

  const content = document.createElement('div');
  content.className = 'space-y-1 text-xs';
  content.textContent = `Estimasi ROI: ${String(details.estimasi_roi ?? 'Tidak tersedia')} · Level Risiko: ${String(details.level_risiko ?? 'Tidak tersedia')}`;
  container.appendChild(content);

  layer.bindTooltip(container, {
    sticky: true,
    className: 'bg-white/90 backdrop-blur-sm shadow-lg p-3 rounded-xl border border-gray-200',
  });
};
