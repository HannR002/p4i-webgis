'use client';
import { useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { SketchFeature, SketchLayer } from '../../lib/gis/vectorEditing';
export default function VectorAttributeTable({
  layer,
  act,
}: {
  layer: SketchLayer;
  act: (a: unknown) => void;
}) {
  const s = useWorkspaceStore();
  const [query, setQuery] = useState(''),
    [field, setField] = useState(''),
    [kind, setKind] = useState('string');
  const fields = [
    ...new Set(
      layer.data.features.flatMap((f) => Object.keys(f.properties.attributes)),
    ),
  ].sort();
  const features = layer.data.features.filter((f) =>
    JSON.stringify([
      f.id,
      f.properties.name,
      f.geometry.type,
      f.properties.attributes,
    ])
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const update = (
    f: SketchFeature,
    key: string,
    value: string | number | boolean,
    isName = false,
  ) =>
    act({
      tool: 'updateFeatureProperties',
      layerId: layer.id,
      featureId: f.id,
      name: isName ? value : f.properties.name,
      description: f.properties.description,
      attributes: isName
        ? f.properties.attributes
        : { ...f.properties.attributes, [key]: value },
    });
  return (
    <section aria-label="Tabel atribut" className="gis-attribute-section">
      <h3>Tabel atribut · {layer.name}</h3>
      <label>
        Cari atribut
        <input
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p>
        {features.length} / {layer.data.features.length} objek · hanya sesi
        lokal
      </p>
      <div
        className="gis-attribute-scroll"
        tabIndex={0}
        role="region"
        aria-label="Data atribut dapat digulir"
      >
        <table>
          <caption>Objek dan atribut layer aktif</caption>
          <thead>
            <tr>
              <th>Pilih</th>
              <th>ID</th>
              <th>Nama</th>
              <th>Geometri</th>
              {fields.map((k) => (
                <th key={k}>
                  {k}
                  <button
                    aria-label={`Hapus field ${k}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Hapus field ${k} dari semua objek layer?`,
                        )
                      )
                        act({
                          tool: 'editLayerField',
                          layerId: layer.id,
                          field: k,
                          remove: true,
                        });
                    }}
                  >
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.id} aria-selected={s.selectedVectorIds.includes(f.id)}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Pilih baris ${f.properties.name}`}
                    checked={s.selectedVectorIds.includes(f.id)}
                    onChange={(e) =>
                      s.setVectorEditor({
                        vectorLayerId: layer.id,
                        selectedVectorIds: e.target.checked
                          ? [
                              ...s.selectedVectorIds.filter(
                                (id) => id !== f.id,
                              ),
                              f.id,
                            ]
                          : s.selectedVectorIds.filter((id) => id !== f.id),
                      })
                    }
                  />
                </td>
                <td>{f.id}</td>
                <td>
                  <input
                    aria-label={`Nama baris ${f.id}`}
                    key={f.properties.name}
                    defaultValue={f.properties.name}
                    maxLength={80}
                    onBlur={(e) => {
                      if (e.target.value !== f.properties.name)
                        update(f, 'name', e.target.value, true);
                    }}
                  />
                </td>
                <td>{f.geometry.type}</td>
                {fields.map((k) => {
                  const v = f.properties.attributes[k];
                  const exemplar = layer.data.features.find(
                    (item) => item.properties.attributes[k] !== undefined,
                  )?.properties.attributes[k];
                  const type = typeof (v ?? exemplar);
                  return (
                    <td key={k}>
                      {type === 'boolean' ? (
                        <input
                          type="checkbox"
                          aria-label={`${f.properties.name} ${k}`}
                          checked={v === true}
                          onChange={(e) => update(f, k, e.target.checked)}
                        />
                      ) : (
                        <input
                          key={String(v)}
                          aria-label={`${f.properties.name} ${k}`}
                          type={type === 'number' ? 'number' : 'text'}
                          step="any"
                          maxLength={200}
                          defaultValue={v === undefined ? '' : String(v)}
                          onBlur={(e) => {
                            if (e.target.value !== String(v ?? ''))
                              update(
                                f,
                                k,
                                type === 'number'
                                  ? e.target.value.trim()
                                    ? Number(e.target.value)
                                    : NaN
                                  : e.target.value,
                              );
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!features.length && <p>Tidak ada objek yang cocok.</p>}
      <fieldset>
        <legend>Tambah field ke seluruh layer</legend>
        <label>
          Nama field
          <input
            value={field}
            maxLength={32}
            onChange={(e) => setField(e.target.value)}
          />
        </label>
        <label>
          Tipe field
          <select
            aria-label="Tipe field"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="string">Teks</option>
            <option value="number">Angka</option>
            <option value="boolean">Boolean</option>
          </select>
        </label>
        <button
          disabled={!field || !layer.data.features.length}
          onClick={() =>
            act({
              tool: 'editLayerField',
              layerId: layer.id,
              field,
              value: kind === 'boolean' ? false : kind === 'number' ? 0 : '',
            })
          }
        >
          Tambah field
        </button>
      </fieldset>
      <button
        disabled={
          !s.selectedVectorIds.some((id) =>
            layer.data.features.some((f) => f.id === id),
          )
        }
        onClick={() =>
          act({
            tool: 'zoomVectorFeatures',
            layerId: layer.id,
            featureIds: s.selectedVectorIds.filter((id) =>
              layer.data.features.some((f) => f.id === id),
            ),
          })
        }
      >
        Zoom ke pilihan
      </button>
    </section>
  );
}
