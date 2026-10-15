import type { RasterBand } from './contracts';

/** Onboarding requirements, NOT an available catalog or invented native RasterGrid. */
export interface ExternalRasterRequirement {
  source: string;
  reference: string;
  publicAssetId: string | null;
  band: Pick<RasterBand, 'id' | 'unit' | 'kind' | 'scale' | 'offset'> | null;
  nativeResolution: string;
  temporalSemantics: string;
  noDataSemantics: string;
  resampling: 'nearest' | 'continuous-explicit-choice';
  requiredEvidence: readonly string[];
  status: 'EXTERNAL_INTEGRATION_PENDING';
}
const common = [
  'Native CRS/grid transform from provider',
  'Version/provenance and commercial usage terms',
  'Authorized AOI and bounded estimate',
  'Verified provider mask and coverage',
] as const;
export const EXTERNAL_RASTER_REQUIREMENTS: readonly ExternalRasterRequirement[] =
  [
    {
      source: 'CHIRPS Daily',
      reference:
        'https://developers.google.com/earth-engine/datasets/catalog/UCSB-CHG_CHIRPS_DAILY',
      publicAssetId: 'UCSB-CHG/CHIRPS/DAILY',
      band: {
        id: 'precipitation',
        unit: 'mm/day',
        kind: 'continuous',
        scale: 1,
        offset: 0,
      },
      nativeResolution:
        '0.05 degree; requesting 250 m does not add spatial information',
      temporalSemantics:
        'Daily precipitation; sum inclusive selected dates using exclusive next-day end; output unit mm for the period',
      noDataSemantics:
        'Provider mask and missing daily coverage; null is never zero rainfall',
      resampling: 'continuous-explicit-choice',
      requiredEvidence: common,
      status: 'EXTERNAL_INTEGRATION_PENDING',
    },
    {
      source: 'SRTM GL1 v003',
      reference:
        'https://developers.google.com/earth-engine/datasets/catalog/USGS_SRTMGL1_003',
      publicAssetId: 'USGS/SRTMGL1_003',
      band: {
        id: 'elevation',
        unit: 'm',
        kind: 'continuous',
        scale: 1,
        offset: 0,
      },
      nativeResolution:
        '1 arc-second, nominally approximately 30 m; latitude dependent',
      temporalSemantics:
        'Static 2000 mission surface; not an observation for the selected rainfall period',
      noDataSemantics:
        'Provider void/mask handling; slope is a derived degree band, not metres',
      resampling: 'continuous-explicit-choice',
      requiredEvidence: common,
      status: 'EXTERNAL_INTEGRATION_PENDING',
    },
    {
      source: 'ESA WorldCover v200',
      reference:
        'https://developers.google.com/earth-engine/datasets/catalog/ESA_WorldCover_v200',
      publicAssetId: 'ESA/WorldCover/v200',
      band: {
        id: 'Map',
        unit: 'class',
        kind: 'categorical',
        scale: 1,
        offset: 0,
      },
      nativeResolution: 'Nominal 10 m; native grid must be inspected',
      temporalSemantics:
        '2021 land-cover product; cannot be relabeled as current rainfall-period cover',
      noDataSemantics:
        'Provider mask and unknown classes remain masked/unclassified; class codes are not ordinal scores',
      resampling: 'nearest',
      requiredEvidence: common,
      status: 'EXTERNAL_INTEGRATION_PENDING',
    },
    {
      source: 'P4I soil',
      reference: 'Owner-supplied metadata required',
      publicAssetId: null,
      band: null,
      nativeResolution: 'Unknown until owner supplies metadata',
      temporalSemantics: 'Owner-supplied survey date/validity period required',
      noDataSemantics:
        'Owner legend, valid codes, sentinel/mask and hydrologic meaning required',
      resampling: 'nearest',
      requiredEvidence: [
        ...common,
        'P4I asset identifier, band, units, class legend and permitted redistribution',
      ],
      status: 'EXTERNAL_INTEGRATION_PENDING',
    },
  ];
