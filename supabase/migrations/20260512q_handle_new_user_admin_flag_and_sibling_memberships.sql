-- =========================================================================
-- Fix arquitetural no handle_new_user:
--   (1) Aceitar convite com role='admin' DEVE marcar profiles.is_admin = TRUE.
--   (2) Admin recem-criado DEVE virar membro de TODOS os workspaces irmaos
--       da mesma account (parent_org_id), alem do workspace de origem.
--   (3) profiles.org_id passa a apontar SEMPRE para a account-mae - convencao
--       documentada em CLAUDE.md ("profiles.org_id -> account pai") e que ja
--       vinha sendo seguida pela maioria dos profiles em producao. A coluna
--       active_org_id mantem o workspace ativo onde o usuario pousou no signup.
--
-- Bug observado em prod: Isadora foi convidada como admin via tela
-- /platform/organizations/<workspace_id> e ficou com:
--   - is_admin = FALSE (apesar de role='admin')
--   - profile.org_id = workspace (em vez da account)
--   - membership so no workspace de origem (em vez de todos os irmaos)
-- Corrigido manualmente em 2026-05-12; esta migration previne reincidencia.
--
-- Releitura das 8 migrations anteriores que tocaram handle_new_user
-- (TODAS lidas linha-a-linha antes desta migration ser escrita):
--   ok 20260302000000_invite_produtos.sql           - produtos do convite
--   ok 20260402_h3_013_trigger_functions_org_patch  - org_id do convite
--   ok 20260407_fix_handle_new_user_role_cast       - cast ::app_role
--   ok 20260407_fix_handle_new_user_produtos_cast   - cast ::app_product[]
--   ok 20260409_fix_handle_new_user_set_role_id     - lookup role_id
--   ok 20260412_fix_multi_org_onboarding            - token + multi-org + org_members
--   ok 20260412_multi_org_onboarding_followups      - escalares + raw_app_meta_data
--   ok 20260511i_handle_new_user_tolerant_role_cast - cast tolerante
-- Todas as correcoes acima foram PRESERVADAS nesta nova versao.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_invite_id       UUID;
    v_invite_org_id   UUID;
    v_invite_role     TEXT;
    v_invite_team_id  UUID;
    v_invite_produtos TEXT[];
    v_org_id          UUID;
    v_account_id      UUID;
    v_role            app_role;
    v_role_id         UUID;
    v_is_admin        BOOLEAN;
    v_token           TEXT;
