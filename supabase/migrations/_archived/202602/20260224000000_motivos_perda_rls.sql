-- =============================================================================
-- Migration: Add RLS Policies for motivos_perda Table
-- Purpose: Allow authenticated users to read and admins to manage loss reasons
-- =============================================================================

ALTER TABLE public.motivos_perda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read motivos_perda" ON public.motivos_perda;
DROP POLICY IF EXISTS "Admins can manage motivos_perda" ON public.motivos_perda;

-- All authenticated users can read (needed for LossReasonModal dropdown)
CREATE POLICY "Authenticated users can read motivos_perda" ON public.motivos_perda
    FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can create, update, or delete
CREATE POLICY "Admins can manage motivos_perda" ON public.motivos_perda
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
