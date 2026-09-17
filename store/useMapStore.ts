import { create } from 'zustand';
import { calculateAHP, AHPResult } from '../utils/ahpCalculator';
import type {
  AdministrativeLevel,
  FloodAnalysisResult,
} from '../types/flood';

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

  setActiveProject: (id: string | null) => void;
  setActiveBoundary: (boundary: {
    id: string;
    name: string;
    level: AdministrativeLevel;
  } | null) => void;
  setFloodAnalysisResult: (result: FloodAnalysisResult | null) => void;
  togglePanel: () => void;
  setMapCenter: (center: [number, number]) => void;
  
  // AHP Expert System Action
  updatePairwise: (key: keyof PairwiseValues, value: number) => void;
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
  derivedWeights: { bencana: 0.333, kesuburan: 0.333, kepadatan: 0.333 },
  crValue: 0,
  isCrValid: true,

  setActiveProject: (id) => set({ activeProjectId: id }),
  setActiveBoundary: (boundary) => set({
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
    
    // Bangun Matriks 3x3
    // Index 0: Bencana, Index 1: Kesuburan, Index 2: Kepadatan
    const matrix = [
      [1, newValues.bencanaVsKesuburan, newValues.bencanaVsKepadatan],
      [1 / newValues.bencanaVsKesuburan, 1, newValues.kesuburanVsKepadatan],
      [1 / newValues.bencanaVsKepadatan, 1 / newValues.kesuburanVsKepadatan, 1]
    ];

    // Kalkulasi Eigenvector & CR
    const result: AHPResult = calculateAHP(matrix);

    set({ 
      pairwiseValues: newValues,
      derivedWeights: result.weights,
      crValue: result.cr,
      isCrValid: result.isValid
    });
  }
}));
