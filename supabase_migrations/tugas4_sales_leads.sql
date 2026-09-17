-- TUGAS 4: Migrasi Skema Sales Leads

CREATE TABLE IF NOT EXISTS public.sales_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    institution VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(50),
    requested_project_id UUID REFERENCES public.spatial_projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'NEW'
);

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
-- No public policies needed, inserted via backend API with Service Role.
