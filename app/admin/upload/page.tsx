'use client';

import { useState } from 'react';

export default function AdminUploadPage() {
  const [formData, setFormData] = useState({
    title: '',
    category: 'Infrastruktur',
    description: '',
    access_tier: 'public'
  });
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      alert('Silakan pilih file GeoJSON atau Shapefile (.zip)');
      return;
    }

    // OPS-01: Validasi batas ukuran file (Vercel Serverless max 4.5MB body limit)
    // TODO: migrate large-file uploads to Supabase Storage direct upload
    const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB
    if (file.size > MAX_FILE_SIZE) {
      alert(`Ukuran file terlalu besar (${(file.size / 1024 / 1024).toFixed(2)} MB). Batas maksimum saat ini adalah 4.5 MB.`);
      return;
    }

    setStatus('loading');
    setErrorMessage('');
    
    try {
      const payload = new FormData();
      payload.append('title', formData.title);
      payload.append('category', formData.category);
      payload.append('description', formData.description);
      payload.append('access_tier', formData.access_tier);
      payload.append('file', file);

      const res = await fetch('/api/projects', {
        method: 'POST',
        body: payload
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Gagal mengupload data');
      }
      
      setStatus('success');
      setFormData({ title: '', category: 'Infrastruktur', description: '', access_tier: 'public' });
      setFile(null);
      
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error: unknown) {
      console.error(error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Terjadi kesalahan tidak terduga');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 mb-6">
          <a href="/admin/dashboard" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </a>
          <h1 className="text-2xl font-bold text-slate-800 m-0">Upload Proyek Spasial</h1>
        </div>
        
        {status === 'success' && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
            Proyek berhasil diunggah!
          </div>
        )}
        
        {status === 'error' && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            <strong>Gagal: </strong> {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nama Proyek</label>
            <input 
              type="text" 
              required
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="Masukkan nama proyek"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Kategori</label>
            <select 
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
            >
              <option value="Infrastruktur">Infrastruktur</option>
              <option value="Lingkungan">Lingkungan</option>
              <option value="Pertanian">Pertanian</option>
              <option value="Komersial">Komersial</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Deskripsi</label>
            <textarea 
              required
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
              placeholder="Deskripsikan detail proyek..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tingkat Akses</label>
            <select 
              value={formData.access_tier}
              onChange={(e) => setFormData({...formData, access_tier: e.target.value})}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
            >
              <option value="public">Public (Akses Terbuka)</option>
              <option value="restricted">Restricted (Khusus Mitra B2B)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">File GeoJSON / Shapefile (.zip)</label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:border-blue-500 transition-colors bg-slate-50">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-slate-600 justify-center">
                  <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 px-2 py-1">
                    <span>Upload a file</span>
                    <input 
                      id="file-upload" 
                      name="file-upload" 
                      type="file" 
                      className="sr-only" 
                      accept=".geojson,.json,.zip,application/geo+json,application/zip"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  {file ? file.name : 'GeoJSON atau Shapefile (.zip) hingga 10MB'}
                </p>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={status === 'loading'}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Mengunggah...' : 'Unggah Proyek'}
          </button>
        </form>
      </div>
    </div>
  );
}
