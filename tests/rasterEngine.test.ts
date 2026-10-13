import { describe, it, expect } from 'vitest';
import type { RasterDataset, RasterMetadata } from '../lib/gis/contracts';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import {
  sampleGrid,
  gridPosition,
  transformCoordinate,
  gridsMatch,
  rasterColor,
  classifyValue,
} from '../lib/gis/raster';
import { validateRasterMetadata } from '../lib/gis/validation';
import {
  sphericalArea,
  sphericalDistance,
  pointInPolygon,
  selectVectorIds,
} from '../lib/gis/geometry';
import {
  parsePixelQuery,
  parseRasterOperation,
} from '../lib/gis/rasterValidation';
const original = createDemoGisProvider()
  .catalog()
  .find((d) => d.id === 'demo-rainfall')! as RasterDataset;
const dataset: RasterDataset = {
  ...structuredClone(original),
  bounds: [0, 0, 2, 2],
  raster: {
    ...structuredClone(original.raster),
    resolution: { x: 1, y: 1, unit: 'degree' },
    scale: 1,
    grid: {
      origin: [0, 2],
      pixelSize: [1, -1],
      width: 2,
      height: 2,
      pixelReference: 'area',
    },
    bands: [
      { id: 'raw', unit: 'test', kind: 'continuous', scale: 0.1, offset: 5 },
    ],
  },
};
const read = (column: number, row: number) =>
  [
    [10, 20],
    [30, 40],
  ][row][column];
