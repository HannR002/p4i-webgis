import { PieChart, Activity, Layers, BarChart2, CheckCircle2 } from 'lucide-react';

export default function HeroAnalyticsVisual() {
  return (
    <div className="relative w-full h-full min-h-[400px] flex items-center justify-center perspective-1000">
      {/* Latar Belakang Lingkaran Halus */}
      <div className="absolute w-[120%] h-[120%] bg-gradient-to-tr from-blue-50/50 to-indigo-50/50 rounded-full blur-3xl -z-10"></div>

      {/* Kontainer Utama (Melayang) */}
      <div className="relative w-full max-w-md h-[360px] transform-gpu hover:scale-105 hover:rotate-1 transition-all duration-700 ease-out flex flex-col justify-center">
        
        {/* Kartu 1: AHP Matrix (Paling Bawah/Kiri) */}
        <div className="absolute top-10 -left-6 w-56 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-slate-100 p-4 transform -rotate-6 animate-pulse" style={{ animationDuration: '4s' }}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">AHP Matrix</h4>
            <Activity size={14} className="text-blue-500" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-16 text-[10px] text-slate-500">Kesuburan</span>
              <div className="h-2 bg-slate-100 rounded-full flex-1 overflow-hidden">
                <div className="h-full bg-blue-500 w-3/4"></div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-[10px] text-slate-500">Bencana</span>
              <div className="h-2 bg-slate-100 rounded-full flex-1 overflow-hidden">
                <div className="h-full bg-red-400 w-1/4"></div>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
             <CheckCircle2 size={12} className="text-emerald-500" />
             <span className="text-[10px] font-semibold text-emerald-600">CR Valid (0.04)</span>
          </div>
        </div>

        {/* Kartu 2: Main Dashboard (Tengah, Paling Depan) */}
        <div className="absolute z-10 w-72 bg-white rounded-2xl shadow-2xl shadow-blue-900/10 border border-slate-200 p-5 transform translate-x-12 translate-y-12 transition-transform hover:-translate-y-2 duration-500">
          <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <PieChart size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Skor Kesesuaian Lahan</h3>
              <p className="text-[10px] font-medium text-slate-500">Kalimantan Selatan (Borneo)</p>
            </div>
          </div>
          
          <div className="flex items-end gap-4 mb-4">
            <div className="flex-1">
              <div className="text-3xl font-extrabold text-slate-800 tracking-tight">86<span className="text-lg text-slate-400">%</span></div>
              <div className="text-[10px] font-bold text-emerald-500 bg-emerald-50 inline-block px-2 py-1 rounded mt-1">Sangat Layak (Hijau)</div>
            </div>
            <div className="w-20 h-20 rounded-full border-4 border-slate-100 border-t-emerald-500 border-r-emerald-500 flex items-center justify-center transform -rotate-45 relative">
               <div className="w-14 h-14 rounded-full bg-slate-50 absolute"></div>
            </div>
          </div>
          
          <button className="w-full py-2 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-md flex items-center justify-center gap-2">
            <Layers size={14} /> Ekspor Report PDF
          </button>
        </div>

        {/* Kartu 3: Chart Ringkas (Kanan Atas) */}
        <div className="absolute -top-4 right-0 w-48 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-100 p-4 transform rotate-3 animate-bounce" style={{ animationDuration: '6s' }}>
          <div className="flex items-center gap-2 mb-3">
             <BarChart2 size={14} className="text-indigo-500" />
             <h4 className="text-xs font-bold text-slate-700">Distribusi Bobot</h4>
          </div>
          <div className="h-16 flex items-end gap-2 mt-2">
            <div className="flex-1 bg-indigo-500 rounded-t-md h-[80%] relative group">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">80%</div>
            </div>
            <div className="flex-1 bg-blue-400 rounded-t-md h-[40%]"></div>
            <div className="flex-1 bg-emerald-400 rounded-t-md h-[60%]"></div>
            <div className="flex-1 bg-amber-400 rounded-t-md h-[20%]"></div>
          </div>
        </div>

      </div>
    </div>
  );
}
