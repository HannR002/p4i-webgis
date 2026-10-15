import { create } from 'zustand';
import {
  calculatePreferences,
  DEFAULT_PAIRWISE,
  validatePreferenceWeights,
} from '../utils/analysisPreferences';
import type {
  CriterionWeights,
  PairwisePreferences,
} from '../lib/gis/analysisContracts';
import type { AdministrativeLevel, FloodAnalysisResult } from '../types/flood';

interface PairwiseValues {
  bencanaVsKesuburan: number; // >1 berarti Bencana lebih penting, <1 berarti Kesuburan lebih penting
  bencanaVsKepadatan: number;
  kesuburanVsKepadatan: number;
}

interface MapState {
  activeProjectId: string | null;
  activeBoundaryId: string | null;
  activeBoundaryName: string | null;
  activeBoundaryLevel: AdministrativeLevel | null;
  floodAnalysisResult: FloodAnalysisResult | null;
  isPanelOpen: boolean;
  mapCenter: [number, number];

  // AHP Expert System States
  pairwiseValues: PairwiseValues;
  derivedWeights: { bencana: number; kesuburan: number; kepadatan: number };
  crValue: number;
  isCrValid: boolean;
  weightMethod: 'ahp' | 'manual-wlc';

  setActiveProject: (id: string | null) => void;
  setActiveBoundary: (
    boundary: {
      id: string;
      name: string;
      level: AdministrativeLevel;
    } | null,
  ) => void;
  setFloodAnalysisResult: (result: FloodAnalysisResult | null) => void;
  togglePanel: () => void;
  setMapCenter: (center: [number, number]) => void;

  // AHP Expert System Action
  updatePairwise: (key: keyof PairwiseValues, value: number) => void;
  setAHPPreferences: (value: PairwisePreferences) => void;
  setWLCWeights: (value: CriterionWeights) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  activeProjectId: null,
  activeBoundaryId: null,
  activeBoundaryName: null,
  activeBoundaryLevel: null,
  floodAnalysisResult: null,
  isPanelOpen: true,
  mapCenter: [-0.7893, 113.9213], // Default center (Indonesia)

  // Default AHP (Sama Rata = 1)
  pairwiseValues: {
    bencanaVsKesuburan: 1,
    bencanaVsKepadatan: 1,
    kesuburanVsKepadatan: 1,
  },
  derivedWeights: calculatePreferences(DEFAULT_PAIRWISE).weights,
  crValue: 0,
  isCrValid: true,
  weightMethod: 'ahp',

  setActiveProject: (id) => set({ activeProjectId: id }),
  setActiveBoundary: (boundary) =>
    set({
      activeBoundaryId: boundary?.id ?? null,
      activeBoundaryName: boundary?.name ?? null,
      activeBoundaryLevel: boundary?.level ?? null,
      floodAnalysisResult: null,
    }),
  setFloodAnalysisResult: (result) => set({ floodAnalysisResult: result }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  setMapCenter: (center) => set({ mapCenter: center }),

  updatePairwise: (key, value) => {
    const { pairwiseValues } = get();
    const newValues = { ...pairwiseValues, [key]: value };

    get().setAHPPreferences(newValues);
  },
  setAHPPreferences: (value) => {
    const result = calculatePreferences(value);
    set({
      pairwiseValues: { ...value },
      derivedWeights: result.weights,
      crValue: result.cr,
      isCrValid: result.isValid,
      weightMethod: 'ahp',
    });
  },
  setWLCWeights: (value) =>
    set({
      derivedWeights: validatePreferenceWeights(value),
      weightMethod: 'manual-wlc',
      isCrValid: true,
    }),
}));
