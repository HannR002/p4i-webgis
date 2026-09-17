'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useMapStore } from '../store/useMapStore';
import AhpSimulatorPanel from './AhpSimulatorPanel';
import ExportPdfButton from './ExportPdfButton';
import ExportImageButton from './ExportImageButton';
import OnboardingTour from './portal/OnboardingTour';
import FloodAnalysisPanel from './FloodAnalysisPanel';

interface ProjectSummary {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  access_tier: 'public' | 'restricted';
}

interface SessionInfo {
  authenticated: boolean;
  role?: 'super_admin' | 'managerial_analyst' | 'b2b_client';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const fetchProjects = async (): Promise<ProjectSummary[]> => {
  const res = await fetch('/api/projects/list');
  if (!res.ok) throw new Error('Gagal memuat proyek');
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('Respons proyek tidak valid');
  return data.flatMap((project) => {
    if (!isRecord(project) || typeof project.id !== 'string' || typeof project.title !== 'string') return [];
    if (project.access_tier !== 'public' && project.access_tier !== 'restricted') return [];
    return [{
      id: project.id,
      title: project.title,
      category: typeof project.category === 'string' ? project.category : null,
      description: typeof project.description === 'string' ? project.description : null,
      access_tier: project.access_tier,
    }];
  });
};

const fetchSession = async (): Promise<SessionInfo> => {
  const response = await fetch('/api/auth/session', { cache: 'no-store' });
  if (!response.ok) return { authenticated: false };
  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.authenticated !== 'boolean') return { authenticated: false };
  return {
    authenticated: data.authenticated,
    role: data.role === 'super_admin' || data.role === 'managerial_analyst' || data.role === 'b2b_client'
      ? data.role
      : undefined,
  };
};

