-- TUGAS 3: Migrasi Skema User Management & B2B Entitlements

-- 1. Tambahkan kolom is_disabled pada user_profiles (asumsi tabel user_profiles sudah ada)
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT false;

-- 2. Buat tabel b2b_entitlements
CREATE TABLE IF NOT EXISTS public.b2b_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.spatial_projects(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES public.user_profiles(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (client_user_id, project_id)
);

-- 3. (Opsional) Buat tabel audit_logs sederhana
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    target_id UUID,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Set RLS (Row Level Security) - Opsional namun disarankan
ALTER TABLE public.b2b_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Karena kita mengakses via Service Role Key (backend), kita tidak perlu menambahkan policy publik.