BEGIN
    v_token := NEW.raw_user_meta_data->>'invite_token';

    -- Preferencia: invite casado por token (garante escolha da org certa)
    IF v_token IS NOT NULL AND length(v_token) > 0 THEN
        SELECT i.id, i.org_id, i.role, i.team_id, i.produtos
        INTO v_invite_id, v_invite_org_id, v_invite_role, v_invite_team_id, v_invite_produtos
        FROM public.invitations i
        WHERE i.token = v_token
          AND i.used_at IS NULL
          AND i.expires_at > NOW()
          AND lower(i.email) = lower(NEW.email);
    END IF;

    -- Fallback deterministico: invite mais antigo pendente para o email
    IF v_invite_id IS NULL THEN
        SELECT i.id, i.org_id, i.role, i.team_id, i.produtos
        INTO v_invite_id, v_invite_org_id, v_invite_role, v_invite_team_id, v_invite_produtos
        FROM public.invitations i
        WHERE lower(i.email) = lower(NEW.email)
          AND i.used_at IS NULL
          AND i.expires_at > NOW()
        ORDER BY i.created_at ASC
        LIMIT 1;
    END IF;

    v_org_id := COALESCE(v_invite_org_id, 'a0000000-0000-0000-0000-000000000001'::UUID);

    -- Determinar account-mae: se v_org_id e um workspace, pegar parent_org_id;
    -- se ja e uma account (parent_org_id IS NULL), usar ela mesma.
    SELECT COALESCE(o.parent_org_id, o.id)
    INTO v_account_id
    FROM public.organizations o
    WHERE o.id = v_org_id;

    -- Fallback defensivo caso a org nao exista (improvavel, mas evita NULL)
    v_account_id := COALESCE(v_account_id, v_org_id);

    -- Cast tolerante (preservado de 20260511i): roles custom fora do enum
    -- app_role nao bloqueiam mais o signup; cai pra 'vendas' como fallback.
    BEGIN
        v_role := COALESCE(v_invite_role, 'vendas')::app_role;
    EXCEPTION WHEN invalid_text_representation THEN
        v_role := 'vendas'::app_role;
    END;

    -- is_admin e derivado do role do convite. NUNCA confiar so em role='admin':
    -- a UI e varias telas checam profiles.is_admin como fonte de verdade.
    v_is_admin := (lower(COALESCE(v_invite_role, '')) = 'admin');

    -- Lookup role_id pelo nome ORIGINAL do convite (preservado de 20260511i,
    -- sem filtro is_system - em prod todas as roles estao is_system=true).
    IF v_invite_role IS NOT NULL THEN
        SELECT r.id INTO v_role_id
        FROM public.roles r
        WHERE r.name = v_invite_role
        LIMIT 1;
    END IF;

    INSERT INTO public.profiles (
        id, email, nome, role, role_id, team_id, produtos,
        org_id, active_org_id, is_admin
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_role,
        v_role_id,
        v_invite_team_id,
        COALESCE(v_invite_produtos, ARRAY['TRIPS'])::app_product[],
        v_account_id,   -- profile mora na account-mae (convencao CLAUDE.md)
        v_org_id,       -- workspace ativo e o do convite
        v_is_admin
    );

    -- Membership na org de origem do convite
    INSERT INTO public.org_members (user_id, org_id, role, is_default)
    VALUES (NEW.id, v_org_id, COALESCE(v_invite_role, 'member'), true)
    ON CONFLICT (user_id, org_id) DO UPDATE SET is_default = true;

    -- Admin recem-criado entra em TODOS os workspaces irmaos + na account-mae.
    -- Sem isso, admin convidado dentro de UM workspace fica preso a ele e nao
    -- enxerga os outros do tenant.
    IF v_is_admin THEN
        INSERT INTO public.org_members (user_id, org_id, role, is_default)
        SELECT NEW.id, o.id, 'admin', false
        FROM public.organizations o
        WHERE (o.id = v_account_id OR o.parent_org_id = v_account_id)
          AND o.id <> v_org_id
        ON CONFLICT (user_id, org_id) DO NOTHING;
    END IF;

    -- Auto-aceite de outros invites pendentes pro mesmo email (outras orgs)
    INSERT INTO public.org_members (user_id, org_id, role, is_default)
    SELECT NEW.id, i.org_id, COALESCE(i.role, 'member'), false
    FROM public.invitations i
    WHERE lower(i.email) = lower(NEW.email)
      AND i.used_at IS NULL
      AND i.expires_at > NOW()
      AND (v_invite_id IS NULL OR i.id <> v_invite_id)
      AND i.org_id <> v_org_id
    ON CONFLICT (user_id, org_id) DO NOTHING;

    -- Marcar como usados todos os invites pendentes consumidos no signup
    UPDATE public.invitations
    SET used_at = NOW()
    WHERE lower(email) = lower(NEW.email)
      AND used_at IS NULL
      AND expires_at > NOW();

    -- Defesa em profundidade (preservado de 20260412_followups):
    -- garantir app_metadata.org_id no primeiro JWT. Usa active_org_id
    -- (workspace), nao a account, pra que o usuario pouse no workspace certo.
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                            || jsonb_build_object('org_id', v_org_id)
    WHERE id = NEW.id;

    RETURN NEW;
END;
$function$;
