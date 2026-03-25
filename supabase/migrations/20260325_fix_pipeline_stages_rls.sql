-- Fix RLS policy on pipeline_stages to use is_admin instead of role = 'admin'
-- The old policy used profiles.role = 'admin'::app_role which may fail in some contexts
-- The project standard is profiles.is_admin = true

BEGIN;

-- Drop old policies
DROP POLICY IF EXISTS "Admin full access" ON pipeline_stages;
DROP POLICY IF EXISTS "Etapas viewable by authenticated" ON pipeline_stages;

-- Recreate with is_admin check
CREATE POLICY "Admin full access" ON pipeline_stages
  FOR ALL
  USING (
    (SELECT auth.uid()) IN (
      SELECT id FROM public.profiles WHERE is_admin = true
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) IN (
      SELECT id FROM public.profiles WHERE is_admin = true
    )
  );

CREATE POLICY "Etapas viewable by authenticated" ON pipeline_stages
  FOR SELECT
  USING (auth.role() = 'authenticated');

COMMIT;
