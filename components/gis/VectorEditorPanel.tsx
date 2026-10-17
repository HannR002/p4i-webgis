'use client';
import { useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  DEFAULT_SKETCH_STYLE,
  type SketchFeature,
  type SketchLayer,
  type SketchStyle,
} from '../../lib/gis/vectorEditing';

export default function VectorEditorPanel() {
  const s = useWorkspaceStore(),
    layers = s.recipe.sketchLayers ?? [];
  const [name, setName] = useState('Survei Lapangan'),
    [error, setError] = useState('');
  const act = (a: unknown) => {
    try {
      s.action(a);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit gagal');
    }
  };
  const layer = layers.find((l) => l.id === s.vectorLayerId) ?? layers[0];
  const feature = layer?.data.features.find(
    (f) => f.id === s.selectedVectorIds.at(-1),
  );
  return (
    <section className="gis-vector-editor">
      <h2>Editor vektor lokal</h2>
      <p className="gis-muted">
        EPSG:4326 · longitude, latitude. Geometri buatan pengguna; bukan batas
        resmi. Simpan hanya melalui tombol Simpan draft.
      </p>
      <label>
        Nama layer baru
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        className="gis-button secondary"
        onClick={() => act({ tool: 'createVectorLayer', name })}
      >
        Tambah layer vektor
      </button>
      <label>
        Layer edit
        <select
          value={layer?.id ?? ''}
          onChange={(e) =>
            s.setVectorEditor({
              vectorLayerId: e.target.value,
              selectedVectorIds: [],
              vectorVertices: [],
            })
          }
        >
          <option value="">Pilih layer</option>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {layer && (
        <>
          <label>
            Nama layer
            <input
              key={layer.id + layer.name}
              defaultValue={layer.name}
              maxLength={80}
              onBlur={(e) => {
                if (e.target.value !== layer.name)
                  act({
                    tool: 'updateVectorLayer',
                    layerId: layer.id,
                    name: e.target.value,
                  });
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(e) =>
                act({
                  tool: 'updateVectorLayer',
                  layerId: layer.id,
                  visible: e.target.checked,
                })
              }
            />
            Tampilkan layer vektor
          </label>
          <label>
            Opasitas vektor
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={layer.opacity}
              onChange={(e) =>
                act({
                  tool: 'updateVectorLayer',
                  layerId: layer.id,
                  opacity: Number(e.target.value),
                })
              }
            />
          </label>
          <div className="gis-config-actions">
            <button
              onClick={() =>
                act({
                  tool: 'updateVectorLayer',
                  layerId: layer.id,
                  index: Math.max(0, layers.indexOf(layer) - 1),
                })
              }
            >
              Turunkan urutan
            </button>
            <button
              onClick={() =>
                act({
                  tool: 'updateVectorLayer',
                  layerId: layer.id,
                  index: Math.min(7, layers.indexOf(layer) + 1),
                })
              }
            >
              Naikkan urutan
            </button>
          </div>
          <StyleEditor
            value={layer.style}
            apply={(style) =>
              act({ tool: 'updateVectorLayer', layerId: layer.id, style })
            }
            label="Style layer"
          />
          <div className="gis-config-actions">
            {(['select', 'point', 'polygon'] as const).map((mode) => (
              <button
                key={mode}
                aria-pressed={s.vectorMode === mode}
                onClick={() =>
                  s.setVectorEditor({
                    vectorMode: mode,
                    vectorLayerId: layer.id,
                    vectorVertices: [],
                  })
                }
              >
                {mode === 'select'
                  ? 'Pilih objek'
                  : mode === 'point'
                    ? 'Tambah titik dengan klik'
                    : 'Gambar poligon'}
              </button>
            ))}
            <button
              onClick={() =>
                s.setVectorEditor({ vectorMode: 'off', vectorVertices: [] })
              }
            >
              Selesai edit
            </button>
          </div>
          <p role="status">
            Mode: {s.vectorMode} · {s.vectorVertices.length} vertex baru ·{' '}
            {s.selectedVectorIds.length} objek dipilih
          </p>
          {s.vectorMode === 'polygon' && (
            <>
              <button
                disabled={s.vectorVertices.length < 3}
                onClick={() => {
                  try {
                    s.action({
                      tool: 'createPolygon',
                      layerId: layer.id,
                      name: `Poligon ${layer.data.features.length + 1}`,
                      vertices: s.vectorVertices,
                    });
                    s.setVectorEditor({ vectorVertices: [] });
                    setError('');
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Poligon tidak valid',
                    );
                  }
                }}
              >
                Selesaikan poligon
              </button>
              <button
                onClick={() =>
                  s.setVectorEditor({
                    vectorVertices: s.vectorVertices.slice(0, -1),
                  })
                }
              >
                Hapus vertex terakhir
              </button>
            </>
          )}
          <p className="gis-muted">
            Pilih titik berurutan untuk membuat poligon. Daftar ini juga dapat
            digunakan dengan keyboard.
          </p>
          <ul>
            {layer.data.features.map((f) => (
              <li key={f.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={s.selectedVectorIds.includes(f.id)}
                    onChange={(e) =>
                      s.setVectorEditor({
                        selectedVectorIds: e.target.checked
                          ? [...s.selectedVectorIds, f.id]
                          : s.selectedVectorIds.filter((id) => id !== f.id),
                      })
                    }
                  />
                  {f.properties.name} · {f.geometry.type}
                </label>
              </li>
            ))}
          </ul>
          <button
            disabled={s.selectedVectorIds.length < 3}
            onClick={() =>
              act({
                tool: 'createPolygonFromSelectedPoints',
                layerId: layer.id,
                name: 'Poligon pilihan',
                pointIds: s.selectedVectorIds,
              })
            }
          >
            Poligon dari titik pilihan
          </button>
          <CoordinateForm key={layer.id} layer={layer} act={act} />
          {feature && (
            <FeatureEditor
              key={JSON.stringify(feature)}
              layer={layer}
              feature={feature}
              act={act}
            />
          )}
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(layer.data, null, 2)], {
                type: 'application/geo+json',
              });
              const url = URL.createObjectURL(blob),
                a = document.createElement('a');
              a.href = url;
              a.download = 'p4i-vektor-lokal.geojson';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Unduh GeoJSON layer
          </button>
          <button
            onClick={() =>
              act({
                tool: 'updateVectorLayer',
                layerId: layer.id,
                remove: true,
              })
            }
          >
            Hapus layer vektor
          </button>
        </>
      )}
      <div className="gis-config-actions">
        <button disabled={!s.past.length} onClick={s.undo}>
          Undo vektor
        </button>
        <button disabled={!s.future.length} onClick={s.redo}>
          Redo vektor
        </button>
      </div>
      {(error || s.vectorError) && (
        <p role="alert" className="gis-error">
          {error || s.vectorError}
        </p>
      )}
    </section>
  );
}
function CoordinateForm({
  layer,
  act,
}: {
  layer: SketchLayer;
  act: (a: unknown) => void;
}) {
  const [name, setName] = useState('A'),
    [lon, setLon] = useState(''),
    [lat, setLat] = useState('');
  return (
    <fieldset>
      <legend>Titik lewat koordinat</legend>
      <label>
        Nama titik
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Longitude
        <input
          type="number"
          step="any"
          min="-180"
          max="180"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
        />
      </label>
      <label>
        Latitude
        <input
          type="number"
          step="any"
          min="-90"
          max="90"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
        />
      </label>
      <button
        disabled={!lon.trim() || !lat.trim() || !name.trim()}
        onClick={() =>
          act({
            tool: 'createPoint',
            layerId: layer.id,
            name,
            coordinates: [Number(lon), Number(lat)],
          })
        }
      >
        Tambahkan titik koordinat
      </button>
    </fieldset>
  );
}
function FeatureEditor({
  layer,
  feature: f,
  act,
}: {
  layer: SketchLayer;
  feature: SketchFeature;
  act: (a: unknown) => void;
}) {
  const [name, setName] = useState(f.properties.name),
    [description, setDescription] = useState(f.properties.description),
    [coords, setCoords] = useState(
      JSON.stringify(
        f.geometry.type === 'Point'
          ? f.geometry.coordinates
          : f.geometry.coordinates[0],
      ),
    ),
    [error, setError] = useState('');
  return (
    <fieldset>
      <legend>Objek terpilih: {f.properties.name}</legend>
      <label>
        Nama objek
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Deskripsi objek
        <textarea
          aria-label="Deskripsi objek"
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <button
        onClick={() =>
          act({
            tool: 'updateFeatureProperties',
            layerId: layer.id,
            featureId: f.id,
            name,
            description,
            attributes: f.properties.attributes,
          })
        }
      >
        Perbarui nama dan deskripsi
      </button>
      <label>
        Koordinat GeoJSON (longitude, latitude)
        <textarea
          aria-label="Koordinat GeoJSON (longitude, latitude)"
          value={coords}
          maxLength={12000}
          onChange={(e) => setCoords(e.target.value)}
        />
      </label>
      <button
        onClick={() => {
          try {
            act({
              tool: 'updateFeatureGeometry',
              layerId: layer.id,
              featureId: f.id,
              geometry: {
                type: f.geometry.type,
                coordinates:
                  f.geometry.type === 'Point'
                    ? JSON.parse(coords)
                    : [JSON.parse(coords)],
              },
            });
            setError('');
          } catch {
            setError('JSON koordinat tidak valid');
          }
        }}
      >
        Perbarui geometri
      </button>
      {error && <p role="alert">{error}</p>}
      <StyleEditor
        label="Style objek"
        value={f.properties.style ?? layer.style ?? DEFAULT_SKETCH_STYLE}
        apply={(style) =>
          act({
            tool: 'styleFeature',
            layerId: layer.id,
            featureId: f.id,
            style,
          })
        }
      />
      <button
        onClick={() =>
          act({ tool: 'deleteFeature', layerId: layer.id, featureId: f.id })
        }
      >
        Hapus objek
      </button>
    </fieldset>
  );
}
function StyleEditor({
  value,
  apply,
  label,
}: {
  value: SketchStyle;
  apply: (s: SketchStyle) => void;
  label: string;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <label>
        Warna
        <input
          aria-label={`${label} warna`}
          type="color"
          value={value.color}
          onChange={(e) =>
            apply({
              ...value,
              color: e.target.value,
              fillColor: e.target.value,
            })
          }
        />
      </label>
      <label>
        Opasitas isian
        <input
          aria-label={`${label} opasitas isian`}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value.fillOpacity}
          onChange={(e) =>
            apply({ ...value, fillOpacity: Number(e.target.value) })
          }
        />
      </label>
    </fieldset>
  );
}
