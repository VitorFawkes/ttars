-- Platform Admin: distinguir TENANTS (clientes do SaaS) de WORKSPACES
-- organizations.parent_org_id já existe e identifica workspaces:
--   parent_org_id IS NULL → tenant (cliente do SaaS)
--   parent_org_id IS NOT NULL → workspace dentro de um tenant
--
-- Ajusta RPCs para mostrar só tenants na lista do platform admin, com
-- stats agregadas (somando workspaces filhas). Detalhe inclui workspaces.
--
-- ROLLBACK: reaplicar 20260412_platform_admin_06_fix_status_column.sql
-- (que tem a versão sem filtro de parent_org_id).

-- Stats: contar só tenants (não inflar total com workspaces)
CREATE OR REPLACE FUNCTION public.platform_get_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'orgs_total',        (SELECT COUNT(*) FROM organizations WHERE parent_org_id IS NULL),
        'orgs_active',       (SELECT COUNT(*) FROM organizations WHERE parent_org_id IS NULL AND status = 'active'),
        'orgs_suspended',    (SELECT COUNT(*) FROM organizations WHERE parent_org_id IS NULL AND status = 'suspended'),
        'orgs_archived',     (SELECT COUNT(*) FROM organizations WHERE parent_org_id IS NULL AND status = 'archived'),
        'orgs_new_30d',      (SELECT COUNT(*) FROM organizations WHERE parent_org_id IS NULL AND created_at >= now() - interval '30 days'),
        'workspaces_total',  (SELECT COUNT(*) FROM organizations WHERE parent_org_id IS NOT NULL),
        'users_total',       (SELECT COUNT(*) FROM profiles),
        'users_active_30d',  (SELECT COUNT(DISTINCT id) FROM profiles WHERE updated_at >= now() - interval '30 days'),
        'cards_total',       (SELECT COUNT(*) FROM cards),
        'cards_open',        (SELECT COUNT(*) FROM cards WHERE status_comercial = 'aberto'),
        'cards_new_30d',     (SELECT COUNT(*) FROM cards WHERE created_at >= now() - interval '30 days')
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Lista: só tenants (parent_org_id IS NULL), com stats agregadas incluindo workspaces filhas
-- DROP necessário: assinatura de retorno mudou (nova coluna workspace_count)
DROP FUNCTION IF EXISTS public.platform_list_organizations();

CREATE OR REPLACE FUNCTION public.platform_list_organizations()
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    status TEXT,
    active BOOLEAN,
    created_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    suspended_reason TEXT,
    logo_url TEXT,
    workspace_count BIGINT,
    user_count BIGINT,
    card_count BIGINT,
    open_card_count BIGINT,
    last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH tenant_scope AS (
        -- Para cada tenant, IDs incluem o próprio + workspaces filhas
        SELECT o.id AS tenant_id, o.id AS scope_id FROM organizations o WHERE o.parent_org_id IS NULL
        UNION ALL
        SELECT o.parent_org_id AS tenant_id, o.id AS scope_id FROM organizations o WHERE o.parent_org_id IS NOT NULL
    )
    SELECT
        t.id,
        t.name,
        t.slug,
        t.status,
        t.active,
        t.created_at,
        t.suspended_at,
        t.suspended_reason,
        t.logo_url,
        (SELECT COUNT(*) FROM organizations ws WHERE ws.parent_org_id = t.id) AS workspace_count,
        (SELECT COUNT(*) FROM profiles p WHERE p.org_id IN (SELECT scope_id FROM tenant_scope WHERE tenant_id = t.id)) AS user_count,
        (SELECT COUNT(*) FROM cards c WHERE c.org_id IN (SELECT scope_id FROM tenant_scope WHERE tenant_id = t.id)) AS card_count,
        (SELECT COUNT(*) FROM cards c
          WHERE c.org_id IN (SELECT scope_id FROM tenant_scope WHERE tenant_id = t.id)
            AND c.status_comercial = 'aberto') AS open_card_count,
        (SELECT MAX(c.updated_at) FROM cards c WHERE c.org_id IN (SELECT scope_id FROM tenant_scope WHERE tenant_id = t.id)) AS last_activity
    FROM organizations t
    WHERE t.parent_org_id IS NULL
    ORDER BY t.created_at DESC;
