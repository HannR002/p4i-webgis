-- P4I Flood Risk Analysis v1
-- Review this migration in a non-production environment before applying it.
-- It is intentionally not executed by the application or import tooling.

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.administrative_boundaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_wilayah TEXT NOT NULL CHECK (char_length(kode_wilayah) BETWEEN 1 AND 32),
    level TEXT NOT NULL CHECK (level IN ('provinsi', 'kota', 'kecamatan')),
    parent_id UUID REFERENCES public.administrative_boundaries(id) ON DELETE RESTRICT,
    nama TEXT NOT NULL CHECK (char_length(nama) BETWEEN 1 AND 255),
    source TEXT NOT NULL CHECK (char_length(source) BETWEEN 1 AND 100),
    source_version TEXT NOT NULL CHECK (char_length(source_version) BETWEEN 1 AND 100),
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    geometry geometry(MultiPolygon, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT administrative_boundaries_source_code_unique
        UNIQUE (source, source_version, level, kode_wilayah),
    CONSTRAINT administrative_boundaries_parent_check
        CHECK (
            (level = 'provinsi' AND parent_id IS NULL)
            OR (level IN ('kota', 'kecamatan') AND parent_id IS NOT NULL)
        ),
    CONSTRAINT administrative_boundaries_geometry_valid
        CHECK (ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry))
);

CREATE INDEX IF NOT EXISTS administrative_boundaries_geometry_gist
    ON public.administrative_boundaries USING GIST (geometry);
CREATE INDEX IF NOT EXISTS administrative_boundaries_kode_idx
    ON public.administrative_boundaries (kode_wilayah);
CREATE INDEX IF NOT EXISTS administrative_boundaries_level_idx
    ON public.administrative_boundaries (level);
CREATE INDEX IF NOT EXISTS administrative_boundaries_parent_idx
    ON public.administrative_boundaries (parent_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS administrative_boundaries_set_updated_at
    ON public.administrative_boundaries;
CREATE TRIGGER administrative_boundaries_set_updated_at
BEFORE UPDATE ON public.administrative_boundaries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.flood_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key TEXT NOT NULL UNIQUE,
    kecamatan_id UUID NOT NULL REFERENCES public.administrative_boundaries(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    dataset_version TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    criteria_weights JSONB NOT NULL CHECK (jsonb_typeof(criteria_weights) = 'object'),
    criteria_breakdown JSONB NOT NULL CHECK (jsonb_typeof(criteria_breakdown) = 'object'),
    score NUMERIC(7, 4) NOT NULL CHECK (score BETWEEN 0 AND 100),
    classification TEXT NOT NULL CHECK (
        classification IN ('very_low', 'low', 'moderate', 'high', 'very_high')
    ),
    computed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT flood_analysis_period_check CHECK (period_start <= period_end),
    CONSTRAINT flood_analysis_expiry_check CHECK (expires_at > computed_at)
);

CREATE INDEX IF NOT EXISTS flood_analysis_results_lookup_idx
    ON public.flood_analysis_results (
        kecamatan_id,
        model_version,
        dataset_version,
        period_start,
        period_end
    );
CREATE INDEX IF NOT EXISTS flood_analysis_results_expiry_idx
    ON public.flood_analysis_results (expires_at);

-- Safe staging area. The import script writes here only; promotion is a
-- separate, explicit operation after row counts/geometries are reviewed.
CREATE TABLE IF NOT EXISTS public.administrative_boundaries_import_staging (
    id BIGSERIAL PRIMARY KEY,
    batch_id UUID NOT NULL,
    kode_wilayah TEXT NOT NULL,
    parent_kode_wilayah TEXT,
    level TEXT NOT NULL CHECK (level IN ('provinsi', 'kota', 'kecamatan')),
    nama TEXT NOT NULL,
    source TEXT NOT NULL,
    source_version TEXT NOT NULL,
    geometry geometry(Geometry, 4326) NOT NULL,
    raw_properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    staged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, level, kode_wilayah)
);

CREATE INDEX IF NOT EXISTS administrative_boundaries_staging_batch_idx
    ON public.administrative_boundaries_import_staging (batch_id);
CREATE INDEX IF NOT EXISTS administrative_boundaries_staging_geometry_gist
    ON public.administrative_boundaries_import_staging USING GIST (geometry);

