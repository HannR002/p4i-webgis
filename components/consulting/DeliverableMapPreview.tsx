'use client';
import type { DeliverableContent } from '../../lib/consulting/contracts';
import { reportMapGeometry } from '../../lib/consulting/mapPreview';
/** Bounded report schematic of actual saved result coordinates; full GIS stays in MapWorkspace. */
export default function DeliverableMapPreview({
  content,
}: {
  content: DeliverableContent;
}) {
  const { recipe } = content,
    { points, rings } = reportMapGeometry(content);
  return (
    <figure className="consulting-map-preview">
      <svg
        viewBox="0 0 640 220"
        role="img"
        aria-label="Preview outline DEMO dan koordinat hasil tersimpan"
      >
        <rect width="640" height="220" fill="#edf5f4" />
        <text x="18" y="26" fill="#23424c" fontSize="14">
          {recipe.title.slice(0, 65)}
        </text>
        {rings.map((ring, i) => (
          <polyline
            key={i}
            points={ring
              .map(([x, y]) => `${35 + x * 560},${50 + y * 140}`)
              .join(' ')}
            stroke="#0f766e"
            strokeWidth="2"
            fill="#b4dfd4"
          />
        ))}
        {points.map(([x, y], i) => (
          <circle
            key={i}
            cx={35 + x * 560}
            cy={50 + y * 140}
            r="5"
            fill="#7c3aed"
          />
        ))}
        {!points.length && !rings.length && (
          <text x="18" y="85" fill="#23424c" fontSize="13">
            Tidak ada koordinat hasil; buka snapshot di Map Workspace.
          </text>
        )}
      </svg>
      <figcaption>
        Outline konteks {content.mapOutline?.datasetId ?? 'tidak tersedia'} ·
        koordinat tersimpan · {recipe.aoi?.name ?? 'AOI belum dipilih'} ·{' '}
        {recipe.layers.length} layer. Tanpa basemap dan tanpa permukaan raster
        baru.
      </figcaption>
    </figure>
  );
}
