-- Fix: organizations RLS bloqueava JOINs do OrgSwitcher
--
-- Problema: organizations_own_select usa id = requesting_org_id()
-- Quando o JWT tem org_id = Welcome Trips, o usuário não vê
-- Welcome Weddings nem Welcome Group — mesmo sendo membro.
--
-- Solução: Permitir ver orgs onde o usuário tem membership em org_members
-- OU a org atual do JWT (fallback para quem ainda não tem org_members).

DROP POLICY IF EXISTS "organizations_own_select" ON organizations;

CREATE POLICY "organizations_own_select" ON organizations
    FOR SELECT TO authenticated
    USING (
        id = requesting_org_id()
        OR id IN (
            SELECT om.org_id FROM org_members om
            WHERE om.user_id = auth.uid()
        )
    );
