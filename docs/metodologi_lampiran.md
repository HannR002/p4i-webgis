# Bab Metodologi: Implementasi Fase Rapid Construction

Sebagai bukti implementasi pada fase **Rapid Construction**, kami menggunakan teknik pemuatan komponen secara dinamis (*Dynamic Import*) di Next.js untuk menghindari masalah render sisi server (*Server-Side Rendering / SSR*) pada library peta spasial (seperti Leaflet) yang sangat bergantung pada objek `window` di *browser*. 

Berikut adalah cuplikan kode konfigurasi dari `app/page.tsx`:

```tsx
import dynamic from 'next/dynamic';

const Map = dynamic(() => import('../components/Map'), {
  ssr: false, // Menonaktifkan Server-Side Rendering untuk komponen Peta
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100">
      <p className="text-xl font-semibold">Memuat Peta Spasial P4I...</p>
    </div>
  ),
});
```

---

# Lampiran: Skrip Data Definition Language (DDL) Supabase

Untuk memperkuat validitas dari *Software Requirements Specification* (SRS), berikut adalah skrip DDL yang dieksekusi di database PostgreSQL (Supabase) untuk menyiapkan ekstensi PostGIS, membuat tabel proyek tata ruang, menginisialisasi indeks GiST, serta mendefinisikan *View* untuk mempermudah keluaran format GeoJSON.

```sql
-- 1. Mengaktifkan ekstensi PostGIS
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- 2. Membuat tabel utama untuk data spasial
CREATE TABLE public.spatial_projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT,
    description TEXT,
    geom geometry(Polygon, 4326), -- Menggunakan SRID 4326 (WGS 84)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Membuat GiST Index untuk mengoptimalkan kueri spasial
CREATE INDEX spatial_projects_geom_idx
ON public.spatial_projects
USING GIST (geom);

-- 4. (Opsional) Membuat View untuk mengekspos fitur sebagai GeoJSON secara langsung via API
CREATE OR REPLACE VIEW public.vw_spatial_projects AS
SELECT
    id,
    title,
    category,
    description,
    ST_AsGeoJSON(geom)::jsonb AS geojson,
    created_at
FROM public.spatial_projects;
```
