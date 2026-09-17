'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Cpu, Map as MapIcon, FileText, ArrowRight, Globe, Layers, BarChart } from 'lucide-react';
import EarthScrollHero from '../components/EarthScrollHero';
import TeamCarousel from '../components/TeamCarousel';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans overflow-x-hidden selection:bg-blue-500 selection:text-white">
      
      {/* HEADER MELAYANG (Floating Navbar) */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl px-6 py-4 flex justify-between items-center bg-white/70 backdrop-blur-xl border border-white shadow-xl shadow-slate-200/50 rounded-full z-50"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-600/30">
            P
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-800">
            P4I <span className="font-light text-slate-500">Corporate</span>
          </span>
        </div>
        <div className="hidden md:flex gap-8 text-sm font-semibold text-slate-600">
          <a href="#features" className="hover:text-blue-600 transition-colors">Teknologi</a>
          <a href="#ecosystem" className="hover:text-blue-600 transition-colors">Ekosistem</a>
          <a href="#team" className="hover:text-blue-600 transition-colors">Tim</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/portal" className="text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors hidden sm:block">
            Portal Klien
          </Link>
          <Link href="/admin/dashboard" className="px-5 py-2.5 bg-slate-900 hover:bg-blue-600 text-white text-sm font-bold rounded-full shadow-lg transition-all active:scale-95">
            Dasbor Admin
          </Link>
        </div>
      </motion.header>

      {/* HERO SECTION (Cinematic Scroll-linked) */}
      <section className="relative w-full h-[120vh] flex flex-col items-center justify-start pt-[30vh]">
        {/* Background Bumi Animasi Parallax */}
        <EarthScrollHero />
        
        {/* Teks Pahlawan */}
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative z-10 text-center max-w-4xl px-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold mb-6 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
            Sistem Pakar Evaluasi Lahan v2.0
          </div>
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-white leading-tight drop-shadow-2xl">
            Intelijen Tata Ruang <br /> Tingkat <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Enterprise.</span>
          </h1>
          <p className="mt-8 text-xl text-slate-300 max-w-2xl mx-auto font-medium drop-shadow-md">
            Platform Web-GIS generasi baru yang ditenagai oleh mesin AHP matematis. Keputusan spasial yang presisi, dihitung dalam hitungan milidetik.
          </p>
          
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mt-12"
          >
            <Link href="/spatial" className="inline-flex items-center gap-3 px-8 py-4 bg-white text-slate-900 font-extrabold rounded-full shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.7)] transition-all">
              Buka Peta Spasial <ArrowRight size={20} />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* FITUR MODERN (Bespoke Cards) */}
      <section id="features" className="relative w-full py-32 bg-slate-50 z-20 -mt-32 rounded-t-[3rem] border-t border-slate-200/50 shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Melampaui Peta Konvensional</h2>
            <p className="mt-6 text-lg text-slate-500 font-medium">Bukan sekadar visualisasi data. Kami membangun mesin inferensi spasial yang berpikir seperti pakar geografis.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Kartu 1 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group relative bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-8 shadow-lg shadow-blue-600/30 group-hover:scale-110 transition-transform duration-500">
                  <Cpu size={32} strokeWidth={2} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">True AHP Engine</h3>
                <p className="text-slate-600 leading-relaxed">Sistem pakar yang menjalankan kalkulasi matriks perbandingan berpasangan (Pairwise Comparison) Saaty secara langsung di peramban Anda.</p>
              </div>
            </motion.div>

            {/* Kartu 2 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group relative bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-8 shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform duration-500">
                  <MapIcon size={32} strokeWidth={2} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Live WLC Choropleth</h3>
                <p className="text-slate-600 leading-relaxed">Poligon spasial yang bereaksi instan terhadap input Anda melalui algoritma Weighted Linear Combination tanpa latensi memuat ulang.</p>
              </div>
            </motion.div>

            {/* Kartu 3 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group relative bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-8 shadow-lg shadow-indigo-600/30 group-hover:scale-110 transition-transform duration-500">
                  <FileText size={32} strokeWidth={2} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">High-Fidelity Reports</h3>
                <p className="text-slate-600 leading-relaxed">Ekspor hasil evaluasi spasial lengkap ke dalam format dokumen PDF beresolusi tinggi, merakit grafik dan peta geografis secara cerdas.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* EKOSISTEM P4I (Website Lain) */}
      <section id="ecosystem" className="w-full py-24 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">Ekosistem Digital Terintegrasi</h2>
              <p className="text-slate-400 text-lg">P4I Spatial Analytics adalah satu keping puzzle dari jaringan layanan intelijen bisnis skala penuh kami.</p>
            </div>
            <Link href="/portal" className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full font-bold transition-colors">
              Lihat Seluruh Produk
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-slate-800/50 border border-slate-700/50 p-8 rounded-3xl hover:bg-slate-800 transition-colors">
              <Globe className="text-blue-400 mb-6" size={36} />
              <h3 className="text-xl font-bold mb-2">P4I Core Platform</h3>
              <p className="text-slate-400 text-sm">Hub utama operasional bisnis dan manajemen basis data korporat tersentralisasi.</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 p-8 rounded-3xl hover:bg-slate-800 transition-colors">
              <BarChart className="text-emerald-400 mb-6" size={36} />
              <h3 className="text-xl font-bold mb-2">P4I Financial Insights</h3>
              <p className="text-slate-400 text-sm">Mesin analitik keuangan prediktif yang terkoneksi langsung dengan hasil valuasi lahan.</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 p-8 rounded-3xl hover:bg-slate-800 transition-colors">
              <Layers className="text-purple-400 mb-6" size={36} />
              <h3 className="text-xl font-bold mb-2">P4I Client Portal</h3>
              <p className="text-slate-400 text-sm">Gerbang interaktif eksklusif bagi pemangku kepentingan untuk meninjau status proyek secara real-time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* TEAM SECTION (Carousel Interaktif) */}
      <section id="team" className="w-full py-32 bg-slate-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 mb-12">
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Otak Di Balik Mesin</h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl font-medium">Tim insinyur multidisiplin yang merakit algoritma matematis rumit menjadi pengalaman antarmuka yang indah dan intuitif.</p>
        </div>
        
        {/* Carousel Komponen */}
        <TeamCarousel />
      </section>

      {/* FOOTER */}
      <footer className="w-full bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs">P</div>
            <span className="font-extrabold text-slate-900">P4I Corporate Hub</span>
          </div>
          <p className="text-slate-400 text-sm font-medium text-center md:text-left">
            &copy; {new Date().getFullYear()} Hak Cipta Dilindungi. Didesain dengan standar presisi.
          </p>
        </div>
      </footer>
    </div>
  );
}
