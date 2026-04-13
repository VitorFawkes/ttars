-- Platform Admin: platform_invite_admin()
--
-- Convida novo admin em organização existente (tenant ou workspace).
-- Cria row em invitations com token de 7 dias.

CREATE OR REPLACE FUNCTION public.platform_invite_admin(
    p_org_id UUID,
    p_email TEXT,
    p_role TEXT DEFAULT 'admin'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation_id UUID;
    v_org_name TEXT;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    -- Validar org existe
    IF NOT EXISTS(SELECT 1 FROM organizations WHERE id = p_org_id) THEN
        RAISE EXCEPTION 'organization not found: %', p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Validar role existe (simples validação, roles criadas via provision)
    IF p_role NOT IN ('admin', 'sales', 'support') THEN
        RAISE EXCEPTION 'invalid role: %', p_role;
    END IF;

    -- Pegar nome da org pra audit log
    SELECT name INTO v_org_name FROM organizations WHERE id = p_org_id;

    -- Criar convite
    INSERT INTO invitations (email, role, token, expires_at, org_id)
    VALUES (
        p_email, p_role, encode(gen_random_bytes(32), 'hex'),
        now() + interval '7 days', p_org_id
    )
    RETURNING id INTO v_invitation_id;

    -- Audit log
    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
        auth.uid(),
        'admin.invite',
        'organization',
        p_org_id,
        jsonb_build_object(
            'invitation_id', v_invitation_id,
            'invited_email', p_email,
            'role', p_role,
            'org_name', v_org_name,
            'expires_at', now() + interval '7 days'
        )
    );

    RETURN v_invitation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_invite_admin(UUID, TEXT, TEXT) TO authenticated;
