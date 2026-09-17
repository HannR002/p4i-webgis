'use client';

import { motion, Variants } from 'framer-motion';
import Link from 'next/link';
import ProjectLibrary from '../../components/portal/ProjectLibrary';
import DownloadHistory from '../../components/portal/DownloadHistory';
import EcosystemSwitcher from '../../components/EcosystemSwitcher';
import { Home, Compass } from 'lucide-react';

// Varian animasi untuk Staggered Fade In
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

export default function PortalPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] relative overflow-hidden font-sans">
      
      {/* Ornamen Latar Abstrak */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-100/50 to-transparent -z-10"></div>
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-200/40 rounded-full blur-3xl -z-10"></div>
      <div className="absolute top-40 -left-20 w-72 h-72 bg-blue-300/30 rounded-full blur-3xl -z-10"></div>

      {/* FLOATING PILL NAVBAR */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-6xl px-4 py-3 flex justify-between items-center bg-white/80 backdrop-blur-xl border border-white shadow-lg shadow-slate-200/50 rounded-full z-50"
      >
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-md shadow-blue-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          </div>
          <h1 className="font-extrabold text-lg text-slate-800 tracking-tight hidden sm:block">P4I Portal</h1>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/" className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all flex items-center gap-2">
            <Home size={16} /> <span className="hidden sm:inline">Beranda</span>
          </Link>
          <Link href="/spatial" className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all flex items-center gap-2">
            <Compass size={16} /> <span className="hidden sm:inline">Peta Spasial</span>
          </Link>
          <div className="w-px h-5 bg-slate-300 mx-2"></div>
          <EcosystemSwitcher />
        </div>
      </motion.header>

      {/* KONTEN UTAMA */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24">
        
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="w-full flex flex-col gap-12"
        >
          {/* Header Konten */}
          <motion.div variants={itemVariants} className="max-w-2xl">
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">Selamat Datang di <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Pusat Kendali.</span></h2>
            <p className="text-lg text-slate-500 font-medium leading-relaxed">
              Pilih area proyek khusus Anda untuk memulai analisis Multi-Criteria Evaluation (MCE) berbasis AHP dengan presisi tinggi.
            </p>
          </motion.div>
          
          {/* Section Pustaka Proyek dengan Glassmorphism Container */}
          <motion.section variants={itemVariants} className="relative">
             <div className="absolute inset-0 bg-white/40 backdrop-blur-md rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/40 -z-10"></div>
             <div className="p-8 sm:p-10">
               <div className="flex items-center justify-between mb-8">
                 <h3 className="text-2xl font-bold text-slate-800">Pustaka Proyek Aktif</h3>
                 <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">Live Access</span>
               </div>
               <ProjectLibrary />
             </div>
          </motion.section>

          {/* Section Riwayat Unduhan */}
          <motion.section variants={itemVariants} className="relative mt-8">
             <div className="absolute inset-0 bg-white/40 backdrop-blur-md rounded-[2.5rem] border border-white shadow-xl shadow-slate-200/40 -z-10"></div>
             <div className="p-8 sm:p-10">
                <div className="flex items-center justify-between mb-8">
                 <h3 className="text-2xl font-bold text-slate-800">Arsip Laporan (PDF)</h3>
                 <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">Tersinkronisasi</span>
               </div>
               <DownloadHistory />
             </div>
          </motion.section>

        </motion.div>
      </main>
    </div>
  );
}
