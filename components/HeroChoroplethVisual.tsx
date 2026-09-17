import { MapPin } from 'lucide-react';

export default function HeroChoroplethVisual() {
  return (
    <div className="relative w-full h-full min-h-[400px] flex flex-col items-center justify-center group cursor-crosshair">
      {/* Background Glow */}
      <div className="absolute w-[120%] h-[120%] bg-gradient-to-tr from-blue-50 to-emerald-50 rounded-full blur-3xl -z-10 transition-colors duration-1000 group-hover:from-emerald-50 group-hover:to-blue-50"></div>

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 overflow-hidden">
        
        {/* Indikator Hover Status */}
        <div className="absolute top-4 left-4 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity transform -translate-y-2 group-hover:translate-y-0 duration-300">
          <MapPin size={12} className="text-emerald-400" /> WLC ENGINE: ACTIVE
        </div>

        {/* Peta SVG Abstrak (Pulau-pulau / Poligon) */}
        <svg viewBox="0 0 400 300" className="w-full h-auto drop-shadow-sm mt-4">
          <defs>
            <linearGradient id="grad-base" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>

          {/* Poligon 1 (Region Kiri) */}
          <path 
            d="M50,150 Q70,100 120,120 T150,180 Q130,220 80,210 Z" 
            fill="url(#grad-base)"
            className="transition-all duration-500 hover:fill-amber-400 cursor-pointer"
          />
          <text x="90" y="170" fontSize="12" fill="#64748b" className="pointer-events-none font-bold">Skor: 3.2</text>
          
          {/* Poligon 2 (Region Atas) */}
          <path 
            d="M130,100 Q160,50 220,70 T280,120 Q240,160 170,140 Z" 
            fill="url(#grad-base)"
            className="transition-all duration-500 hover:fill-emerald-500 hover:-translate-y-1 hover:drop-shadow-md cursor-pointer group-hover:fill-emerald-400"
          />
          <text x="180" y="110" fontSize="12" fill="#fff" className="pointer-events-none font-bold opacity-0 group-hover:opacity-100 transition-opacity">Skor: 4.8</text>

          {/* Poligon 3 (Region Kanan) */}
          <path 
            d="M250,140 Q290,120 340,160 T320,240 Q260,260 220,200 Z" 
            fill="url(#grad-base)"
            className="transition-all duration-500 hover:fill-red-400 cursor-pointer"
          />
          <text x="260" y="190" fontSize="12" fill="#64748b" className="pointer-events-none font-bold">Skor: 1.5</text>
        </svg>

        {/* UI Overlay Legend */}
        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Legend Interaktif</span>
            <span className="text-blue-600 animate-pulse">Arahkan Kursor</span>
          </div>
          <div className="flex gap-2 h-2 rounded-full overflow-hidden">
            <div className="flex-1 bg-red-400"></div>
            <div className="flex-1 bg-amber-400"></div>
            <div className="flex-1 bg-emerald-400"></div>
          </div>
          <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-bold">
            <span>Tidak Layak</span>
            <span>Sangat Layak</span>
          </div>
        </div>
      </div>
    </div>
  );
}
