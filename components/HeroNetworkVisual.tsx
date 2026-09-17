import { BrainCircuit } from 'lucide-react';

export default function HeroNetworkVisual() {
  return (
    <div className="relative w-full h-full min-h-[400px] flex items-center justify-center">
      
      {/* Latar Belakang Lingkaran (Radar) */}
      <div className="absolute w-[350px] h-[350px] rounded-full border border-slate-200/50 flex items-center justify-center">
        <div className="w-[250px] h-[250px] rounded-full border border-blue-100 flex items-center justify-center">
           <div className="w-[150px] h-[150px] rounded-full border border-indigo-100 bg-indigo-50/30 flex items-center justify-center">
             <div className="w-16 h-16 rounded-full bg-white shadow-xl shadow-blue-500/20 flex items-center justify-center z-10 animate-pulse" style={{ animationDuration: '3s' }}>
               <BrainCircuit size={28} className="text-blue-600" />
             </div>
           </div>
        </div>
      </div>

      {/* Jaring-jaring / Nodes (Sistem Pakar) */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400">
        <defs>
          <linearGradient id="line-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="line-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="line-grad-3" x1="50%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Garis Koneksi */}
        <line x1="200" y1="200" x2="80" y2="100" stroke="url(#line-grad-1)" strokeWidth="2" strokeDasharray="4 4" className="animate-[dash_3s_linear_infinite]" />
        <line x1="200" y1="200" x2="320" y2="80" stroke="url(#line-grad-2)" strokeWidth="2" strokeDasharray="4 4" className="animate-[dash_4s_linear_infinite]" />
        <line x1="200" y1="200" x2="330" y2="280" stroke="url(#line-grad-1)" strokeWidth="2" strokeDasharray="4 4" className="animate-[dash_2s_linear_infinite]" />
        <line x1="200" y1="200" x2="100" y2="300" stroke="url(#line-grad-3)" strokeWidth="2" strokeDasharray="4 4" className="animate-[dash_3.5s_linear_infinite]" />
        
        {/* Node 1: Kesuburan */}
        <circle cx="80" cy="100" r="8" fill="#3b82f6" />
        <circle cx="80" cy="100" r="14" fill="#3b82f6" opacity="0.3" className="animate-ping" style={{ animationDuration: '2s' }} />
        <text x="60" y="85" fontSize="11" fill="#64748b" fontWeight="bold">Input: Kesuburan</text>
        <text x="65" y="125" fontSize="10" fill="#3b82f6" fontWeight="bold" className="animate-pulse">W=0.666</text>

        {/* Node 2: Kepadatan */}
        <circle cx="320" cy="80" r="8" fill="#10b981" />
        <circle cx="320" cy="80" r="14" fill="#10b981" opacity="0.3" className="animate-ping" style={{ animationDuration: '3s' }} />
        <text x="310" y="65" fontSize="11" fill="#64748b" fontWeight="bold">Input: Kepadatan</text>
        <text x="315" y="105" fontSize="10" fill="#10b981" fontWeight="bold" className="animate-pulse">W=0.166</text>

        {/* Node 3: Bencana */}
        <circle cx="330" cy="280" r="8" fill="#818cf8" />
        <circle cx="330" cy="280" r="14" fill="#818cf8" opacity="0.3" className="animate-ping" style={{ animationDuration: '2.5s' }} />
        <text x="320" y="310" fontSize="11" fill="#64748b" fontWeight="bold">Input: Bencana</text>
        <text x="325" y="265" fontSize="10" fill="#818cf8" fontWeight="bold" className="animate-pulse">W=0.166</text>

        {/* Node 4: Geospasial */}
        <circle cx="100" cy="300" r="8" fill="#f59e0b" />
        <circle cx="100" cy="300" r="14" fill="#f59e0b" opacity="0.3" className="animate-ping" style={{ animationDuration: '4s' }} />
        <text x="70" y="330" fontSize="11" fill="#64748b" fontWeight="bold">Sistem WLC</text>
        
        {/* Style untuk animasi garis putus-putus berjalan */}
        <style>
          {`
            @keyframes dash {
              to {
                stroke-dashoffset: -20;
              }
            }
          `}
        </style>
      </svg>
      
      {/* Label Deskriptif melayang */}
      <div className="absolute bottom-4 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 shadow-sm text-xs font-bold text-slate-600 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
        AHP Inference Engine sedang berjalan...
      </div>
    </div>
  );
}
