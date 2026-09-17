'use client';

import { useMemo, useState } from 'react';
import {
  DEFAULT_FLOOD_WEIGHTS,
  getDefaultAnalysisPeriod,
} from '../config/floodRiskModel';
import { useMapStore } from '../store/useMapStore';
import type { FloodAnalysisResult, FloodCriterion } from '../types/flood';

const CRITERIA: Array<{ key: FloodCriterion; label: string }> = [
  { key: 'rainfall', label: 'Curah hujan' },
  { key: 'slope', label: 'Kemiringan' },
  { key: 'soil', label: 'Tanah' },
  { key: 'land_cover', label: 'Tutupan lahan' },
];

const CLASS_LABELS: Record<FloodAnalysisResult['classification'], string> = {
  very_low: 'Sangat Rendah',
  low: 'Rendah',
  moderate: 'Sedang',
  high: 'Tinggi',
  very_high: 'Sangat Tinggi',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFloodResult(value: unknown): value is FloodAnalysisResult {
  return isRecord(value)
    && typeof value.kecamatan_id === 'string'
    && typeof value.score === 'number'
    && typeof value.classification === 'string'
    && isRecord(value.criteria_breakdown)
    && isRecord(value.weights_used);
}

function getApiError(value: unknown): string {
  return isRecord(value) && typeof value.error === 'string'
    ? value.error
    : 'Analisis banjir gagal dijalankan.';
}

export default function FloodAnalysisPanel({ isAuthenticated }: { isAuthenticated: boolean }) {
  const {
    activeBoundaryId,
    activeBoundaryName,
    floodAnalysisResult,
    setFloodAnalysisResult,
  } = useMapStore();
  const defaultPeriod = useMemo(() => getDefaultAnalysisPeriod(), []);
  const [weights, setWeights] = useState(() => ({
    rainfall: DEFAULT_FLOOD_WEIGHTS.rainfall * 100,
    slope: DEFAULT_FLOOD_WEIGHTS.slope * 100,
    soil: DEFAULT_FLOOD_WEIGHTS.soil * 100,
    land_cover: DEFAULT_FLOOD_WEIGHTS.land_cover * 100,
  }));
  const [period, setPeriod] = useState(defaultPeriod);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const weightsValid = Math.abs(totalWeight - 100) < 0.0001;

  const runAnalysis = async () => {
    if (!activeBoundaryId || !weightsValid || status === 'loading') return;
    setStatus('loading');
    setError(null);
    try {
      const response = await fetch('/api/gee/flood-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kecamatan_id: activeBoundaryId,
          weights: {
            rainfall: weights.rainfall / 100,
            slope: weights.slope / 100,
            soil: weights.soil / 100,
            land_cover: weights.land_cover / 100,
          },
          period,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getApiError(body));
      if (!isFloodResult(body)) throw new Error('Respons analisis tidak valid.');
      setFloodAnalysisResult(body);
      setStatus('idle');
    } catch (requestError: unknown) {
      setStatus('error');
      setError(requestError instanceof Error ? requestError.message : 'Analisis banjir gagal.');
    }
  };

  return (
    <section className="mt-5 border-t border-slate-200/70 pt-4" aria-labelledby="flood-analysis-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="flood-analysis-title" className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Flood Risk Analysis
        </h2>
        {floodAnalysisResult && (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase text-slate-600">
            Cache {floodAnalysisResult.cache_status}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-white/70 p-3">
        <p className="text-xs font-semibold text-slate-700">
          {activeBoundaryName ?? 'Pilih kecamatan pada peta'}
        </p>
        {!activeBoundaryId && (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Perbesar peta hingga level kecamatan, lalu klik boundary P4I.
          </p>
        )}
        {activeBoundaryId && !isAuthenticated && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-700">
            Masuk untuk menjalankan komputasi Earth Engine.
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {CRITERIA.map(({ key, label }) => (
            <label key={key} className="text-[10px] font-semibold text-slate-500">
              {label} (%)
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={weights[key]}
                onChange={(event) => setWeights((current) => ({
                  ...current,
                  [key]: Number(event.target.value),
                }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400"
              />
            </label>
          ))}
        </div>
        <div className={`mt-2 text-[10px] font-semibold ${weightsValid ? 'text-emerald-600' : 'text-red-600'}`}>
          Total bobot: {totalWeight.toFixed(1)}%
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[10px] font-semibold text-slate-500">
            Mulai
            <input
              type="date"
              value={period.start}
              onChange={(event) => setPeriod((current) => ({ ...current, start: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"
            />
          </label>
          <label className="text-[10px] font-semibold text-slate-500">
            Selesai
            <input
              type="date"
              value={period.end}
              onChange={(event) => setPeriod((current) => ({ ...current, end: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={runAnalysis}
          disabled={!activeBoundaryId || !isAuthenticated || !weightsValid || status === 'loading'}
          className="mt-3 w-full rounded-xl bg-cyan-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'loading' ? 'Menghitung di Earth Engine…' : 'Jalankan Analisis Banjir'}
        </button>

        {error && <p role="alert" className="mt-2 text-[11px] text-red-600">{error}</p>}
      </div>

      {floodAnalysisResult && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Skor Risiko</p>
              <p className="text-3xl font-black text-slate-800">{floodAnalysisResult.score.toFixed(1)}</p>
            </div>
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-700">
              {CLASS_LABELS[floodAnalysisResult.classification]}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {CRITERIA.map(({ key, label }) => {
              const criterion = floodAnalysisResult.criteria_breakdown[key];
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-[10px] text-slate-600">
                    <span>{label}</span>
                    <span>{(criterion.susceptibility * 100).toFixed(1)}% × {(criterion.weight * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-cyan-600"
                      style={{ width: `${criterion.susceptibility * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[9px] leading-relaxed text-slate-400">
            Periode {floodAnalysisResult.period.start}–{floodAnalysisResult.period.end} · Model {floodAnalysisResult.model_version}
          </p>
          <div className="mt-3 flex items-center gap-1 text-[9px] text-slate-500">
            {['#1a9850', '#91cf60', '#fee08b', '#fc8d59', '#d73027'].map((color) => (
              <span key={color} className="h-2 flex-1 rounded-sm" style={{ backgroundColor: color }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[8px] text-slate-400">
            <span>Risiko rendah</span><span>Risiko tinggi</span>
          </div>
        </div>
      )}
    </section>
  );
}

