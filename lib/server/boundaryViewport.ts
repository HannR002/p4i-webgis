import type { BoundaryViewport } from './database/contracts';

const LEVELS = new Set<BoundaryViewport['level']>(['provinsi', 'kota', 'kecamatan']);

function finiteParam(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseBoundaryViewport(params: URLSearchParams): BoundaryViewport | null {
  const west = finiteParam(params, 'west');
  const south = finiteParam(params, 'south');
  const east = finiteParam(params, 'east');
  const north = finiteParam(params, 'north');
  const tolerance = finiteParam(params, 'tolerance');
  const level = params.get('level');
  if (
    west === null || south === null || east === null || north === null || tolerance === null ||
    !LEVELS.has(level as BoundaryViewport['level']) ||
    west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north ||
    tolerance < 0 || tolerance > 0.05
  ) return null;
  return { west, south, east, north, level: level as BoundaryViewport['level'], tolerance };
}
