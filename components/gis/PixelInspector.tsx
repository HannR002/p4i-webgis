'use client';
import type { PixelSample } from '../../lib/gis/contracts';
export default function PixelInspector({
  samples,
  status,
  error,
}: {
  samples: PixelSample[];
  status: 'idle' | 'loading' | 'done';
  error: string | null;
}) {
  return (
    <section>
      <h2>Pixel Inspector</h2>
      <p className="gis-muted">
        Aktifkan raster, lalu klik lokasi pada peta. Resolusi setiap dataset berbeda; nilainya tidak
        otomatis setara.
      </p>
      {status === 'loading' && <p role="status">Mengambil sampel…</p>}
      {error && (
        <p className="gis-error" role="alert">
          {error}
        </p>
      )}
      {!samples.length && status !== 'loading' && (
        <div className="gis-empty">
          Pilih layer raster dan klik area contoh. Di luar cakupan, nilai akan ditandai NoData.
        </div>
      )}
      {samples[0] && (
        <div className="gis-coordinate">
          {samples[0].latitude.toFixed(6)}, {samples[0].longitude.toFixed(6)}
        </div>
      )}
      {samples.map((s) => (
        <article className="gis-pixel-card" key={s.datasetId}>
          <span className="gis-tag">{s.demo ? 'DEMO SINTETIK' : 'DATA PROVIDER'}</span>
          <h3>{s.datasetId.replace('demo-', '')}</h3>
          <strong className="gis-pixel-value">
            {s.noData ? 'NoData' : s.value?.toLocaleString('id-ID')}{' '}
            <small>{!s.noData && s.unit}</small>
          </strong>
          {s.classification && <p>{s.classification}</p>}
          <dl className="gis-metadata">
            <dt>Band</dt>
            <dd>{s.band}</dd>
            <dt>Sumber</dt>
            <dd>{s.source}</dd>
            <dt>Resolusi</dt>
            <dd>
              {s.resolution.x} × {s.resolution.y} {s.resolution.unit}
            </dd>
            <dt>CRS</dt>
            <dd>{s.crs}</dd>
            <dt>Periode</dt>
            <dd>
              {s.period.start} — {s.period.end}
            </dd>
            <dt>Versi</dt>
            <dd>{s.version}</dd>
            <dt>Resampling</dt>
            <dd>{s.resampling}</dd>
          </dl>
          <p className="gis-muted">{s.provenance}</p>
        </article>
      ))}
    </section>
  );
}
