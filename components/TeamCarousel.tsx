'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail } from 'lucide-react';

const GithubIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 9 18v4"></path>
  </svg>
);

const LinkedinIcon = ({ size = 18 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle>
  </svg>
);

const TEAM_MEMBERS = [
  {
    id: 1,
    name: 'Farhan',
    role: 'Lead Architect & GIS Engineer',
    image: 'https://i.pravatar.cc/150?img=11',
    bio: 'Pakar pengembangan sistem spasial terdistribusi dengan pengalaman mendalam dalam arsitektur Web-GIS dan integrasi AHP. Berfokus pada skalabilitas dan keamanan data tingkat enterprise.',
    socials: { linkedin: 'https://www.linkedin.com/in/farhanmuhammad-id', github: 'https://github.com/HannR002', email: '#' }
  },
  {
    id: 2,
    name: 'Dinda',
    role: 'UI/UX Designer & Frontend',
    image: 'https://i.pravatar.cc/150?img=5',
    bio: 'Menciptakan antarmuka yang tidak hanya indah secara visual tetapi juga memiliki fungsionalitas tinggi (Bespoke UI). Spesialis dalam mikro-interaksi dan pengalaman pengguna B2B.',
    socials: { linkedin: '#', github: '#', email: '#' }
  },
  {
    id: 3,
    name: 'Bima',
    role: 'Data Scientist',
    image: 'https://i.pravatar.cc/150?img=13',
    bio: 'Ahli dalam pemrosesan data raster dan vektor. Mengembangkan algoritma AHP dan Weighted Linear Combination untuk evaluasi lahan presisi tinggi.',
    socials: { linkedin: '#', github: '#', email: '#' }
  },
  {
    id: 4,
    name: 'Sarah',
    role: 'Project Manager',
    image: 'https://i.pravatar.cc/150?img=20',
    bio: 'Memastikan sinkronisasi antara kebutuhan bisnis klien korporat dengan hasil rekayasa perangkat lunak P4I. Ahli metodologi Agile.',
    socials: { linkedin: '#', github: '#', email: '#' }
  },
  {
    id: 5,
    name: 'Reza',
    role: 'Cloud DevOps',
    image: 'https://i.pravatar.cc/150?img=33',
    bio: 'Mengelola infrastruktur cloud dan pipeline CI/CD untuk memastikan zero-downtime deployment pada aplikasi Spasial berskala besar.',
    socials: { linkedin: '#', github: '#', email: '#' }
  },
];

export default function TeamCarousel() {
  const [selectedMember, setSelectedMember] = useState<typeof TEAM_MEMBERS[0] | null>(null);

  // Duplikasi array untuk ilusi infinite scroll (4x untuk memastikannya tidak pernah terpotong)
  const duplicatedMembers = [...TEAM_MEMBERS, ...TEAM_MEMBERS, ...TEAM_MEMBERS, ...TEAM_MEMBERS];

  return (
    <div className="w-full py-10 relative overflow-hidden group">
      {/* Carousel Container (GPU Accelerated) */}
      <motion.div 
        animate={!selectedMember ? { x: ["0%", "-50%"] } : {}}
        transition={{ repeat: Infinity, ease: "linear", duration: 40 }}
        className="flex w-max gap-6 pb-10 pt-4 px-8 hover:[animation-play-state:paused]"
      >
        {duplicatedMembers.map((member, idx) => (
          <motion.div
            key={`${member.id}-${idx}`}
            layoutId={`card-${member.id}`}
            onClick={() => setSelectedMember(member)}
            className="snap-center flex-shrink-0 w-64 bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-3xl p-6 flex flex-col items-center text-center shadow-lg shadow-slate-200/40 hover:shadow-xl transition-all group"
            whileHover={{ y: -10, rotate: idx % 2 === 0 ? 2 : -2 }}
          >
            <motion.img 
              layoutId={`image-${member.id}`}
              src={member.image} 
              alt={member.name} 
              className="w-24 h-24 rounded-full mb-4 object-cover border-4 border-white shadow-md group-hover:scale-105 transition-transform"
            />
            <motion.h4 layoutId={`name-${member.id}`} className="text-lg font-bold text-slate-800">{member.name}</motion.h4>
            <motion.p layoutId={`role-${member.id}`} className="text-xs font-semibold text-blue-600 mt-1">{member.role}</motion.p>
          </motion.div>
        ))}
      </motion.div>

      {/* Pop-up Modal (Framer Motion AnimatePresence) */}
      <AnimatePresence>
        {selectedMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMember(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-pointer"
            />
            
            <motion.div 
              layoutId={`card-${selectedMember.id}`}
              className="relative bg-white w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl z-10 flex flex-col"
            >
              {/* Latar Belakang Gradien Atas */}
              <div className="h-32 bg-gradient-to-tr from-blue-600 to-indigo-500 w-full relative">
                <button 
                  onClick={() => setSelectedMember(null)}
                  className="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="px-8 pb-8 pt-0 relative flex flex-col items-center text-center -mt-16">
                <motion.img 
                  layoutId={`image-${selectedMember.id}`}
                  src={selectedMember.image} 
                  alt={selectedMember.name} 
                  className="w-32 h-32 rounded-full border-4 border-white shadow-lg object-cover mb-4"
                />
                <motion.h4 layoutId={`name-${selectedMember.id}`} className="text-2xl font-extrabold text-slate-900">{selectedMember.name}</motion.h4>
                <motion.p layoutId={`role-${selectedMember.id}`} className="text-sm font-bold text-blue-600 mb-6">{selectedMember.role}</motion.p>
                
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-slate-600 text-sm leading-relaxed mb-8"
                >
                  {selectedMember.bio}
                </motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex gap-4"
                >
                  <a href={selectedMember.socials.linkedin} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center text-slate-500 transition-colors">
                    <LinkedinIcon size={18} />
                  </a>
                  <a href={selectedMember.socials.github} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                    <GithubIcon size={18} />
                  </a>
                  <a href={selectedMember.socials.email} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-colors">
                    <Mail size={18} />
                  </a>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
      `}</style>
    </div>
  );
}