END;
$$;

-- Detalhe: incluir workspaces filhas + stats agregadas + lista de admins/users cross-workspace
CREATE OR REPLACE FUNCTION public.platform_get_organization(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result  JSONB;
    v_scope_ids UUID[];
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    -- IDs do escopo: o próprio + workspaces filhas (se for tenant)
    SELECT array_agg(id) INTO v_scope_ids FROM (
        SELECT p_org_id AS id
        UNION
        SELECT id FROM organizations WHERE parent_org_id = p_org_id
    ) s;

    SELECT jsonb_build_object(
        'organization', to_jsonb(o.*),
        'parent', CASE
            WHEN o.parent_org_id IS NOT NULL THEN
                (SELECT to_jsonb(po.*) FROM organizations po WHERE po.id = o.parent_org_id)
            ELSE NULL
        END,
        'workspaces', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', w.id,
                'name', w.name,
                'slug', w.slug,
                'status', w.status,
                'created_at', w.created_at,
                'user_count', (SELECT COUNT(*) FROM profiles WHERE org_id = w.id),
                'card_count', (SELECT COUNT(*) FROM cards WHERE org_id = w.id),
                'open_card_count', (SELECT COUNT(*) FROM cards WHERE org_id = w.id AND status_comercial = 'aberto')
            ))
            FROM organizations w
            WHERE w.parent_org_id = p_org_id
        ), '[]'::jsonb),
        'stats', jsonb_build_object(
            'users',         (SELECT COUNT(*) FROM profiles WHERE org_id = ANY(v_scope_ids)),
            'cards_total',   (SELECT COUNT(*) FROM cards WHERE org_id = ANY(v_scope_ids)),
            'cards_open',    (SELECT COUNT(*) FROM cards WHERE org_id = ANY(v_scope_ids) AND status_comercial = 'aberto'),
            'cards_won',     (SELECT COUNT(*) FROM cards WHERE org_id = ANY(v_scope_ids) AND status_comercial = 'ganho'),
            'cards_lost',    (SELECT COUNT(*) FROM cards WHERE org_id = ANY(v_scope_ids) AND status_comercial = 'perdido'),
            'last_card_activity', (SELECT MAX(updated_at) FROM cards WHERE org_id = ANY(v_scope_ids))
        ),
        'admins', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', p.id,
                'email', p.email,
                'nome', p.nome,
                'org_id', p.org_id,
                'is_platform_admin', p.is_platform_admin
            ))
            FROM profiles p
            WHERE p.org_id = ANY(v_scope_ids) AND p.is_admin = TRUE
        ), '[]'::jsonb),
        'products', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', pr.id,
                'name', pr.name,
                'slug', pr.slug,
                'pipeline_id', pr.pipeline_id,
                'org_id', pr.org_id
            ))
            FROM products pr
            WHERE pr.org_id = ANY(v_scope_ids)
        ), '[]'::jsonb),
        'recent_audit', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', al.id,
                'action', al.action,
                'actor_id', al.actor_id,
                'actor_email', (SELECT email FROM profiles WHERE id = al.actor_id),
                'metadata', al.metadata,
                'created_at', al.created_at
            ) ORDER BY al.created_at DESC)
            FROM platform_audit_log al
            WHERE al.target_type = 'organization' AND al.target_id = ANY(v_scope_ids)
            LIMIT 20
        ), '[]'::jsonb)
    ) INTO v_result
    FROM organizations o
    WHERE o.id = p_org_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'organization not found: %', p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_result;
END;
$$;
