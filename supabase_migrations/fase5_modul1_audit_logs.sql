-- MODUL 1: Migrasi Skema Audit Trail Tingkat Database

-- 1. Buat tabel audit_logs
DROP TABLE IF EXISTS public.audit_logs CASCADE;
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('INSERT','UPDATE','DELETE')),
    table_name TEXT NOT NULL,
    record_id UUID,
    ip_address TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Buat index untuk performa query dashboard
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- 3. Aktifkan RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. Policy RLS: Hanya super_admin yang bisa membaca (SELECT). 
-- Insert hanya dilakukan oleh trigger security definer, client dilarang insert langsung.
CREATE POLICY "Super admin can read audit logs" ON public.audit_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
    )
);

-- 5. Fungsi Trigger PostgreSQL (Security Definer agar bisa bypass RLS saat insert)
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_ip_address TEXT;
BEGIN
    -- Ambil user_id dari JWT claim Supabase
    v_user_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    
    -- Ambil IP dari custom config (disetel dari API Route jika memungkinkan, jika tidak maka NULL)
    v_ip_address := current_setting('request.ip_address', true);

    INSERT INTO public.audit_logs (user_id, action_type, table_name, record_id, ip_address, metadata)
    VALUES (
        v_user_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        v_ip_address,
        CASE TG_OP
            WHEN 'DELETE' THEN to_jsonb(OLD)
            ELSE to_jsonb(NEW)
        END
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Pasang Trigger ke Tabel-Tabel Sensitif
DROP TRIGGER IF EXISTS trg_audit_spatial_projects ON public.spatial_projects;
CREATE TRIGGER trg_audit_spatial_projects
AFTER INSERT OR UPDATE OR DELETE ON public.spatial_projects
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_vector_layers ON public.vector_layers;
CREATE TRIGGER trg_audit_vector_layers
AFTER INSERT OR UPDATE OR DELETE ON public.vector_layers
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_user_profiles ON public.user_profiles;
CREATE TRIGGER trg_audit_user_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_b2b_entitlements ON public.b2b_entitlements;
CREATE TRIGGER trg_audit_b2b_entitlements
AFTER INSERT OR UPDATE OR DELETE ON public.b2b_entitlements
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
