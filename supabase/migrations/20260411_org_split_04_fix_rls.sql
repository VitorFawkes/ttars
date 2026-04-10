-- Fix: org_members RLS tinha infinite recursion
-- A policy org_members_admin_all referenciava org_members dentro de si mesma.
-- Solução: usar function SECURITY DEFINER para verificar admin status sem RLS.

-- 1. Helper function que bypassa RLS
CREATE OR REPLACE FUNCTION is_org_admin(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_members
        WHERE user_id = p_user_id
          AND org_id = p_org_id
          AND role = 'admin'
    );
$$;

-- 2. Dropar policy com recursion
DROP POLICY IF EXISTS "org_members_admin_all" ON org_members;

-- 3. Recriar sem recursion (usa a function SECURITY DEFINER)
CREATE POLICY "org_members_admin_all" ON org_members
    FOR ALL TO authenticated
    USING (is_org_admin(auth.uid(), org_id));
