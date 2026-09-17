-- MODUL 3: Migrasi Portal Klien (Onboarding & Download History)

-- 1. Tambahkan flag onboarding pada profil pengguna
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT FALSE;

-- 2. Buat tabel riwayat unduhan
CREATE TABLE IF NOT EXISTS public.download_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.spatial_projects(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf_report','geojson_export','image_export')),
    downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Aktifkan RLS pada tabel download_history
ALTER TABLE public.download_history ENABLE ROW LEVEL SECURITY;

-- 4. Policy RLS: User hanya boleh membaca riwayat unduhan miliknya sendiri
CREATE POLICY "Users can view their own downloads" ON public.download_history
FOR SELECT
USING (client_user_id = auth.uid());
