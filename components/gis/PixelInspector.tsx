'use client';
import { useState } from 'react';
import type { PixelSample } from '../../lib/gis/contracts';
const noDataLabels = {
  'outside-coverage': 'Di luar cakupan grid',
  masked: 'Sel dimask / nilai NoData sumber',
  'invalid-neighborhood':
    'Tetangga interpolasi mengandung NoData atau di luar grid',
};
export default function PixelInspector({
  samples,
  status,
  error,
  onQuery,
}: {
  samples: PixelSample[];
  status: 'idle' | 'loading' | 'done';
  error: string | null;
  onQuery?: (
    latitude: number,
    longitude: number,
    method: 'nearest' | 'bilinear',
  ) => void;
}) {
  const [latitude, setLatitude] = useState('-1.6'),
    [longitude, setLongitude] = useState('103.62'),
    [method, setMethod] = useState<'nearest' | 'bilinear'>('nearest');
  const resolutionMismatch =
    samples.length > 1 &&
    samples.some(
      (s) =>
        s.crs !== samples[0].crs ||
        s.resolution.x !== samples[0].resolution.x ||
        s.resolution.y !== samples[0].resolution.y ||
        s.resolution.unit !== samples[0].resolution.unit,
    );
  return (
    <section>
      <h2>Pixel Inspector</h2>
      <p className="gis-muted">
        Klik peta atau masukkan koordinat. Nilai berasal dari provider, pada
        band dan grid native yang ditampilkan. Preview tile digeneralisasi.
      </p>
      {onQuery && (
        <form
          className="gis-pixel-query"
          onSubmit={(e) => {
            e.preventDefault();
            onQuery(Number(latitude), Number(longitude), method);
          }}
        >
          <label>
            Lintang (WGS84)
            <input
              aria-label="Lintang sampling"
              type="number"
              min={-90}
              max={90}
              step="any"
              required
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
          <label>
            Bujur (WGS84)
            <input
              aria-label="Bujur sampling"
              type="number"
              min={-180}
              max={180}
              step="any"
              required
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
          <label>
            Metode sampling
            <select
              aria-label="Metode sampling"
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as 'nearest' | 'bilinear')
              }
            >
              <option value="nearest">Native / nearest</option>
              <option value="bilinear">Bilinear (kontinu saja)</option>
            </select>
          </label>
          <button
            className="gis-button secondary"
            disabled={status === 'loading'}
          >
            Ambil sampel koordinat
          </button>
        </form>
      )}
      {status === 'loading' && <p role="status">Mengambil sampel…</p>}
      {error && (
        <p className="gis-error" role="alert">
          {error}
        </p>
      )}
      {resolutionMismatch && (
        <p className="gis-warning">
          Resolusi/CRS berbeda. Sampel ini tidak otomatis sebanding; operasi
          antar-raster memerlukan penyelarasan eksplisit.
        </p>
      )}
      {!samples.length && status !== 'loading' && (
        <div className="gis-empty">
          Aktifkan raster dan pilih koordinat. NoData tidak diperlakukan sebagai
          nol.
        </div>
      )}
      {samples[0] && (
        <div className="gis-coordinate">
          Lintang {samples[0].latitude.toFixed(6)} · Bujur{' '}
          {samples[0].longitude.toFixed(6)}
        </div>
      )}
      {samples.map((s) => (
        <article className="gis-pixel-card" key={s.datasetId}>
          <span className="gis-tag">
            {s.demo ? 'DEMO SINTETIK' : 'DATA PROVIDER'}
          </span>
          <h3>
            {s.datasetId.replace('demo-', '')} · {s.band}
          </h3>
          <strong className="gis-pixel-value">
            {s.noData
              ? 'NoData'
              : s.value?.toLocaleString('id-ID', {
                  maximumFractionDigits: 6,
                })}{' '}
            <small>{!s.noData && s.unit}</small>
          </strong>
          {s.noDataReason && <p>{noDataLabels[s.noDataReason]}</p>}
          {s.classification && <p>{s.classification}</p>}
          {s.bandKind === 'categorical' && !s.noData && !s.classification && (
            <p className="gis-warning">Kode kelas belum dipetakan.</p>
          )}
          <dl className="gis-metadata">
            <dt>Band / jenis</dt>
            <dd>
              {s.band} ·{' '}
              {s.bandKind === 'categorical' ? 'kategorikal' : 'kontinu'}
            </dd>
            <dt>Sumber</dt>
            <dd>{s.source}</dd>
            <dt>Resolusi</dt>
            <dd>
              {s.resolution.x} × {s.resolution.y} {s.resolution.unit}
            </dd>
            <dt>CRS native</dt>
            <dd>{s.crs}</dd>
            <dt>Sel (0-based)</dt>
            <dd>
              {s.cell
                ? `kolom ${s.cell.column} · baris ${s.cell.row}`
                : 'Di luar grid'}
            </dd>
            <dt>Pusat sel (x,y)</dt>
            <dd>
              {s.cell ? s.cell.center.map((n) => n.toFixed(6)).join(', ') : '—'}
            </dd>
            <dt>Nilai mentah</dt>
            <dd>{s.rawValue ?? 'NoData'}</dd>
            <dt>Scale / offset</dt>
            <dd>
              {s.encoding.scale.toPrecision(6)} / {s.encoding.offset}
            </dd>
            <dt>Periode</dt>
            <dd>
              {s.period.start} — {s.period.end}
            </dd>
            <dt>Versi</dt>
            <dd>{s.version}</dd>
            <dt>Sampling</dt>
            <dd>{s.resampling}</dd>
          </dl>
          <p className="gis-muted">{s.provenance}</p>
        </article>
      ))}
    </section>
  );
}
