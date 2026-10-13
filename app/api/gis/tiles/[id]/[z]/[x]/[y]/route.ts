import { getGisProvider } from '../../../../../../../../lib/server/gis';
import { getGisContext } from '../../../../../../../../lib/server/gis/context';
import {
  canAccessDataset,
  GisPermissionError,
} from '../../../../../../../../lib/gis/recipe';
import { GisInputError } from '../../../../../../../../lib/gis/validation';
import { getBand, rasterColor } from '../../../../../../../../lib/gis/raster';
import { gisError } from '../../../../../../../../lib/server/gis/http';
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; z: string; x: string; y: string }> },
) {
  try {
    const { id, z: zs, x: xs, y: ys } = await params;
    const [z, x, y] = [zs, xs, ys].map(Number);
    if (
      ![zs, xs, ys].every((s) => /^\d+$/.test(s)) ||
      ![z, x, y].every(Number.isInteger) ||
      z < 2 ||
      z > 18 ||
      x < 0 ||
      y < 0 ||
      x >= 2 ** z ||
      y >= 2 ** z
    )
      throw new GisInputError('Tile tidak valid');
    const p = getGisProvider();
    const c = p.catalog();
    const d = c.find((d) => d.id === id);
    if (!d?.raster) throw new GisInputError('Raster tidak dikenal');
    if (!canAccessDataset(d, await getGisContext(request, c)))
      throw new GisPermissionError('Akses ditolak');
    if (p.mode !== 'demo')
      return Response.json(
        { status: 'unavailable', reason: 'Visualisasi raster belum tersedia' },
        { status: 503 },
      );
    const url = new URL(request.url);
    const palette = (
      url.searchParams.get('palette') ?? '#eff6ff,#3b82f6,#1e3a8a'
    ).split(',');
    if (
      palette.length < 2 ||
      palette.length > 12 ||
      palette.some((v) => !/^#[0-9a-f]{6}$/i.test(v))
    )
      throw new GisInputError('Palette tidak valid');
    const band = getBand(d.raster, url.searchParams.get('band') ?? undefined);
    const min = Number(url.searchParams.get('min') ?? d.raster.range?.[0] ?? 0);
    const max = Number(
      url.searchParams.get('max') ?? d.raster.range?.[1] ?? 100,
    );
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max)
      throw new GisInputError('Rentang tidak valid');
    let rects = '';
    // Coarse display preview only; samples use each dataset's declared native synthetic grid.
    for (let row = 0; row < 16; row++)
      for (let col = 0; col < 16; col++) {
        const longitude = ((x + (col + 0.5) / 16) / 2 ** z) * 360 - 180;
        const latitude =
          (Math.atan(
            Math.sinh(Math.PI * (1 - (2 * (y + (row + 0.5) / 16)) / 2 ** z)),
          ) *
            180) /
          Math.PI;
        const sample = p.sample(id, latitude, longitude, {
          band: band.id,
          resampling: 'nearest',
        });
        if (sample.status !== 'ok' || sample.data.value === null) continue;
        const color = rasterColor(sample.data.value, d.raster, {
          palette,
          min,
          max,
          band: band.id,
        });
        if (!color) continue;
        rects += `<rect x="${col * 16}" y="${row * 16}" width="16" height="16" fill="${color}"/>`;
      }
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">${rects}</svg>`,
      {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'private, max-age=60',
          'X-P4I-Data-Mode': 'synthetic-demo',
        },
      },
    );
  } catch (e) {
    return gisError(e);
  }
}
