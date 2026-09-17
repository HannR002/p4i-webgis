'use client';

import { useMapStore } from '../store/useMapStore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// Skala Saaty: 9 (Kiri Mutlak) sampai 1/9 (Kanan Mutlak)
const SAATY_SCALE = [9, 8, 7, 6, 5, 4, 3, 2, 1, 1/2, 1/3, 1/4, 1/5, 1/6, 1/7, 1/8, 1/9];
const SAATY_LABELS = ['9:1', '8:1', '7:1', '6:1', '5:1', '4:1', '3:1', '2:1', '1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7', '1:8', '1:9'];

export default function AhpSimulatorPanel() {
  const {
    activeProjectId,
    activeBoundaryId,
    floodAnalysisResult,
    pairwiseValues,
    updatePairwise,
    derivedWeights,
    crValue,
    isCrValid,
  } = useMapStore();

  if (!activeProjectId && !activeBoundaryId) return null;

  const data = [
    { name: 'Bencana', value: derivedWeights.bencana, color: '#ef4444' },
    { name: 'Kesuburan', value: derivedWeights.kesuburan, color: '#22c55e' },
    { name: 'Kepadatan', value: derivedWeights.kepadatan, color: '#3b82f6' }
  ];

  // Helper untuk mendapatkan index slider dari nilai aktual
  const getIndex = (val: number) => {
    // Cari nilai terdekat di SAATY_SCALE
    let closestIndex = 8; // Default 1:1
    let minDiff = Infinity;
    SAATY_SCALE.forEach((scaleVal, idx) => {
      const diff = Math.abs(scaleVal - val);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });
    return closestIndex;
  };

  const handleSliderChange = (key: 'bencanaVsKesuburan' | 'bencanaVsKepadatan' | 'kesuburanVsKepadatan', indexStr: string) => {
    const idx = parseInt(indexStr, 10);
    updatePairwise(key, SAATY_SCALE[idx]);
  };

  return (
    <div className="ahp-simulator-panel border-t border-white/40 p-4">
      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
        Expert System (AHP Matrix)
      </h2>

      <div className="space-y-4 bg-white/50 rounded-xl p-3 border border-white/60">
        
        {/* Visualisasi Donut Chart Recharts (Hanya muncul jika CR Valid) */}
        {isCrValid ? (
          <div id="ahp-chart-export" className="w-full h-[150px] bg-transparent">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={40}
                  outerRadius={60}
                  dataKey="value"
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="w-full h-[150px] flex items-center justify-center bg-red-50/50 rounded-xl border border-red-100">
            <p className="text-xs text-red-500 font-semibold text-center px-4">
              Grafik disembunyikan.<br/>Silakan sesuaikan rasio agar konsisten.
            </p>
          </div>
        )}

        {/* Input Pairwise: Bencana vs Kesuburan */}
        <div className="pt-2">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-bold text-red-600 uppercase">🔴 Bencana</label>
            <span className="text-[10px] font-mono text-slate-500">{SAATY_LABELS[getIndex(pairwiseValues.bencanaVsKesuburan)]}</span>
            <label className="text-[10px] font-bold text-green-600 uppercase">Kesuburan 🟢</label>
          </div>
          <input
            type="range"
            min="0" max="16" step="1"
            value={getIndex(pairwiseValues.bencanaVsKesuburan)}
            onChange={(e) => handleSliderChange('bencanaVsKesuburan', e.target.value)}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
          />
        </div>

        {/* Input Pairwise: Bencana vs Kepadatan */}
        <div className="pt-2">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-bold text-red-600 uppercase">🔴 Bencana</label>
            <span className="text-[10px] font-mono text-slate-500">{SAATY_LABELS[getIndex(pairwiseValues.bencanaVsKepadatan)]}</span>
            <label className="text-[10px] font-bold text-blue-600 uppercase">Kepadatan 🔵</label>
          </div>
          <input
            type="range"
            min="0" max="16" step="1"
            value={getIndex(pairwiseValues.bencanaVsKepadatan)}
            onChange={(e) => handleSliderChange('bencanaVsKepadatan', e.target.value)}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
          />
        </div>

        {/* Input Pairwise: Kesuburan vs Kepadatan */}
        <div className="pt-2">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-bold text-green-600 uppercase">🟢 Kesuburan</label>
            <span className="text-[10px] font-mono text-slate-500">{SAATY_LABELS[getIndex(pairwiseValues.kesuburanVsKepadatan)]}</span>
            <label className="text-[10px] font-bold text-blue-600 uppercase">Kepadatan 🔵</label>
          </div>
          <input
            type="range"
            min="0" max="16" step="1"
            value={getIndex(pairwiseValues.kesuburanVsKepadatan)}
            onChange={(e) => handleSliderChange('kesuburanVsKepadatan', e.target.value)}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
          />
        </div>

        {/* Validasi Consistency Ratio (CR) */}
        <div className={`text-center text-xs font-semibold py-2 px-3 rounded-lg flex flex-col gap-1 ${
          isCrValid 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <div className="flex justify-between items-center">
            <span>Consistency Ratio (CR)</span>
            <span className="font-mono">{(crValue * 100).toFixed(1)}%</span>
          </div>
          <span className="text-[10px] font-medium opacity-90">
            {isCrValid ? '✓ Logika Preferensi Konsisten' : '⚠ Logika Tidak Konsisten (CR > 10%)'}
          </span>
        </div>

        {floodAnalysisResult && (
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-[10px] text-cyan-800">
            Skor banjir aktif <strong>{floodAnalysisResult.score.toFixed(1)}</strong> digunakan sebagai
            nilai kriteria bencana fallback pada WLC untuk AOI terpilih.
          </div>
        )}
      </div>
    </div>
  );
}
