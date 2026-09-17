import { NextResponse } from 'next/server';
import shp from 'shpjs';
import { PROJECT_CREATE_ROLES, PROJECT_DELETE_ROLES } from '../../../lib/authRoles';
import { requireRole } from '../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../lib/server/database';
import { apiErrorResponse, isUuid, readFormDataBody } from '../../../lib/server/http';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_FEATURES = 10_000;
const ALLOWED_GEOMETRIES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

interface UploadFeature {
  type: 'Feature';
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
}

interface UploadFeatureCollection {
  type: 'FeatureCollection';
  features: UploadFeature[];
}

function asTrimmedString(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFeatureCollection(value: unknown): value is UploadFeatureCollection {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
    return false;
  }
  if (value.features.length === 0 || value.features.length > MAX_FEATURES) return false;

  return value.features.every((feature) => {
    if (!isRecord(feature) || feature.type !== 'Feature' || !isRecord(feature.geometry)) return false;
    if (typeof feature.geometry.type !== 'string' || !ALLOWED_GEOMETRIES.has(feature.geometry.type)) {
      return false;
    }
    if (!('coordinates' in feature.geometry) || !hasFiniteCoordinates(feature.geometry.coordinates)) return false;
    return feature.properties === undefined || feature.properties === null || isRecord(feature.properties);
  });
}

function hasFiniteCoordinates(value: unknown, depth = 0): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) || value.length === 0 || depth > 6) return false;
  return value.every((item) => hasFiniteCoordinates(item, depth + 1));
}

function normalizeFeatureCollection(value: unknown): UploadFeatureCollection | null {
  const collections = Array.isArray(value) ? value : [value];
  const features: unknown[] = [];
  for (const collection of collections) {
    if (!isRecord(collection) || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      return null;
    }
    features.push(...collection.features);
  }
  const merged: unknown = { type: 'FeatureCollection', features };
  if (!isFeatureCollection(merged)) return null;
  return {
    type: 'FeatureCollection',
    features: merged.features.map((feature) => ({
      ...feature,
      properties: isRecord(feature.properties) ? feature.properties : {},
    })),
  };
}

export async function POST(request: Request) {
  try {
    await requireRole(request, PROJECT_CREATE_ROLES);
    const formData = await readFormDataBody(request);
    const title = asTrimmedString(formData.get('title'), 200);
    const categoryValue = formData.get('category');
    const category = categoryValue === null ? null : asTrimmedString(categoryValue, 100);
    const descriptionValue = formData.get('description');
    const description = descriptionValue === null ? null : asTrimmedString(descriptionValue, 2_000);
    const accessTierValue = formData.get('access_tier');
    const accessTier = accessTierValue === null ? 'public' : accessTierValue;
    const fileValue = formData.get('file');

    if (!title || !(fileValue instanceof File)) {
      return NextResponse.json({ error: 'Title and file are required' }, { status: 400 });
    }
    if ((categoryValue !== null && category === null) || (descriptionValue !== null && description === null)) {
      return NextResponse.json({ error: 'Invalid category or description' }, { status: 400 });
    }
    if (accessTier !== 'public' && accessTier !== 'restricted') {
      return NextResponse.json({ error: 'access_tier must be public or restricted' }, { status: 400 });
    }
    if (fileValue.size <= 0 || fileValue.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File must be between 1 byte and 25 MB' }, { status: 400 });
    }

    const fileName = fileValue.name.toLowerCase();
    let parsed: unknown;
    if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
      try {
        parsed = JSON.parse(await fileValue.text()) as unknown;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 });
      }
    } else if (fileName.endsWith('.zip')) {
      try {
        parsed = await shp(Buffer.from(await fileValue.arrayBuffer()));
      } catch {
        return NextResponse.json({ error: 'Invalid zipped Shapefile' }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported file format; upload GeoJSON or a zipped Shapefile' },
        { status: 400 },
      );
    }

    const geojson = normalizeFeatureCollection(parsed);
    if (!geojson) {
      return NextResponse.json(
        { error: `File must contain 1-${MAX_FEATURES} valid GeoJSON features` },
        { status: 400 },
      );
    }

    const projectId = await getDatabaseRepositories().projects.createWithLayers(
      { title, category, description, accessTier },
      geojson.features.map((feature) => ({
        layerName:
        (typeof feature.properties.nama_wilayah === 'string' && feature.properties.nama_wilayah) ||
        (typeof feature.properties.name === 'string' && feature.properties.name) ||
        title,
      geometry: feature.geometry,
      properties: feature.properties ?? {},
      fileSizeBytes: Math.floor(fileValue.size / geojson.features.length),
      })),
    );

    return NextResponse.json(
      { success: true, message: 'Proyek dan data spasial berhasil disimpan', projectId },
      { status: 201 },
    );
  } catch (error: unknown) {
    return apiErrorResponse(error, 'POST /api/projects');
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole(request, PROJECT_DELETE_ROLES);
    const id = new URL(request.url).searchParams.get('id');
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Project ID must be a valid UUID' }, { status: 400 });
    }

    const deleted = await getDatabaseRepositories().projects.deleteById(id);
    if (!deleted) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    return NextResponse.json({ success: true, message: 'Project deleted successfully' });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'DELETE /api/projects');
  }
}
