import 'server-only';
import {
  parseVectorDocument,
  parseVectorSave,
  uuid,
  type SaveVectorLayer,
  type VectorLayerDocument,
  type VectorLayerSummary,
  type VectorProject,
} from '../../../gis/vectorPersistence';
import type { VectorRepository } from '../contracts';
import { record } from '../../../gis/validation';
export class VectorStorageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export type VectorRpcTransport = (
  operation: 'projects' | 'layers' | 'load' | 'save' | 'revisions',
  input: unknown,
) => Promise<unknown>;
/** Provider-neutral domain repository. Transport carries authenticated request context, never browser-supplied roles. */
export function createVectorRepository(
  rpc: VectorRpcTransport,
): VectorRepository {
  return {
    async listProjects() {
      const raw = await rpc('projects', {});
      if (
        !Array.isArray(raw) ||
        raw.length > 100 ||
        raw.some(
          (p) =>
            !record(p) ||
            !uuid(p.id) ||
            typeof p.title !== 'string' ||
            p.title.length > 200 ||
            !['public', 'restricted'].includes(String(p.accessTier)) ||
            typeof p.canEdit !== 'boolean',
        )
      )
        throw new VectorStorageError(502, 'Respons proyek tidak valid');
      return raw as VectorProject[];
    },
    async listLayers(projectId: string) {
      if (!uuid(projectId))
        throw new VectorStorageError(400, 'ID proyek tidak valid');
      const raw = await rpc('layers', { projectId });
      if (
        !Array.isArray(raw) ||
        raw.length > 8 ||
        raw.some(
          (l) =>
            !record(l) ||
            !uuid(l.id) ||
            typeof l.name !== 'string' ||
            l.name.length > 80 ||
            !Number.isSafeInteger(l.revision) ||
            Number(l.revision) < 1 ||
            !Number.isInteger(l.featureCount) ||
            Number(l.featureCount) < 0 ||
            Number(l.featureCount) > 100,
        )
      )
        throw new VectorStorageError(502, 'Respons layer tidak valid');
      return raw as VectorLayerSummary[];
    },
    async readLayer(projectId: string, layerId: string) {
      if (!uuid(projectId) || !uuid(layerId))
        throw new VectorStorageError(400, 'Identitas layer tidak valid');
      return parseVectorDocument(await rpc('load', { projectId, layerId }));
    },
    async saveLayer(input: SaveVectorLayer): Promise<VectorLayerDocument> {
      return parseVectorDocument(await rpc('save', parseVectorSave(input)));
    },
    async revisions(projectId: string, layerId: string) {
      if (!uuid(projectId) || !uuid(layerId))
        throw new VectorStorageError(400, 'Identitas revisi tidak valid');
      const raw = await rpc('revisions', { projectId, layerId });
      if (
        !Array.isArray(raw) ||
        raw.length > 30 ||
        raw.some(
          (r) =>
            !record(r) ||
            !Number.isSafeInteger(r.revision) ||
            !uuid(r.actorId) ||
            typeof r.createdAt !== 'string',
        )
      )
        throw new VectorStorageError(502, 'Respons revisi tidak valid');
      return raw as { revision: number; actorId: string; createdAt: string }[];
    },
  };
}
