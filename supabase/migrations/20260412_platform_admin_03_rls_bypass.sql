-- Platform Admin Fase 1: RLS bypass seletivo
-- - organizations SELECT: platform_admin vê todas
-- - profiles SELECT: platform_admin vê todas (para browser cross-org)
-- - platform_audit_log: policies dedicadas
--
-- CUIDADO: bypass NÃO é adicionado em cards/contatos/tarefas.
-- Acesso a dados de cliente para suporte passa por impersonate auditado
-- (platform-impersonate edge function), não por RLS aberta.
--
-- ROLLBACK: restaurar policies da migration 20260411_org_split_05 e _06.

-- 1. organizations: bypass para platform admin
DROP POLICY IF EXISTS "organizations_own_select" ON organizations;

CREATE POLICY "organizations_own_select" ON organizations
    FOR SELECT TO authenticated
    USING (
        id = requesting_org_id()
        OR id IN (
            SELECT om.org_id FROM org_members om
            WHERE om.user_id = auth.uid()
        )
        OR is_platform_admin()
    );

-- Platform admin também UPDATE organizations (suspender, editar metadados)
DROP POLICY IF EXISTS "organizations_platform_admin_update" ON organizations;

CREATE POLICY "organizations_platform_admin_update" ON organizations
    FOR UPDATE TO authenticated
    USING (is_platform_admin())
    WITH CHECK (is_platform_admin());

-- Platform admin INSERT (provisionamento via RPC também usa service_role,
-- mas deixamos a policy consistente)
DROP POLICY IF EXISTS "organizations_platform_admin_insert" ON organizations;

CREATE POLICY "organizations_platform_admin_insert" ON organizations
    FOR INSERT TO authenticated
    WITH CHECK (is_platform_admin());

-- 2. profiles: bypass SELECT para platform admin
DROP POLICY IF EXISTS "profiles_org_select" ON profiles;

CREATE POLICY "profiles_org_select" ON profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR org_id = requesting_org_id()
        OR is_platform_admin()
    );

-- profiles.is_platform_admin só pode ser alterado por outro platform_admin
-- (evita escalação de privilégio via self-update)
DROP POLICY IF EXISTS "profiles_platform_admin_manage" ON profiles;

CREATE POLICY "profiles_platform_admin_manage" ON profiles
    FOR UPDATE TO authenticated
    USING (is_platform_admin())
    WITH CHECK (is_platform_admin());

-- 3. platform_audit_log policies
DROP POLICY IF EXISTS "platform_audit_log_select" ON platform_audit_log;

CREATE POLICY "platform_audit_log_select" ON platform_audit_log
    FOR SELECT TO authenticated
    USING (is_platform_admin());

DROP POLICY IF EXISTS "platform_audit_log_insert" ON platform_audit_log;

CREATE POLICY "platform_audit_log_insert" ON platform_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (
        is_platform_admin()
        AND actor_id = auth.uid()
    );

-- Nunca permitir UPDATE/DELETE no audit log (imutável)
-- (ausência de policies + RLS habilitada = acesso negado)
