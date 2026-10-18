import {
  parseSketchLayers,
  type SketchLayer,
  type SketchGeometry,
  type SketchProperties,
} from './vectorEditing';
import { GisInputError, record } from './validation';
export type FeatureGeometry = SketchGeometry;
export type FeatureProperties = SketchProperties;
export interface VectorProject {
  id: string;
  title: string;
  accessTier: 'public' | 'restricted';
  canEdit: boolean;
}
export interface FeatureRevision {
  id: string;
  localId: string;
  revision: number;
}
export interface LayerRevision {
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}
export interface VectorLayerDocument extends LayerRevision {
  id: string;
  projectId: string;
  canEdit: boolean;
  archived: boolean;
  layer: SketchLayer;
  features: FeatureRevision[];
}
export interface VectorLayerSummary {
  id: string;
  name: string;
  revision: number;
  featureCount: number;
}
export interface SaveVectorLayer {
  projectId: string;
  layerId: string | null;
  expectedRevision: number;
  requestId: string;
  layer: SketchLayer;
  archive: boolean;
}
export interface VectorFeature extends FeatureRevision {
  geometry: FeatureGeometry;
  properties: FeatureProperties;
}
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
export function parseVectorSave(v: unknown): SaveVectorLayer {
  if (
    !record(v) ||
    Object.keys(v).some(
      (k) =>
        ![
          'projectId',
          'layerId',
          'expectedRevision',
          'requestId',
          'layer',
          'archive',
        ].includes(k),
    ) ||
    !uuid(v.projectId) ||
    (v.layerId !== null && !uuid(v.layerId)) ||
    !uuid(v.requestId) ||
    !Number.isSafeInteger(v.expectedRevision) ||
    Number(v.expectedRevision) < 0 ||
    typeof v.archive !== 'boolean' ||
    (v.layerId === null && (v.expectedRevision !== 0 || v.archive))
  )
    throw new GisInputError('Permintaan penyimpanan vektor tidak valid');
  const layer = parseSketchLayers([v.layer])[0];
  return {
    projectId: v.projectId,
    layerId: v.layerId as string | null,
    expectedRevision: Number(v.expectedRevision),
    requestId: v.requestId,
    layer,
    archive: v.archive,
  };
}
export function parseVectorDocument(v: unknown): VectorLayerDocument {
  if (
    !record(v) ||
    !uuid(v.id) ||
    !uuid(v.projectId) ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 1 ||
    typeof v.canEdit !== 'boolean' ||
    typeof v.archived !== 'boolean' ||
    !uuid(v.updatedBy) ||
    !['createdAt', 'updatedAt'].every(
      (k) =>
        typeof v[k] === 'string' && Number.isFinite(Date.parse(v[k] as string)),
    ) ||
    !Array.isArray(v.features) ||
    v.features.length > 100
  )
    throw new GisInputError('Respons penyimpanan tidak valid');
  const layer = parseSketchLayers([v.layer])[0];
  const features = v.features.map((f) => {
    if (
      !record(f) ||
      !uuid(f.id) ||
      typeof f.localId !== 'string' ||
      !layer.data.features.some((feature) => feature.id === f.localId) ||
      !Number.isSafeInteger(f.revision) ||
      Number(f.revision) < 1
    )
      throw new GisInputError('Identitas fitur tersimpan tidak valid');
    return { id: f.id, localId: f.localId, revision: Number(f.revision) };
  });
  if (
    features.length !== layer.data.features.length ||
    new Set(features.map((f) => f.id)).size !== features.length ||
    new Set(features.map((f) => f.localId)).size !== features.length
  )
    throw new GisInputError('Pemetaan fitur tidak valid');
  return {
    id: v.id,
    projectId: v.projectId,
    revision: Number(v.revision),
    canEdit: v.canEdit,
    archived: v.archived,
    createdAt: String(v.createdAt),
    updatedAt: String(v.updatedAt),
    updatedBy: v.updatedBy,
    layer,
    features,
  };
}

/** JSONB key ordering must not mark an unchanged loaded/saved layer as dirty. */
export function vectorLayerFingerprint(layer: SketchLayer): string {
  return JSON.stringify(layer, (_key, value) =>
    record(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}
