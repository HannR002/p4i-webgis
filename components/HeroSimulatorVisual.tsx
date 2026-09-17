'use client';

import { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

export default function HeroSimulatorVisual() {
  const [val1, setVal1] = useState(50);
  const [val2, setVal2] = useState(30);
  const [isPlaying, setIsPlaying] = useState(true);

  // Animasi otomatis (Demo Mode)
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(() => {
      setVal1(prev => {
        const next = prev + (Math.random() > 0.5 ? 5 : -5);
        return Math.min(90, Math.max(10, next));
      });
      setVal2(prev => {
        const next = prev + (Math.random() > 0.5 ? 4 : -4);
        return Math.min(90, Math.max(10, next));
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Kalkulasi Skor Tiruan
  const baseScore = 65;
  const multiplier1 = (val1 - 50) * 0.4;
  const multiplier2 = (val2 - 50) * 0.2;
  const finalScore = Math.min(100, Math.max(0, baseScore + multiplier1 + multiplier2));

  // Penentuan Warna berdasarkan skor
  let statusColor = 'text-amber-500';
  let statusBg = 'bg-amber-100';
  let statusText = 'Layak Bersyarat';
  if (finalScore >= 80) {
    statusColor = 'text-emerald-500';
    statusBg = 'bg-emerald-100';
    statusText = 'Sangat Layak (Direkomendasikan)';
  } else if (finalScore < 50) {
    statusColor = 'text-red-500';
    statusBg = 'bg-red-100';
    statusText = 'Tidak Layak (Beresiko)';
  }

  return (
    <div className="relative w-full h-full min-h-[400px] flex items-center justify-center group">
      
      {/* Background Soft Glow */}
      <div className="absolute w-[120%] h-[120%] bg-gradient-to-tr from-slate-100 to-blue-50 rounded-full blur-3xl -z-10"></div>

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-blue-900/10 border border-slate-200 overflow-hidden transform transition-transform hover:-translate-y-1">
        
        {/* Header Widget */}
        <div className="bg-slate-900 p-5 flex justify-between items-center text-white">
          <div>
            <h4 className="text-sm font-bold tracking-wider uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              AHP Engine Simulator
            </h4>
            <p className="text-[10px] text-slate-400 mt-1">Interaksi Slider & Evaluasi Real-Time</p>
          </div>
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
          >
            {isPlaying ? <Pause size={14} className="text-slate-300" /> : <Play size={14} className="text-emerald-400 ml-0.5" />}
          </button>
        </div>

        <div className="p-6">
          {/* Hasil Kalkulasi Utama */}
          <div className="mb-8 text-center bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div className="text-xs font-semibold text-slate-500 mb-2">Total Nilai Kesesuaian Wilayah</div>
            <div className={`text-5xl font-extrabold tracking-tight transition-colors duration-500 ${statusColor}`}>
              {finalScore.toFixed(1)}<span className="text-2xl text-slate-400">%</span>
            </div>
            <div className={`mt-3 inline-block px-3 py-1 rounded-full text-xs font-bold transition-colors duration-500 ${statusBg} ${statusColor}`}>
              {statusText}
            </div>
          </div>

          {/* Kontrol Interaktif 1 */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-700">Prioritas Kesuburan (Benefit)</label>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{val1}%</span>
            </div>
            <input 
              type="range" 
              min="0" max="100" 
              value={val1} 
              onChange={(e) => { setIsPlaying(false); setVal1(Number(e.target.value)); }}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* Kontrol Interaktif 2 */}
          <div className="mb-2">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-700">Risiko Bencana (Cost)</label>
              <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded">{val2}%</span>
            </div>
            <input 
              type="range" 
              min="0" max="100" 
              value={val2} 
              onChange={(e) => { setIsPlaying(false); setVal2(Number(e.target.value)); }}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
          </div>
          
          <p className="text-[10px] text-slate-400 text-center mt-6 italic">
            *Coba geser slider secara manual untuk melihat perubahan skor instan.
          </p>

        </div>
      </div>
    </div>
  );
}
