-- =========================================================================
-- RPC: platform_set_admin_workspaces
-- Permite que platform admin escolha quais workspaces da account um admin
-- enxerga. Substitui o ajuste manual em org_members.
--
-- Comportamento:
--   - So platform admin pode chamar.
--   - p_user_id deve ser admin (is_admin=true) - cross-workspace e privilegio
--     de admin; nao faz sentido pra usuario comum.
--   - p_workspace_ids: lista exata de orgs (account ou workspaces filhos)
--     em que o user deve ter membership. Sync = insere faltantes + remove
--     extras (dentro da arvore da account). Memberships em orgs fora da
--     arvore nao sao tocadas (defesa contra escopo cross-tenant).
--   - Audit log em platform_audit_log.
-- =========================================================================

SET search_path = public;

CREATE OR REPLACE FUNCTION public.platform_set_admin_workspaces(
    p_user_id UUID,
    p_workspace_ids UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_account_id UUID;
    v_user_is_admin BOOLEAN;
    v_user_email TEXT;
    v_valid_ids UUID[];
    v_added INT := 0;
    v_removed INT := 0;
BEGIN
    IF NOT is_platform_admin() THEN
        RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
    END IF;

    -- Resolver account-mae do user-alvo + checar que e admin
    SELECT COALESCE(o.parent_org_id, o.id), p.is_admin, p.email
    INTO v_account_id, v_user_is_admin, v_user_email
    FROM profiles p
    JOIN organizations o ON o.id = p.org_id
    WHERE p.id = p_user_id;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Usuario nao encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_user_is_admin THEN
        RAISE EXCEPTION 'Usuario nao e admin. Marque is_admin=true antes de gerenciar workspaces.'
            USING ERRCODE = '42501';
    END IF;

    -- Validar que p_workspace_ids estao na arvore da account.
    -- Filtra fora qualquer id que nao pertenca (defesa cross-tenant).
    SELECT COALESCE(array_agg(o.id), ARRAY[]::UUID[])
    INTO v_valid_ids
    FROM organizations o
    WHERE o.id = ANY(p_workspace_ids)
      AND (o.id = v_account_id OR o.parent_org_id = v_account_id);

    -- INSERT memberships faltantes (role=admin)
    WITH inserted AS (
        INSERT INTO org_members (user_id, org_id, role, is_default)
        SELECT p_user_id, wid, 'admin', false
        FROM unnest(v_valid_ids) AS wid
        ON CONFLICT (user_id, org_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_added FROM inserted;

    -- DELETE memberships na arvore da account que nao estao em v_valid_ids
    WITH deleted AS (
        DELETE FROM org_members om
        USING organizations o
        WHERE om.user_id = p_user_id
          AND om.org_id = o.id
          AND (o.id = v_account_id OR o.parent_org_id = v_account_id)
          AND om.org_id <> ALL(v_valid_ids)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_removed FROM deleted;

    -- Audit log
    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
        v_actor,
        'admin.workspaces.set',
        'profile',
        p_user_id,
        jsonb_build_object(
            'target_email', v_user_email,
            'account_id', v_account_id,
            'requested_workspace_ids', to_jsonb(p_workspace_ids),
            'valid_workspace_ids', to_jsonb(v_valid_ids),
            'added', v_added,
            'removed', v_removed
        )
    );

    RETURN json_build_object(
        'success', true,
        'added', v_added,
        'removed', v_removed,
        'workspace_ids', v_valid_ids
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_admin_workspaces(UUID, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.platform_set_admin_workspaces IS
    'Platform admin define exatamente quais workspaces (incluindo a account) '
    'um admin enxerga. Insere faltantes, remove extras dentro da arvore da account.';

-- =========================================================================
-- RPC complementar: listar membership atual de um user na arvore de account
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_get_admin_workspaces(
    p_user_id UUID
)
RETURNS TABLE (
    org_id UUID,
    org_name TEXT,
    is_account BOOLEAN,
    is_member BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id UUID;
BEGIN
    IF NOT is_platform_admin() THEN
        RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(o.parent_org_id, o.id)
    INTO v_account_id
    FROM profiles p
    JOIN organizations o ON o.id = p.org_id
    WHERE p.id = p_user_id;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Usuario nao encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    RETURN QUERY
    SELECT
        o.id AS org_id,
        o.name AS org_name,
        (o.parent_org_id IS NULL) AS is_account,
        EXISTS(
            SELECT 1 FROM org_members om
            WHERE om.user_id = p_user_id AND om.org_id = o.id
        ) AS is_member
    FROM organizations o
    WHERE o.id = v_account_id OR o.parent_org_id = v_account_id
    ORDER BY (o.parent_org_id IS NULL) DESC, o.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_get_admin_workspaces(UUID) TO authenticated;

COMMENT ON FUNCTION public.platform_get_admin_workspaces IS
    'Retorna account + workspaces filhos com flag is_member indicando onde o '
    'user ja tem membership. Usado pra renderizar checkboxes no EditUserModal.';
