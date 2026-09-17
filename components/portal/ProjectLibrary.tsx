'use client';

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useMapStore } from '../../store/useMapStore';

interface PortalProject {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  access_tier: 'public' | 'restricted';
}

const fetcher = async (): Promise<PortalProject[]> => {
  const res = await fetch('/api/projects/list');
  if (!res.ok) throw new Error('Gagal memuat pustaka proyek');
  return await res.json() as PortalProject[];
};

export default function ProjectLibrary() {
  const { data: projects, error, isLoading } = useSWR('portal_projects', fetcher);
  const router = useRouter();
  const { setActiveProject } = useMapStore();

  const handleOpenProject = (id: string) => {
    setActiveProject(id);
    router.push('/spatial');
  };

  if (error) return <div className="text-red-500">Gagal memuat pustaka proyek.</div>;
  if (isLoading) return <div className="animate-pulse flex gap-4"><div className="h-32 bg-slate-200 rounded-xl w-full"></div></div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects?.length === 0 && (
        <div className="col-span-full p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-slate-500">
          Anda belum memiliki akses ke proyek spasial manapun.
        </div>
      )}
      {projects?.map((project) => (
        <div key={project.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
          {project.access_tier === 'restricted' && (
            <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
              PRO
            </div>
          )}
          <h3 className="font-bold text-lg text-slate-800 mb-2 group-hover:text-blue-600 transition-colors pr-8">
            {project.title}
          </h3>
          {project.category && (
            <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md mb-4 font-medium">
              {project.category}
            </span>
          )}
          <p className="text-sm text-slate-500 mb-6 line-clamp-2">
            {project.description || 'Tidak ada deskripsi tersedia.'}
          </p>
          <button 
            onClick={() => handleOpenProject(project.id)}
            className="w-full py-2.5 bg-blue-50 text-blue-700 font-bold text-sm rounded-xl hover:bg-blue-600 hover:text-white transition-colors"
          >
            Buka di Peta Spasial
          </button>
        </div>
      ))}
    </div>
  );
}
