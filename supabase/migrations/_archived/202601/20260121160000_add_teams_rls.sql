-- =============================================================================
-- Migration: Add RLS Policies for Teams Table
-- Purpose: Allow authenticated users to read teams and admins to manage them
-- =============================================================================

-- Enable RLS on teams table (if not already enabled)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can read teams" ON public.teams;
DROP POLICY IF EXISTS "Admins can manage teams" ON public.teams;

-- 1. Anyone authenticated can read teams
CREATE POLICY "Authenticated users can read teams" ON public.teams
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. Admins can insert, update, delete teams
CREATE POLICY "Admins can manage teams" ON public.teams
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Grant permissions
GRANT SELECT ON public.teams TO authenticated;
GRANT ALL ON public.teams TO authenticated;

-- Add comment for documentation
COMMENT ON POLICY "Authenticated users can read teams" ON public.teams IS 'Allow all authenticated users to view teams';
COMMENT ON POLICY "Admins can manage teams" ON public.teams IS 'Only admins can create, update, or delete teams';
