'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Layers, Map as MapIcon, UploadCloud, Activity, LayoutGrid } from 'lucide-react';
import OverviewMetrics from '../../../components/dashboard/OverviewMetrics';
import ActivityFeed from '../../../components/dashboard/ActivityFeed';
import AdminUsersPage from '../users/page';

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* Sidebar / Topbar Cepat Modern */}
      <div className="w-full bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
               <LayoutGrid size={16} />
             </div>
             <h1 className="font-extrabold text-lg text-slate-800 tracking-tight">P4I Control Center</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <a href="/" target="_blank" className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <MapIcon size={14} /> Peta Global
            </a>
            <a href="/portal" target="_blank" className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <Layers size={14} /> Portal Klien
            </a>
            <div className="w-px h-5 bg-slate-200"></div>
            <Link href="/admin/upload" className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-md transition-all active:scale-95">
              <UploadCloud size={14} /> Upload Proyek
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area (BENTO GRID) */}
      <main className="max-w-[1400px] mx-auto px-6 py-10">
        
        <div className="mb-10">
          <motion.h2 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            Executive Overview
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 mt-2 font-medium text-lg"
          >
            Sistem telemetri spasial beroperasi dalam kapasitas optimal.
          </motion.p>
        </div>

        {/* Grid Modular */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-min">
          
          {/* Komponen Overview (Span 12 / Penuh) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="md:col-span-12"
          >
            <OverviewMetrics />
          </motion.div>

          {/* Activity Feed (Span 4) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="md:col-span-12 lg:col-span-4 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 overflow-hidden relative group"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Activity size={18} className="text-emerald-500" />
                Live Telemetry
              </h3>
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <ActivityFeed />
          </motion.div>

          {/* Manajemen Pengguna (Span 8) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="md:col-span-12 lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800">Manajemen Akses & Klien</h3>
              <p className="text-xs text-slate-500">Kontrol granular untuk Portal Klien</p>
            </div>
            <div className="h-[500px] overflow-y-auto custom-scrollbar relative">
              <AdminUsersPage />
            </div>
          </motion.div>

        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