export default function FloatingPanel() {
  const { activeProjectId, setActiveProject, isPanelOpen, togglePanel } = useMapStore();
  
  const { data: projects, error, isLoading, mutate } = useSWR('projects_list', fetchProjects);
  const { data: session } = useSWR('application_session', fetchSession, {
    revalidateOnFocus: false,
  });

  const [showAccessModal, setShowAccessModal] = useState(false);
  const [targetRestrictedProject, setTargetRestrictedProject] = useState<string | null>(null);

  const [leadForm, setLeadForm] = useState({ name: '', institution: '', email: '', whatsapp: '' });
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Yakin ingin menghapus proyek ini? Seluruh data GeoJSON juga akan terhapus secara permanen.')) {
      try {
        const res = await fetch(`/api/projects?id=${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus');
        mutate(); 
        if (activeProjectId === id) {
          setActiveProject(null);
        }
      } catch {
        alert('Terjadi kesalahan saat menghapus proyek.');
      }
    }
  };

  const handleProjectClick = (project: ProjectSummary) => {
    if (project.access_tier === 'restricted' && !session?.authenticated) {
      setTargetRestrictedProject(project.id);
      setShowAccessModal(true);
      return;
    }
    setActiveProject(project.id);
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLead(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...leadForm, requested_project_id: targetRestrictedProject })
      });
      if (res.ok) {
        setLeadSuccess(true);
      } else {
        alert('Gagal mengirim permintaan.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setIsSubmittingLead(false);
    }
  };

  return (
    <>
      <OnboardingTour />
      {/* Toggle button (visible when panel is closed) */}
      <button 
        onClick={togglePanel}
        className={`absolute top-4 left-4 z-[50] p-3 bg-white/90 backdrop-blur-md rounded-full shadow-lg hover:bg-slate-50 transition-all duration-300 text-slate-800 border border-slate-200 ${
          isPanelOpen ? 'opacity-0 pointer-events-none -translate-x-[120%]' : 'opacity-100 translate-x-0'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>

      {/* Main panel */}
      <aside className={`absolute top-4 left-4 z-40 w-80 max-h-[calc(100vh-2rem)] flex flex-col bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl border border-white/60 overflow-hidden transition-transform duration-300 ease-in-out ${
        isPanelOpen ? 'translate-x-0' : '-translate-x-[120%]'
      }`}>
      <div className="p-5 border-b border-white/40 flex flex-col gap-3 bg-white/40">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-extrabold text-slate-800 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            P4I Spatial
          </h1>
          <button 
            onClick={togglePanel}
            className="text-slate-500 hover:text-slate-800 transition-colors p-1 rounded-lg hover:bg-white/50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
          Daftar Proyek
        </h2>
        
        <div className="flex flex-col gap-3">
          {isLoading && (
            <div className="flex justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          )}
          
          {error && (
            <div className="p-3 bg-red-50/80 text-red-600 text-sm rounded-xl border border-red-100">
              Gagal memuat proyek.
            </div>
          )}
          
          {projects?.length === 0 && (
            <div className="p-4 rounded-xl bg-slate-50/50 border border-slate-200/50 border-dashed text-slate-500 text-sm text-center">
              Belum ada proyek yang tersedia
            </div>
          )}

          {projects?.map((project) => (
            <div 
              key={project.id}
              onClick={() => handleProjectClick(project)}
              className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer backdrop-blur-sm
                ${activeProjectId === project.id 
                  ? 'border-blue-500/50 bg-blue-50/80 shadow-md ring-1 ring-blue-500/20' 
                  : 'border-white/60 bg-white/40 hover:border-blue-200 hover:bg-white/70 hover:shadow-md'
                }
              `}
            >
              <div className="flex justify-between items-start mb-2 gap-2">
                <h3 className="font-bold text-slate-800 text-sm leading-tight">
                  {project.title}
                </h3>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {project.access_tier === 'restricted' && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 whitespace-nowrap border border-amber-300 shadow-sm">
                      🔒 PRO
                    </span>
                  )}
                  {project.category && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100/80 text-blue-800 whitespace-nowrap shadow-sm border border-blue-200/50">
                      {project.category}
                    </span>
                  )}
                  {session?.role === 'super_admin' && (
                    <button 
                      onClick={(e) => handleDelete(e, project.id)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                      title="Hapus Proyek"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  )}
                </div>
              </div>
              {project.description && (
                <p className="text-xs text-slate-500 line-clamp-2">
                  {project.description}
                </p>
              )}
            </div>
          ))}
        </div>

        <FloodAnalysisPanel isAuthenticated={session?.authenticated === true} />
      </div>

      {/* AHP Simulator Panel */}
      <AhpSimulatorPanel />

      {/* Export Actions */}
      <div className="p-4 border-t border-white/40 flex flex-col gap-2">
        <ExportPdfButton />
        <ExportImageButton />
      </div>

    </aside>

    {/* Restricted Access Modal */}
    {showAccessModal && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-slate-200 relative">
          
          <button 
            onClick={() => setShowAccessModal(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 p-1.5 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-50 rounded-full flex items-center justify-center border-2 border-amber-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Kajian Spasial Khusus Mitra B2B/Pemerintah</h3>
            <p className="text-sm text-slate-500">
              Silakan Masuk untuk Mengakses Data Penuh, atau ajukan Proposal Akses di bawah ini.
            </p>
          </div>

          {leadSuccess ? (
            <div className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-200 text-center text-sm font-medium">
              Terima kasih! Tim P4I akan segera menghubungi Anda.
            </div>
          ) : (
            <form onSubmit={handleLeadSubmit} className="space-y-4">
              <div>
                <input required type="text" placeholder="Nama Lengkap" className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={leadForm.name} onChange={e => setLeadForm({...leadForm, name: e.target.value})} />
              </div>
              <div>
                <input required type="text" placeholder="Instansi / Perusahaan" className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={leadForm.institution} onChange={e => setLeadForm({...leadForm, institution: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input required type="email" placeholder="Email" className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={leadForm.email} onChange={e => setLeadForm({...leadForm, email: e.target.value})} />
                <input required type="text" placeholder="No. WhatsApp" className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={leadForm.whatsapp} onChange={e => setLeadForm({...leadForm, whatsapp: e.target.value})} />
              </div>
              <div className="pt-2 flex flex-col gap-3">
                <button type="submit" disabled={isSubmittingLead} className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50">
                  {isSubmittingLead ? 'Mengirim...' : 'Request Proposal'}
                </button>
                <div className="text-center text-xs text-slate-400">Atau sudah punya akun?</div>
                <a href="/login" className="w-full py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors text-center">
                  Masuk ke Dashboard
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    )}
    </>
  );
}
