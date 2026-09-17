export default function MapLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-[999] bg-white/20 backdrop-blur-sm flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 bg-white/80 p-6 rounded-2xl shadow-2xl border border-white/60">
        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="font-semibold text-slate-700 tracking-wide">Memuat Data Spasial...</span>
      </div>
    </div>
  );
}
