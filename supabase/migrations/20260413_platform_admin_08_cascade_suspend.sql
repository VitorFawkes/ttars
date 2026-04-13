-- Platform Admin: Cascade suspend/resume para tenant + workspaces filhas
--
-- PROBLEMA: platform_suspend_organization(tenant_id) só muda status no tenant,
-- deixando workspaces filhas ativas. Mesmo após suspend do tenant, usuários
-- logados nas workspaces conseguem acessar tudo (RLS usa org_id + status).
--
-- FIX:
--   1. Detectar se org é tenant (parent_org_id IS NULL) ou workspace
--   2. Se tenant: UPDATE status em TODAS as orgs onde id = p_org_id OR parent_org_id = p_org_id
--   3. Se workspace: UPDATE só na própria (operação pontual)
--   4. Audit log: gravar lista de UUIDs afetadas em metadata
--   5. Adicionar função is_org_active() que checa status + status do pai (pra RLS se necessário)

-- ============================================================================
-- 1. Helper: verificar se organização está ativa (considera parent_org_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_org_active(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_parent_id UUID;
    v_parent_status TEXT;
BEGIN
    -- Pegar status da org e seu parent (se existir)
    SELECT status, parent_org_id INTO v_status, v_parent_id
    FROM organizations
    WHERE id = p_org_id;

    IF v_status IS NULL THEN
        RETURN FALSE; -- Org não existe
    END IF;

    IF v_status != 'active' THEN
        RETURN FALSE; -- Org suspensa ou arquivada
    END IF;

    -- Se tem parent (é workspace), verificar status do pai
    IF v_parent_id IS NOT NULL THEN
        SELECT status INTO v_parent_status
        FROM organizations
        WHERE id = v_parent_id;

        RETURN v_parent_status = 'active';
    END IF;

    -- Tenant ativo e sem pai: ativo
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_org_active(UUID) TO authenticated;

-- ============================================================================
-- 2. UPDATE: platform_suspend_organization com cascade
-- ============================================================================
CREATE OR REPLACE FUNCTION public.platform_suspend_organization(
    p_org_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_tenant BOOLEAN;
    v_affected_ids UUID[];
    v_count INT;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    -- Verificar se existe a org
    IF NOT EXISTS(SELECT 1 FROM organizations WHERE id = p_org_id) THEN
        RAISE EXCEPTION 'organization not found: %', p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Detectar se é tenant (parent_org_id IS NULL)
    v_is_tenant := (SELECT parent_org_id IS NULL FROM organizations WHERE id = p_org_id);

    -- Determinar quais orgs vão ser afetadas
    IF v_is_tenant THEN
        -- Tenant: suspender o próprio + todas as workspaces filhas
        v_affected_ids := ARRAY(
            SELECT id FROM organizations
            WHERE id = p_org_id OR parent_org_id = p_org_id
        );
    ELSE
        -- Workspace: suspender só a si mesma
        v_affected_ids := ARRAY[p_org_id];
    END IF;

    -- Aplicar suspend a todas as orgs no escopo
    UPDATE organizations
    SET status = 'suspended',
        suspended_at = now(),
        suspended_reason = p_reason,
        active = FALSE
    WHERE id = ANY(v_affected_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Audit log: gravar com lista de UUIDs afetadas
    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
        auth.uid(),
        'org.suspend',
        'organization',
        p_org_id,
        jsonb_build_object(
            'reason', p_reason,
            'is_tenant', v_is_tenant,
            'affected_ids', v_affected_ids,
            'affected_count', v_count
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_suspend_organization(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 3. UPDATE: platform_resume_organization com cascade
-- ============================================================================
CREATE OR REPLACE FUNCTION public.platform_resume_organization(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_tenant BOOLEAN;
    v_affected_ids UUID[];
    v_count INT;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    -- Verificar se existe a org
    IF NOT EXISTS(SELECT 1 FROM organizations WHERE id = p_org_id) THEN
        RAISE EXCEPTION 'organization not found: %', p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Detectar se é tenant
    v_is_tenant := (SELECT parent_org_id IS NULL FROM organizations WHERE id = p_org_id);

    -- Determinar quais orgs vão ser afetadas
    IF v_is_tenant THEN
        -- Tenant: reativar o próprio + todas as workspaces filhas
        v_affected_ids := ARRAY(
            SELECT id FROM organizations
            WHERE id = p_org_id OR parent_org_id = p_org_id
        );
    ELSE
        -- Workspace: reativar só a si mesma
        v_affected_ids := ARRAY[p_org_id];
    END IF;

    -- Aplicar resume a todas as orgs no escopo
    UPDATE organizations
    SET status = 'active',
        suspended_at = NULL,
        suspended_reason = NULL,
        active = TRUE
    WHERE id = ANY(v_affected_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Audit log
    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
        auth.uid(),
        'org.resume',
        'organization',
        p_org_id,
        jsonb_build_object(
            'is_tenant', v_is_tenant,
            'affected_ids', v_affected_ids,
            'affected_count', v_count
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_resume_organization(UUID) TO authenticated;
