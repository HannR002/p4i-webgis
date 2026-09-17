'use client';

import { useState, useEffect } from 'react';
import { getBrowserAuthProvider } from '../lib/client/auth';

export default function GlobalNavFAB() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const auth = getBrowserAuthProvider();
    void auth.hasSession().then(setIsLoggedIn).catch(() => setIsLoggedIn(false));
    return auth.onSessionChange(setIsLoggedIn);
  }, []);

  if (!isLoggedIn) return null;

  return (
    <div className="absolute top-4 right-4 z-[9999] flex flex-col items-end gap-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-white shadow-xl rounded-full border border-slate-200 hover:bg-slate-50 transition-colors text-slate-700 font-bold text-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
        Navigasi
      </button>

      {isOpen && (
        <div className="flex flex-col gap-2 p-2 bg-white rounded-2xl shadow-xl border border-slate-200 mt-1 min-w-[160px] animate-fade-in">
          <a href="/portal" className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            Portal Klien
          </a>
          <a href="/admin/dashboard" className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            Dasbor Admin
          </a>
        </div>
      )}
    </div>
  );
}
