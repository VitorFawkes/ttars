-- =========================================================================
-- RPCs: get_member_workspaces / set_member_workspaces
--
-- Permitem que um ADMIN DA CONTA (não só platform admin) conceda a QUALQUER
-- usuário (inclusive membros não-admin) acesso a múltiplos workspaces/produtos
-- da própria empresa, pela tela "Editar Usuário".
--
-- Diferença para platform_set_admin_workspaces (mantida intacta):
--   - Autoriza admin da árvore da conta, além de platform admin.
--   - Funciona para usuário-alvo não-admin (membro comum).
--   - Lista/gerencia apenas WORKSPACES FILHOS (cada um = 1 produto), nunca a
--     account em si.
--   - Preserva roles existentes (ON CONFLICT DO NOTHING).
--   - Mantém invariantes de não-quebra: ≥1 workspace, exatamente 1 is_default,
--     active_org_id sempre apontando para org onde o user é membro.
--   - Sincroniza profiles.produtos com os produtos dos workspaces liberados
--     (consumido por OwnerSelector para filtrar responsáveis por produto).
-- =========================================================================

SET search_path = public;

-- Helper de autorização: caller é platform admin OU é admin (role='admin' em
-- org_members) de alguma org na árvore da conta informada.
CREATE OR REPLACE FUNCTION public.can_manage_account_members(p_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_platform_admin()
        OR EXISTS (
            SELECT 1
            FROM org_members om
            JOIN organizations o ON o.id = om.org_id
            WHERE om.user_id = auth.uid()
              AND om.role = 'admin'
              AND (o.id = p_account_id OR o.parent_org_id = p_account_id)
        );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_account_members(UUID) TO authenticated;

-- -------------------------------------------------------------------------
-- get_member_workspaces: lista os workspaces filhos da conta do alvo,
-- marcando onde o user já é membro. Usado para renderizar os checkboxes.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_member_workspaces(
    p_user_id UUID
)
RETURNS TABLE (
    org_id UUID,
    org_name TEXT,
    is_member BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id UUID;
BEGIN
    SELECT COALESCE(o.parent_org_id, o.id)
    INTO v_account_id
    FROM profiles p
    JOIN organizations o ON o.id = p.org_id
    WHERE p.id = p_user_id;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Usuario nao encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.can_manage_account_members(v_account_id) THEN
        RAISE EXCEPTION 'Sem permissao para gerenciar membros desta conta' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        o.id AS org_id,
        o.name AS org_name,
        EXISTS(
            SELECT 1 FROM org_members om
            WHERE om.user_id = p_user_id AND om.org_id = o.id
        ) AS is_member
    FROM organizations o
    WHERE o.parent_org_id = v_account_id
    ORDER BY o.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_workspaces(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_member_workspaces IS
    'Lista workspaces filhos da conta do usuario-alvo com flag is_member. '
    'Acessivel a admins da conta (nao so platform admin).';

-- -------------------------------------------------------------------------
-- set_member_workspaces: define exatamente em quais workspaces filhos o user
-- tem membership. Insere faltantes (preservando roles), remove extras dentro
-- da arvore, mantem invariantes e sincroniza profiles.produtos.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_workspaces(
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
    v_active_org UUID;
    v_new_role TEXT;
    v_valid_ids UUID[];
    v_slugs app_product[];
    v_added INT := 0;
    v_removed INT := 0;
BEGIN
    -- Resolver conta do alvo + dados
    SELECT COALESCE(o.parent_org_id, o.id), p.is_admin, p.email, p.active_org_id
    INTO v_account_id, v_user_is_admin, v_user_email, v_active_org
    FROM profiles p
    JOIN organizations o ON o.id = p.org_id
    WHERE p.id = p_user_id;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Usuario nao encontrado: %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.can_manage_account_members(v_account_id) THEN
        RAISE EXCEPTION 'Sem permissao para gerenciar membros desta conta' USING ERRCODE = '42501';
    END IF;

    -- Validar que p_workspace_ids sao workspaces FILHOS da conta (defesa cross-tenant)
    SELECT COALESCE(array_agg(o.id), ARRAY[]::UUID[])
    INTO v_valid_ids
    FROM organizations o
    WHERE o.id = ANY(p_workspace_ids)
      AND o.parent_org_id = v_account_id;

    -- Guard: nunca deixar o usuario sem acesso nenhum
    IF array_length(v_valid_ids, 1) IS NULL OR array_length(v_valid_ids, 1) < 1 THEN
        RAISE EXCEPTION 'Selecione ao menos um produto/workspace valido' USING ERRCODE = '23514';
    END IF;

    -- Role das novas memberships: admin mantem privilegio, demais entram como member
    v_new_role := CASE WHEN v_user_is_admin THEN 'admin' ELSE 'member' END;

    -- INSERT memberships faltantes (preserva role existente via DO NOTHING)
    WITH inserted AS (
        INSERT INTO org_members (user_id, org_id, role, is_default)
        SELECT p_user_id, wid, v_new_role, false
        FROM unnest(v_valid_ids) AS wid
        ON CONFLICT (user_id, org_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_added FROM inserted;

    -- DELETE memberships em workspaces FILHOS da conta que sairam da lista
    -- (nao toca a account nem outros tenants)
    WITH deleted AS (
        DELETE FROM org_members om
        USING organizations o
        WHERE om.user_id = p_user_id
          AND om.org_id = o.id
          AND o.parent_org_id = v_account_id
          AND om.org_id <> ALL(v_valid_ids)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_removed FROM deleted;

    -- Invariante 1: exatamente uma linha is_default=true.
    -- Se removemos a default, promover um dos workspaces validos.
    IF NOT EXISTS (
        SELECT 1 FROM org_members WHERE user_id = p_user_id AND is_default = true
    ) THEN
        UPDATE org_members
        SET is_default = true
        WHERE user_id = p_user_id AND org_id = v_valid_ids[1];
    END IF;

    -- Invariante 2: active_org_id sempre aponta para org onde o user e membro.
    IF v_active_org IS NULL OR NOT EXISTS (
        SELECT 1 FROM org_members WHERE user_id = p_user_id AND org_id = v_active_org
    ) THEN
        UPDATE profiles SET active_org_id = v_valid_ids[1] WHERE id = p_user_id;
    END IF;

    -- Sincronizar profiles.produtos com os produtos dos workspaces liberados
    -- (mantem OwnerSelector coerente: a pessoa aparece como responsavel nesses produtos)
    SELECT COALESCE(array_agg(DISTINCT pr.slug::app_product), ARRAY[]::app_product[])
    INTO v_slugs
    FROM products pr
    WHERE pr.org_id = ANY(v_valid_ids);

    UPDATE profiles
    SET produtos = CASE WHEN array_length(v_slugs, 1) IS NULL THEN NULL ELSE v_slugs END
    WHERE id = p_user_id;

    -- Audit log
    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (
        v_actor,
        'member.workspaces.set',
        'profile',
        p_user_id,
        jsonb_build_object(
            'target_email', v_user_email,
            'account_id', v_account_id,
            'requested_workspace_ids', to_jsonb(p_workspace_ids),
            'valid_workspace_ids', to_jsonb(v_valid_ids),
            'produtos', to_jsonb(v_slugs),
            'added', v_added,
            'removed', v_removed
        )
    );

    RETURN json_build_object(
        'success', true,
        'added', v_added,
        'removed', v_removed,
        'workspace_ids', v_valid_ids,
        'produtos', v_slugs
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_member_workspaces(UUID, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.set_member_workspaces IS
    'Admin da conta define em quais workspaces filhos (produtos) um usuario tem '
    'membership. Insere faltantes preservando roles, remove extras na arvore, '
    'mantem is_default/active_org_id validos e sincroniza profiles.produtos.';
