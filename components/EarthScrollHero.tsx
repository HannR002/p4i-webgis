'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

export default function EarthScrollHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  // Saat scroll ke bawah (0 -> 1): Scale membesar, Opacity memudar
  const scale = useTransform(scrollYProgress, [0, 1], [1, 2.5]);
  const opacity = useTransform(scrollYProgress, [0, 0.8, 1], [1, 0.2, 0]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0 bg-slate-950">
      <motion.div 
        style={{ scale, opacity }}
        className="w-full h-full origin-center flex items-center justify-center"
      >
        {/* Menggunakan elemen video HTML5 berulang beresolusi tinggi (Royalty Free) 
            Dalam produksi, ini bisa diganti dengan video kustom Bumi Anda */}
        <video 
          autoPlay 
          muted 
          loop 
          playsInline
          className="w-full h-full object-cover opacity-60 mix-blend-screen"
        >
          {/* URL dummy video bumi dari luar angkasa (Mixkit) */}
          <source src="https://assets.mixkit.co/videos/preview/mixkit-planet-earth-rotating-in-space-41642-large.mp4" type="video/mp4" />
        </video>
        
        {/* Gradient Overlay untuk pencampuran dengan teks */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 via-slate-900/20 to-slate-50"></div>
      </motion.div>
    </div>
  );
}
