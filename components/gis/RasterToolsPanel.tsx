'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type {
  RasterOperation,
  RasterProcessingResult,
} from '../../lib/gis/contracts';
import { bandRange, getBand } from '../../lib/gis/raster';
import { parseProcessingResult } from '../../lib/gis/processingValidation';
import { record } from '../../lib/gis/validation';
export default function RasterToolsPanel() {
  const { recipe, catalog, mode } = useWorkspaceStore();
  const rasters = recipe.layers.filter(
    (layer) => layer.visible && layer.type === 'raster',
  );
  const [chosen, setChosen] = useState(''),
    [operation, setOperation] = useState<
      'zonal-statistics' | 'clip' | 'mask' | 'normalize' | 'arithmetic'
    >('zonal-statistics');
  const [operator, setOperator] = useState<
      'add' | 'subtract' | 'multiply' | 'divide'
    >('multiply'),
    [constant, setConstant] = useState('1');
  const [minimum, setMinimum] = useState(''),
    [maximum, setMaximum] = useState('');
  const layer =
    rasters.find((layer) => layer.datasetId === chosen) ?? rasters[0];
  const dataset = catalog.find((dataset) => dataset.id === layer?.datasetId);
  const metadata = dataset?.raster;
  const band = metadata
    ? getBand(
        metadata,
        layer && 'band' in layer.style ? layer.style.band : undefined,
      )
    : null;
  const key = JSON.stringify([
    recipe.viewport,
    recipe.aoi,
    layer,
    operation,
    operator,
    constant,
    minimum,
    maximum,
  ]);
  const [state, setState] = useState<{
    key: string;
    status: 'loading' | 'done';
    result: RasterProcessingResult | null;
    error: string | null;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const current = state?.key === key ? state : null;
  const needsAoi = ['zonal-statistics', 'clip', 'mask'].includes(operation);
  async function run() {
    if (!dataset || !band || !metadata) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const ref = { datasetId: dataset.id, band: band.id };
    const coordinate = {
      x: recipe.viewport.center[1],
      y: recipe.viewport.center[0],
      crs: 'EPSG:4326' as const,
    };
    const range = bandRange(metadata, band.id);
    let request: RasterOperation;
    if (operation === 'zonal-statistics' || operation === 'clip')
      request = { operation, ...ref, aoiId: recipe.aoi?.id ?? '' };
    else if (operation === 'mask')
      request = {
        operation,
        ...ref,
        aoiId: recipe.aoi?.id ?? '',
        keep: 'outside',
      };
    else if (operation === 'normalize')
      request = {
        operation,
        ...ref,
        coordinate,
        min: Number(minimum || range[0]),
        max: Number(maximum || range[1]),
      };
    else
      request = {
        operation: 'arithmetic',
        coordinate,
        operator,
        left: ref,
        right: {
          constant: Number(constant),
          unit: ['add', 'subtract'].includes(operator) ? band.unit : '1',
        },
        alignment: { mode: 'native-only' },
      };
    setState({ key, status: 'loading', result: null, error: null });
    try {
      const response = await fetch('/api/gis/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: active.signal,
      });
      const value: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          record(value) && typeof value.error === 'string'
            ? value.error
            : record(value) && typeof value.reason === 'string'
              ? value.reason
              : 'Operasi raster gagal',
        );
      const result = parseProcessingResult(value);
      if (!active.signal.aborted)
        setState({ key, status: 'done', result, error: null });
    } catch (error) {
      if (!active.signal.aborted)
        setState({
          key,
          status: 'done',
          result: null,
          error:
            error instanceof Error ? error.message : 'Operasi raster gagal',
        });
    }
  }
  const data = current?.result?.status === 'ok' ? current.result.data : null;
  return (
    <section className="gis-raster-tools">
      <h2>Operasi raster lokal</h2>
      <span className="gis-tag">DEMO · GRID KECIL</span>
      <p className="gis-muted">
        Statistik AOI menggunakan pusat sel. Operasi titik menggunakan pusat
        viewport; tidak ada harmonisasi grid otomatis.
      </p>
      {!rasters.length ? (
        <div className="gis-empty">Aktifkan raster untuk operasi lokal.</div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <label>
            Raster aktif
            <select
              aria-label="Raster operasi"
              value={layer?.datasetId ?? ''}
              onChange={(event) => {
                setChosen(event.target.value);
                setMinimum('');
                setMaximum('');
              }}
            >
              {rasters.map((layer) => (
                <option key={layer.id} value={layer.datasetId}>
                  {
                    catalog.find((dataset) => dataset.id === layer.datasetId)
                      ?.title
                  }
                </option>
              ))}
            </select>
          </label>
          <label>
            Operasi
            <select
              aria-label="Operasi raster"
              value={operation}
              onChange={(event) =>
                setOperation(event.target.value as typeof operation)
              }
            >
              <option value="zonal-statistics">Statistik zonal native</option>
              <option value="clip">Clip · deskripsi window</option>
              <option value="mask">Mask · pertahankan luar AOI</option>
              <option value="normalize">Normalisasi nilai titik</option>
              <option value="arithmetic">Aritmetika nilai titik</option>
            </select>
          </label>
          {operation === 'normalize' && (
            <>
              <label>
                Minimum
                <input
                  aria-label="Minimum normalisasi"
                  type="number"
                  step="any"
                  value={minimum}
                  placeholder={
                    metadata ? String(bandRange(metadata, band?.id)[0]) : ''
                  }
                  onChange={(e) => setMinimum(e.target.value)}
                />
              </label>
              <label>
                Maksimum
                <input
                  aria-label="Maksimum normalisasi"
                  type="number"
                  step="any"
                  value={maximum}
                  placeholder={
                    metadata ? String(bandRange(metadata, band?.id)[1]) : ''
                  }
                  onChange={(e) => setMaximum(e.target.value)}
                />
              </label>
            </>
          )}
          {operation === 'arithmetic' && (
            <>
              <label>
                Operator
                <select
                  aria-label="Operator aritmetika"
                  value={operator}
                  onChange={(e) =>
                    setOperator(e.target.value as typeof operator)
                  }
                >
                  <option value="add">Tambah (+)</option>
                  <option value="subtract">Kurangi (−)</option>
                  <option value="multiply">Kalikan (×)</option>
                  <option value="divide">Bagi (÷)</option>
                </select>
              </label>
              <label>
                Konstanta (
                {['add', 'subtract'].includes(operator)
                  ? band?.unit
                  : 'tanpa dimensi'}
                )
                <input
                  aria-label="Konstanta raster"
                  type="number"
                  step="any"
                  required
                  value={constant}
                  onChange={(e) => setConstant(e.target.value)}
                />
              </label>
            </>
          )}
          <p className="gis-muted">
            {needsAoi
              ? `AOI: ${recipe.aoi?.name ?? 'Pilih area kajian pada tab Layer'}`
              : `Titik WGS84: ${recipe.viewport.center.map((n) => n.toFixed(6)).join(', ')}`}
          </p>
          <button
            className="gis-button secondary"
            disabled={
              mode !== 'demo' ||
              current?.status === 'loading' ||
              (needsAoi && !recipe.aoi)
            }
          >
            {current?.status === 'loading'
              ? 'Menghitung…'
              : 'Jalankan operasi lokal'}
          </button>
        </form>
      )}
      {current?.error && (
        <p className="gis-error" role="alert">
          {current.error}
        </p>
      )}
      {data?.kind === 'statistics' && (
        <div className="gis-raster-result" role="status">
          <h3>Statistik native · {data.statistics.band}</h3>
          <dl className="gis-metadata">
            <dt>Luas AOI</dt>
            <dd>
              {(data.statistics.aoiAreaSquareMetres / 1e6).toFixed(3)} km² ·
              perkiraan bola
            </dd>
            <dt>Sel valid</dt>
            <dd>{data.statistics.count}</dd>
            <dt>NoData</dt>
            <dd>{data.statistics.noDataCount}</dd>
            <dt>Rata-rata</dt>
            <dd>
              {data.statistics.mean === null
                ? data.statistics.kind === 'categorical'
                  ? 'Tidak dihitung untuk kode kelas'
                  : 'Tidak ada sel valid'
                : `${data.statistics.mean.toFixed(6)} ${data.statistics.unit}`}
            </dd>
            <dt>Min / max</dt>
            <dd>
              {data.statistics.min === null
                ? '—'
                : `${data.statistics.min} / ${data.statistics.max}`}
            </dd>
            <dt>Metode</dt>
            <dd>{data.statistics.method}</dd>
          </dl>
          {data.statistics.histogram.map((c) => (
            <p key={c.value}>
              {c.label} ({c.value}): {c.count} sel
            </p>
          ))}
        </div>
      )}
      {data?.kind === 'value' && (
        <div className="gis-raster-result" role="status">
          <h3>Hasil titik</h3>
          <strong>
            {data.result.noData
              ? 'NoData'
              : `${data.result.value?.toFixed(6)} ${data.result.unit}`}
          </strong>
          {data.result.reason && (
            <p>
              {data.result.reason === 'division-by-zero'
                ? 'Pembagi nol; hasil dimask.'
                : data.result.reason === 'source-nodata'
                  ? 'NoData pada sumber diteruskan.'
                  : 'Nilai di luar interval kelas.'}
            </p>
          )}
        </div>
      )}
      {data?.kind === 'subset' && (
        <div className="gis-raster-result" role="status">
          <h3>Window / mask dihitung</h3>
          <p>
            {data.subset.selectedCount} sel terpilih · {data.subset.validCount}{' '}
            valid · {data.subset.noDataCount} NoData
          </p>
          <p>
            {data.subset.window
              ? `${data.subset.window.width} × ${data.subset.window.height} sel dari kolom ${data.subset.window.column}, baris ${data.subset.window.row}`
              : 'Tidak ada sel dalam AOI'}
          </p>
          <p>Deskripsi subset tersedia; file GeoTIFF belum dibuat.</p>
        </div>
      )}
    </section>
  );
}