const sample = (
  x: number,
  y: number,
  method: 'nearest' | 'bilinear' = 'nearest',
) => sampleGrid(dataset, { x, y, crs: 'EPSG:4326' }, undefined, method, read);
describe('native pixel semantics', () => {
  it.each([
    [0, 2, 0, 0],
    [1, 1, 1, 1],
    [1.999, 0.001, 1, 1],
  ])(
    'uses x=longitude, y=latitude and north-up rows at %s,%s',
    (x, y, column, row) => {
      expect(sample(x, y).cell).toMatchObject({ column, row });
    },
  );
  it.each([
    [2, 1],
    [1, 0],
    [-0.01, 1],
    [1, 2.01],
  ])('excludes east/south edges and outside coordinates at %s,%s', (x, y) => {
    expect(sample(x, y)).toMatchObject({
      value: null,
      cell: null,
      noData: true,
      noDataReason: 'outside-coverage',
    });
  });
  it('reports pixel center separately from the query coordinate and applies encoding once', () => {
    expect(sample(0.1, 1.9)).toMatchObject({
      rawValue: 10,
      value: 6,
      latitude: 1.9,
      longitude: 0.1,
      cell: { center: [0.5, 1.5] },
    });
  });
  it('interpolates continuous physical values and does not extrapolate edge neighborhoods', () => {
    expect(sample(1, 1, 'bilinear').value).toBeCloseTo(7.5);
    expect(sample(0.1, 1.9, 'bilinear').noDataReason).toBe(
      'invalid-neighborhood',
    );
    expect(sample(0.5, 1.5, 'bilinear').value).toBe(6);
  });
  it('propagates a masked neighbor, while zero is valid unless explicitly a sentinel', () => {
    const p = { x: 1, y: 1, crs: 'EPSG:4326' } as const;
    expect(
      sampleGrid(dataset, p, undefined, 'bilinear', (c, r) =>
        c === 1 && r === 1 ? null : read(c, r),
      ),
    ).toMatchObject({ value: null, noDataReason: 'invalid-neighborhood' });
    expect(
      sampleGrid(
        dataset,
        { x: 0.5, y: 1.5, crs: 'EPSG:4326' },
        undefined,
        'nearest',
        () => 0,
      ).value,
    ).toBe(5);
    expect(
      sampleGrid(
        {
          ...dataset,
          raster: {
            ...dataset.raster,
            noData: { value: 0, meaning: 'masked' },
          },
        },
        { x: 0.5, y: 1.5, crs: 'EPSG:4326' },
        undefined,
        'nearest',
        () => 0,
      ).noData,
    ).toBe(true);
  });
  it('transforms Web Mercator without swapping axes and rejects unsupported projections/poles', () => {
    const wgs = { x: 103.6, y: -1.6, crs: 'EPSG:4326' } as const;
    const [x, y] = transformCoordinate(wgs, 'EPSG:3857');
    const back = transformCoordinate({ x, y, crs: 'EPSG:3857' }, 'EPSG:4326');
    expect(back[0]).toBeCloseTo(wgs.x, 8);
    expect(back[1]).toBeCloseTo(wgs.y, 8);
    expect(() => transformCoordinate({ ...wgs, y: 90 }, 'EPSG:3857')).toThrow();
    expect(() => transformCoordinate(wgs, 'EPSG:32748')).toThrow();
  });
  it('keeps geometry lookup in grid units rather than labelling degrees as metres', () => {
    expect(gridPosition(dataset.raster.grid, 0.5, 1.5)?.center).toEqual([
      0.5, 1.5,
    ]);
    expect(dataset.raster.resolution.unit).toBe('degree');
  });
});
describe('metadata, styling and classification', () => {
  it('rejects inconsistent, rotated/non-north-up, duplicate or invalid temporal metadata', () => {
    const m = dataset.raster;
    const invalid: RasterMetadata[] = [
      { ...m, resolution: { ...m.resolution, unit: 'metre' } },
      { ...m, grid: { ...m.grid, pixelSize: [1, 1] } },
      { ...m, grid: { ...m.grid, pixelSize: [2, -1] } },
      { ...m, bands: [m.bands[0], m.bands[0]] },
      { ...m, period: { start: '2025-02-30', end: '2025-12-31' } },
    ];
    invalid.forEach((metadata) =>
      expect(() => validateRasterMetadata(metadata)).toThrow(),
    );
  });
  it('detects subpixel origin, resolution, CRS and period mismatches', () => {
    const m = dataset.raster;
    expect(gridsMatch(m, structuredClone(m))).toBe(true);
    for (const changed of [
      { ...m, grid: { ...m.grid, origin: [1e-6, 2] as [number, number] } },
      { ...m, grid: { ...m.grid, pixelSize: [0.5, -1] as [number, number] } },
      { ...m, crs: 'EPSG:3857' },
      { ...m, period: { ...m.period, end: '2025-11-30' } },
    ])
      expect(gridsMatch(m, changed)).toBe(false);
  });
  it('maps categorical codes by class identity and refuses bilinear/normalization semantics', () => {
    const land = createDemoGisProvider()
      .catalog()
      .find((d) => d.id === 'demo-landcover')! as RasterDataset;
    const style = {
      min: 0,
      max: 100,
      palette: ['#000000', '#ffffff', '#ff0000', '#0000ff'],
    };
    expect(rasterColor(50, land.raster, style)).toBe('#ff0000');
    expect(rasterColor(999, land.raster, style)).toBeNull();
    expect(rasterColor(null, land.raster, style)).toBeNull();
    expect(() =>
      sampleGrid(
        land,
        { x: 103.6, y: -1.6, crs: 'EPSG:4326' },
        undefined,
        'bilinear',
        () => 50,
      ),
    ).toThrow();
    expect(() =>
      validateRasterMetadata({
        ...land.raster,
        bands: [{ ...land.raster.bands[0], scale: 2 }],
      }),
    ).toThrow();
  });
  it('uses half-open classification intervals and leaves unmatched values unclassified', () => {
    const classes = [
      { from: 0, to: 10, output: 1, label: 'A' },
      { from: 10, to: 20, output: 2, label: 'B' },
    ];
    expect(classifyValue(10, classes)).toEqual({ value: 2, label: 'B' });
    expect(classifyValue(20, classes)).toBeNull();
    expect(classifyValue(null, classes)).toBeNull();
  });
  it('rejects unsupported styles instead of applying invalid color ranges', () => {
    expect(() =>
      rasterColor(1, dataset.raster, {
        palette: ['javascript:evil', '#ffffff'],
        min: 0,
        max: 10,
      }),
    ).toThrow();
    expect(() =>
      rasterColor(1, dataset.raster, {
        palette: ['#000000', '#ffffff'],
        min: 10,
        max: 10,
      }),
    ).toThrow();
  });
  it('requires explicit coordinate conventions and rejects code/extra operation fields', () => {
    expect(() =>
      parsePixelQuery({
        coordinate: { x: 1, y: 1, crs: 'EPSG:4326' },
        latitude: 1,
        longitude: 1,
        datasetIds: ['demo-rainfall'],
      }),
    ).toThrow();
    expect(() =>
      parseRasterOperation({
        operation: 'eval',
        coordinate: { x: 1, y: 1, crs: 'EPSG:4326' },
        code: 'alert(1)',
      }),
    ).toThrow();
    expect(() =>
      parseRasterOperation({
        operation: 'classify',
        datasetId: 'demo-rainfall',
        coordinate: { x: 1, y: 1, crs: 'EPSG:4326' },
        classes: [
          { from: 0, to: 20, output: 1, label: 'A' },
          { from: 10, to: 30, output: 2, label: 'B' },
        ],
      }),
    ).toThrow();
  });
});
describe('local vector measurements/selection', () => {
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
      [
        [0.2, 0.2],
        [0.8, 0.2],
        [0.8, 0.8],
        [0.2, 0.8],
        [0.2, 0.2],
      ],
    ],
  };
  it('calculates spherical distance including date-line crossing', () => {
    expect(sphericalDistance([0, 0], [1, 0])).toBeCloseTo(111195.0802, 3);
    expect(sphericalDistance([179.5, 0], [-179.5, 0])).toBeCloseTo(
      111195.0802,
      3,
    );
  });
  it('subtracts polygon holes and does not depend on winding order', () => {
    const plain = { ...geometry, coordinates: [geometry.coordinates[0]] };
    expect(sphericalArea(geometry)).toBeLessThan(sphericalArea(plain));
    expect(sphericalArea(plain)).toBeCloseTo(12363718145.18, -3);
    expect(
      sphericalArea({
        ...plain,
        coordinates: [plain.coordinates[0].slice().reverse()],
      }),
    ).toBeCloseTo(sphericalArea(plain), 0);
  });
  it('selects outer boundaries but excludes holes and hole boundaries', () => {
    expect(pointInPolygon([0, 0.5], geometry)).toBe(true);
    expect(pointInPolygon([0.5, 0.5], geometry)).toBe(false);
    expect(pointInPolygon([0.2, 0.5], geometry)).toBe(false);
    expect(
      selectVectorIds([0.1, 0.1], {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', id: 'a', geometry, properties: {} }],
      }),
    ).toEqual(['a']);
  });
});
