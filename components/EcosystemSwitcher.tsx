'use client';

import { useState, useRef, useEffect } from 'react';
import { Grid, Map as MapIcon, BookOpen, GraduationCap } from 'lucide-react';

export default function EcosystemSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Menutup dropdown jika user mengklik area di luar komponen
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const apps = [
    {
      name: 'P4I Spatial Analytics',
      description: 'Web-GIS & Tata Ruang',
      url: '/', // URL app saat ini
      icon: <MapIcon className="w-5 h-5 text-blue-500" />,
      active: true,
      badge: null,
    },
    {
      name: 'P4I Journal (OJS)',
      description: 'Publikasi & Riset Akademik',
      url: '#', 
      icon: <BookOpen className="w-5 h-5 text-emerald-500" />,
      active: false,
      badge: 'Coming Soon',
    },
    {
      name: 'P4I Academy',
      description: 'Sistem Pembelajaran & Kursus',
      url: '#', 
      icon: <GraduationCap className="w-5 h-5 text-purple-500" />,
      active: false,
      badge: 'Coming Soon',
    }
  ];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Tombol Grid 9 Titik */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-white/10 hover:bg-white/20 border border-slate-200/50 rounded-xl transition-all duration-200 ease-in-out shadow-sm backdrop-blur-md text-slate-700 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 flex items-center justify-center"
        aria-label="P4I Ecosystem Apps"
      >
        <Grid className="w-5 h-5" />
      </button>

      {/* Dropdown Popover (Glassmorphism Presisi) */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 origin-top-right rounded-2xl bg-white/80 backdrop-blur-md border border-white/20 shadow-2xl ring-1 ring-black/5 focus:outline-none z-[100] overflow-hidden transform transition-all duration-300 opacity-100 scale-100">
          <div className="px-5 py-4 border-b border-slate-100/60 bg-gradient-to-r from-blue-50/50 to-transparent">
            <h3 className="text-sm font-bold text-slate-800">P4I Ecosystem</h3>
            <p className="text-xs text-slate-500 mt-0.5">Satu Akun, Seluruh Layanan</p>
          </div>
          
          <div className="p-3 grid grid-cols-1 gap-1">
            {apps.map((app, idx) => (
              <a
                key={idx}
                href={app.url}
                className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-200 group relative
                  ${app.active 
                    ? 'bg-blue-50/60 border border-blue-100' 
                    : 'hover:bg-slate-50/50 border border-transparent hover:border-slate-100 cursor-default'
                  }`}
                onClick={(e) => { if (app.badge) e.preventDefault(); }}
              >
                <div className="p-2.5 rounded-lg bg-white shadow-sm ring-1 ring-slate-900/5 group-hover:scale-110 transition-transform duration-200">
                  {app.icon}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <h4 className={`text-sm font-semibold ${app.active ? 'text-blue-700' : 'text-slate-700 group-hover:text-blue-600'}`}>
                      {app.name}
                    </h4>
                    {app.badge && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/10">
                        {app.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{app.description}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
