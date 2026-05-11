-- Platform Admin Fase 2 fix: coluna correta é cards.status_comercial (não status)
-- Bug introduzido em 20260412_platform_admin_04_rpcs.sql.
-- Recria as RPCs afetadas: platform_get_stats, platform_list_organizations,
-- platform_get_organization.
--
-- ROLLBACK: reaplicar 20260412_platform_admin_04_rpcs.sql (mas quebrado).

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
        'orgs_total',        (SELECT COUNT(*) FROM organizations),
        'orgs_active',       (SELECT COUNT(*) FROM organizations WHERE status = 'active'),
        'orgs_suspended',    (SELECT COUNT(*) FROM organizations WHERE status = 'suspended'),
        'orgs_archived',     (SELECT COUNT(*) FROM organizations WHERE status = 'archived'),
        'orgs_new_30d',      (SELECT COUNT(*) FROM organizations WHERE created_at >= now() - interval '30 days'),
        'users_total',       (SELECT COUNT(*) FROM profiles),
        'users_active_30d',  (SELECT COUNT(DISTINCT id) FROM profiles WHERE updated_at >= now() - interval '30 days'),
        'cards_total',       (SELECT COUNT(*) FROM cards),
        'cards_open',        (SELECT COUNT(*) FROM cards WHERE status_comercial = 'aberto'),
        'cards_new_30d',     (SELECT COUNT(*) FROM cards WHERE created_at >= now() - interval '30 days')
    ) INTO v_result;

    RETURN v_result;
END;
$$;

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
    SELECT
        o.id,
        o.name,
        o.slug,
        o.status,
        o.active,
        o.created_at,
        o.suspended_at,
        o.suspended_reason,
        o.logo_url,
        (SELECT COUNT(*) FROM profiles p WHERE p.org_id = o.id) AS user_count,
        (SELECT COUNT(*) FROM cards c WHERE c.org_id = o.id) AS card_count,
        (SELECT COUNT(*) FROM cards c
          WHERE c.org_id = o.id AND c.status_comercial = 'aberto') AS open_card_count,
        (SELECT MAX(c.updated_at) FROM cards c WHERE c.org_id = o.id) AS last_activity
    FROM organizations o
    ORDER BY o.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_get_organization(p_org_id UUID)
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
        'organization', to_jsonb(o.*),
        'stats', jsonb_build_object(
            'users',         (SELECT COUNT(*) FROM profiles WHERE org_id = p_org_id),
            'cards_total',   (SELECT COUNT(*) FROM cards WHERE org_id = p_org_id),
            'cards_open',    (SELECT COUNT(*) FROM cards WHERE org_id = p_org_id AND status_comercial = 'aberto'),
            'cards_won',     (SELECT COUNT(*) FROM cards WHERE org_id = p_org_id AND status_comercial = 'ganho'),
            'cards_lost',    (SELECT COUNT(*) FROM cards WHERE org_id = p_org_id AND status_comercial = 'perdido'),
            'last_card_activity', (SELECT MAX(updated_at) FROM cards WHERE org_id = p_org_id)
        ),
        'admins', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', p.id,
                'email', p.email,
                'nome', p.nome,
                'is_platform_admin', p.is_platform_admin
            ))
            FROM profiles p
            WHERE p.org_id = p_org_id AND p.is_admin = TRUE
        ), '[]'::jsonb),
        'products', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', pr.id,
                'name', pr.name,
                'slug', pr.slug,
                'pipeline_id', pr.pipeline_id
            ))
            FROM products pr
            WHERE pr.org_id = p_org_id
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
            WHERE al.target_type = 'organization' AND al.target_id = p_org_id
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
