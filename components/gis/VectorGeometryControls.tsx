'use client';
import { useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  editVertex,
  geometryPaths,
  type SketchFeature,
} from '../../lib/gis/vectorEditing';
export function VertexCoordinates({
  feature,
  layerId,
  act,
}: {
  feature: SketchFeature;
  layerId: string;
  act: (a: unknown) => void;
}) {
  const paths = geometryPaths(feature.geometry),
    [pathIndex, setPathIndex] = useState(0),
    [index, setIndex] = useState(0),
    [lon, setLon] = useState(''),
    [lat, setLat] = useState(''),
    [error, setError] = useState('');
  const part = paths[pathIndex] ?? paths[0],
    count = part.coordinates.length - (part.closed ? 1 : 0),
    point = part.coordinates[Math.min(index, count - 1)];
  const change = (operation: 'move' | 'insert' | 'remove') => {
    try {
      const geometry = editVertex(
        feature.geometry,
        part.path,
        index,
        operation,
        operation === 'move' ? [Number(lon), Number(lat)] : undefined,
      );
      act({
        tool: 'updateFeatureGeometry',
        layerId,
        featureId: feature.id,
        geometry,
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vertex tidak valid');
    }
  };
  return (
    <fieldset>
      <legend>Vertex · alternatif keyboard</legend>
      <label>
        Bagian / ring
        <select
          aria-label="Bagian / ring"
          value={pathIndex}
          onChange={(e) => {
            setPathIndex(Number(e.target.value));
            setIndex(0);
            setLon('');
            setLat('');
          }}
        >
          {paths.map((p, i) => (
            <option key={i} value={i}>
              {p.path.join('.') || 'utama'} {p.closed ? '(ring)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Nomor vertex
        <select
          aria-label="Nomor vertex"
          value={index}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            setLon('');
            setLat('');
          }}
        >
          {part.coordinates.slice(0, count).map((p, i) => (
            <option key={i} value={i}>
              {i + 1}: {p[0].toFixed(6)}, {p[1].toFixed(6)}
            </option>
          ))}
        </select>
      </label>
      <p>Posisi: {point.join(', ')} (longitude, latitude)</p>
      <label>
        Longitude vertex
        <input
          type="number"
          step="any"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
        />
      </label>
      <label>
        Latitude vertex
        <input
          type="number"
          step="any"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
        />
      </label>
      <button
        disabled={!lon.trim() || !lat.trim()}
        onClick={() => change('move')}
      >
        Pindahkan vertex
      </button>
      <button
        disabled={
          feature.geometry.type === 'Point' ||
          (!part.closed && index === count - 1)
        }
        onClick={() => change('insert')}
      >
        Sisipkan vertex tengah setelah pilihan
      </button>
      <button
        disabled={
          feature.geometry.type === 'Point' || count <= (part.closed ? 3 : 2)
        }
        onClick={() => change('remove')}
      >
        Hapus vertex pilihan
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
export function SnappingControls() {
  const s = useWorkspaceStore(),
    settings = s.snapSettings;
  return (
    <details>
      <summary>Snapping · {settings.enabled ? 'aktif' : 'nonaktif'}</summary>
      {(['enabled', 'vertices', 'segments'] as const).map((key) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={(e) =>
              s.setVectorEditor({
                snapSettings: { ...settings, [key]: e.target.checked },
                snapTarget: null,
              })
            }
          />
          {key === 'enabled'
            ? 'Aktifkan snapping'
            : key === 'vertices'
              ? 'Snap vertex'
              : 'Snap segmen'}
        </label>
      ))}
      <label>
        Toleransi snapping (pixel layar)
        <input
          type="range"
          min="2"
          max="30"
          value={settings.tolerance}
          onChange={(e) =>
            s.setVectorEditor({
              snapSettings: { ...settings, tolerance: Number(e.target.value) },
            })
          }
        />
      </label>
      <p>
        {settings.tolerance} px · hanya layer lokal terlihat. Tidak mengubah
        objek tetangga.
      </p>
    </details>
  );
}
export function GeoJSONImport({ act }: { act: (a: unknown) => void }) {
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(''),
    [name, setName] = useState('Impor lokal');
  return (
    <details>
      <summary>Impor GeoJSON lokal</summary>
      <p>
        Maksimum 64 KiB, total 100 objek / 8 layer. Tanpa unggahan. CRS lain
        harus ditransformasikan sebelum impor.
      </p>
      <label>
        Nama layer impor
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Saya memastikan input WGS84 longitude, latitude
      </label>
      <label>
        File GeoJSON
        <input
          type="file"
          accept=".geojson,.json,application/geo+json"
          disabled={!confirmed}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              if (!confirmed || file.size > 65536)
                throw Error('Konfirmasi WGS84 dan batas 64 KiB diperlukan.');
              const collection: unknown = JSON.parse(await file.text());
              act({ tool: 'importVectorLayer', name, collection, wgs84: true });
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Impor gagal');
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