CREATE OR REPLACE FUNCTION public.promote_administrative_boundary_import(p_batch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    promoted_count INTEGER := 0;
    level_count INTEGER;
    current_level TEXT;
BEGIN
    IF p_batch_id IS NULL THEN
        RAISE EXCEPTION 'batch_id is required';
    END IF;

    -- Import parents before children. A child row is promoted only when its
    -- referenced parent is already present in the canonical table.
    FOREACH current_level IN ARRAY ARRAY['provinsi', 'kota', 'kecamatan']
    LOOP
        INSERT INTO public.administrative_boundaries (
            kode_wilayah,
            level,
            parent_id,
            nama,
            source,
            source_version,
            geometry
        )
        SELECT
            staged.kode_wilayah,
            staged.level,
            parent.id,
            staged.nama,
            staged.source,
            staged.source_version,
            ST_Multi(
                ST_CollectionExtract(ST_MakeValid(staged.geometry), 3)
            )::geometry(MultiPolygon, 4326)
        FROM public.administrative_boundaries_import_staging AS staged
        LEFT JOIN public.administrative_boundaries AS parent
            ON parent.kode_wilayah = staged.parent_kode_wilayah
            AND parent.source = staged.source
            AND parent.source_version = staged.source_version
        WHERE staged.batch_id = p_batch_id
          AND staged.level = current_level
          AND (current_level = 'provinsi' OR parent.id IS NOT NULL)
          AND NOT ST_IsEmpty(ST_CollectionExtract(ST_MakeValid(staged.geometry), 3))
        ON CONFLICT (source, source_version, level, kode_wilayah)
        DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            nama = EXCLUDED.nama,
            geometry = EXCLUDED.geometry,
            updated_at = NOW();

        GET DIAGNOSTICS level_count = ROW_COUNT;
        promoted_count := promoted_count + level_count;
    END LOOP;

    RETURN promoted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_boundaries_in_view(
    p_west DOUBLE PRECISION,
    p_south DOUBLE PRECISION,
    p_east DOUBLE PRECISION,
    p_north DOUBLE PRECISION,
    p_level TEXT,
    p_tolerance DOUBLE PRECISION DEFAULT 0.001
)
RETURNS TABLE (
    id UUID,
    kode_wilayah TEXT,
    level TEXT,
    parent_id UUID,
    nama TEXT,
    source TEXT,
    source_version TEXT,
    geojson JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    viewport geometry;
    safe_tolerance DOUBLE PRECISION;
BEGIN
    IF p_level NOT IN ('provinsi', 'kota', 'kecamatan') THEN
        RAISE EXCEPTION 'invalid boundary level';
    END IF;
    IF p_west < -180 OR p_east > 180 OR p_south < -90 OR p_north > 90
       OR p_west >= p_east OR p_south >= p_north THEN
        RAISE EXCEPTION 'invalid viewport bounds';
    END IF;

    safe_tolerance := LEAST(GREATEST(COALESCE(p_tolerance, 0.001), 0), 0.05);
    viewport := ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326);

    RETURN QUERY
    SELECT
        boundary.id,
        boundary.kode_wilayah,
        boundary.level,
        boundary.parent_id,
        boundary.nama,
        boundary.source,
        boundary.source_version,
        ST_AsGeoJSON(
            ST_SimplifyPreserveTopology(boundary.geometry, safe_tolerance),
            6
        )::jsonb AS geojson
    FROM public.administrative_boundaries AS boundary
    WHERE boundary.is_public
      AND boundary.level = p_level
      AND boundary.geometry && viewport
      AND ST_Intersects(boundary.geometry, viewport)
    ORDER BY boundary.kode_wilayah
    LIMIT 1500;
END;
$$;

ALTER TABLE public.administrative_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flood_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_boundaries_import_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published boundaries"
    ON public.administrative_boundaries;
CREATE POLICY "Public can read published boundaries"
ON public.administrative_boundaries
FOR SELECT
TO anon, authenticated
USING (is_public = TRUE);

DROP POLICY IF EXISTS "Admins can read flood analysis results"
    ON public.flood_analysis_results;
CREATE POLICY "Admins can read flood analysis results"
ON public.flood_analysis_results
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'managerial_analyst')
          AND COALESCE(is_disabled, FALSE) = FALSE
    )
);

-- Direct table access is deliberately withheld from browser roles so clients
-- cannot fetch every Indonesian polygon. Public viewport access goes through
-- the bounded/simplified RPC above. The service role bypasses RLS server-side.
REVOKE ALL ON public.administrative_boundaries FROM anon, authenticated;
REVOKE ALL ON public.flood_analysis_results FROM anon, authenticated;
REVOKE ALL ON public.administrative_boundaries_import_staging FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_administrative_boundary_import(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_boundaries_in_view(
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    TEXT,
    DOUBLE PRECISION
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_boundaries_in_view(
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    TEXT,
    DOUBLE PRECISION
) TO anon, authenticated;
GRANT ALL ON public.administrative_boundaries TO service_role;
GRANT ALL ON public.flood_analysis_results TO service_role;
GRANT ALL ON public.administrative_boundaries_import_staging TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.administrative_boundaries_import_staging_id_seq
    TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_administrative_boundary_import(UUID)
    TO service_role;

COMMIT;
