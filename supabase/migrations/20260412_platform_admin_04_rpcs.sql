-- Platform Admin Fase 2: RPCs SECURITY DEFINER
-- Expõem dados cross-org apenas para platform_admins.
-- RLS de cards/tarefas NÃO foi afrouxada — estas RPCs são a única forma
-- de ler agregados cross-org, e todas verificam is_platform_admin() no início.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.platform_log_action(TEXT, TEXT, UUID, JSONB);
--   DROP FUNCTION IF EXISTS public.platform_get_stats();
--   DROP FUNCTION IF EXISTS public.platform_list_organizations();
--   DROP FUNCTION IF EXISTS public.platform_get_organization(UUID);
--   DROP FUNCTION IF EXISTS public.platform_suspend_organization(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.platform_resume_organization(UUID);

-- ============================================================================
-- Helper: registrar ação no audit log
-- ============================================================================
CREATE OR REPLACE FUNCTION public.platform_log_action(
    p_action TEXT,
    p_target_type TEXT,
    p_target_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_metadata)
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_log_action(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ============================================================================
-- platform_get_stats: KPIs globais do SaaS
-- ============================================================================
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
        'cards_open',        (SELECT COUNT(*) FROM cards WHERE status IS DISTINCT FROM 'ganho' AND status IS DISTINCT FROM 'perdido'),
        'cards_new_30d',     (SELECT COUNT(*) FROM cards WHERE created_at >= now() - interval '30 days')
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_get_stats() TO authenticated;

-- ============================================================================
-- platform_list_organizations: lista com KPIs agregados por org
-- ============================================================================
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
          WHERE c.org_id = o.id
            AND c.status IS DISTINCT FROM 'ganho'
            AND c.status IS DISTINCT FROM 'perdido') AS open_card_count,
        (SELECT MAX(c.updated_at) FROM cards c WHERE c.org_id = o.id) AS last_activity
    FROM organizations o
    ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_organizations() TO authenticated;

-- ============================================================================
-- platform_get_organization: detalhe completo de uma org
-- ============================================================================
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
            'cards_open',    (SELECT COUNT(*) FROM cards WHERE org_id = p_org_id
                                AND status IS DISTINCT FROM 'ganho'
                                AND status IS DISTINCT FROM 'perdido'),
            'cards_won',     (SELECT COUNT(*) FROM cards WHERE org_id = p_org_id AND status = 'ganho'),
            'cards_lost',    (SELECT COUNT(*) FROM cards WHERE org_id = p_org_id AND status = 'perdido'),
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

GRANT EXECUTE ON FUNCTION public.platform_get_organization(UUID) TO authenticated;

-- ============================================================================
-- platform_suspend_organization / platform_resume_organization
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
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    UPDATE organizations
    SET status = 'suspended',
        suspended_at = now(),
        suspended_reason = p_reason,
        active = FALSE
    WHERE id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'organization not found: %', p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'org.suspend', 'organization', p_org_id,
            jsonb_build_object('reason', p_reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_suspend_organization(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_resume_organization(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    UPDATE organizations
    SET status = 'active',
        suspended_at = NULL,
        suspended_reason = NULL,
        active = TRUE
    WHERE id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'organization not found: %', p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'org.resume', 'organization', p_org_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_resume_organization(UUID) TO authenticated;

-- ============================================================================
-- platform_set_admin: promove/revoga platform_admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.platform_set_admin(
    p_user_id UUID,
    p_is_admin BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_count INTEGER;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    -- Evitar ficar sem nenhum platform_admin (trava o sistema)
    IF p_is_admin = FALSE THEN
        SELECT COUNT(*) INTO v_current_count FROM profiles WHERE is_platform_admin = TRUE;
        IF v_current_count <= 1 THEN
            RAISE EXCEPTION 'cannot revoke last platform admin';
        END IF;
    END IF;

    UPDATE profiles
    SET is_platform_admin = p_is_admin
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile not found: %', p_user_id
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(),
            CASE WHEN p_is_admin THEN 'platform.promote' ELSE 'platform.revoke' END,
            'profile', p_user_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_admin(UUID, BOOLEAN) TO authenticated;
