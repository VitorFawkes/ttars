-- =========================================================================
-- Fix arquitetural: handle_new_user nunca mais bloqueia signup por causa de
-- role custom fora do enum legacy `app_role`.
-- =========================================================================
-- Contexto: migration 20260511h adicionou 'assistente' ao enum como fix
-- imediato. Mas qualquer role custom futura (ex: 'sales', 'support', 'planner'
-- já existentes em public.roles mas fora do enum) reproduzirá o mesmo bug.
--
-- Estado pré-fix (base: 20260412_multi_org_onboarding_followups.sql):
--   v_role := COALESCE(v_invite_role, 'vendas')::app_role;
--   → invalid_text_representation aborta a trigger, signup falha.
--
-- Fix:
--   1) Cast tolerante: BEGIN/EXCEPTION para invalid_text_representation,
--      fallback para 'vendas'. role_id preserva a role real.
--   2) Lookup de v_role_id passa a usar v_invite_role (TEXT original) em vez
--      de v_role::TEXT — caso o cast caia no fallback, role_id ainda aponta
--      pra role correta na tabela roles. Removido filtro is_system=false:
--      em prod TODAS as roles (custom inclusive) estão marcadas is_system=true,
--      então o filtro fazia v_role_id ficar sempre NULL.
--
-- Releitura das 7 migrations anteriores que tocaram handle_new_user:
--   ✓ 20260302000000_invite_produtos.sql           — produtos do convite (preservado via v_invite_produtos)
--   ✓ 20260402_h3_013_trigger_functions_org_patch — org_id do convite (preservado)
--   ✓ 20260407_fix_handle_new_user_role_cast       — cast ::app_role (agora tolerante)
--   ✓ 20260407_fix_handle_new_user_produtos_cast   — cast ::app_product[] (preservado)
--   ✓ 20260409_fix_handle_new_user_set_role_id     — lookup role_id (preservado, melhorado)
--   ✓ 20260412_fix_multi_org_onboarding            — token-based + multi-org + org_members (preservado)
--   ✓ 20260412_multi_org_onboarding_followups     — escalares + raw_app_meta_data (preservado)
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
    v_role            app_role;
    v_role_id         UUID;
    v_token           TEXT;
BEGIN
    v_token := NEW.raw_user_meta_data->>'invite_token';

    -- Preferência: invite casado por token (garante escolha da org certa)
    IF v_token IS NOT NULL AND length(v_token) > 0 THEN
        SELECT i.id, i.org_id, i.role, i.team_id, i.produtos
        INTO v_invite_id, v_invite_org_id, v_invite_role, v_invite_team_id, v_invite_produtos
        FROM public.invitations i
        WHERE i.token = v_token
          AND i.used_at IS NULL
          AND i.expires_at > NOW()
          AND lower(i.email) = lower(NEW.email);
    END IF;

    -- Fallback determinístico: invite mais antigo pendente para o email
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

    -- Cast tolerante: roles custom (planner/sales/support/etc.) que ainda não
    -- foram adicionadas ao enum legacy `app_role` não bloqueiam mais o signup.
    -- A role real fica preservada em v_role_id (FK pra public.roles).
    BEGIN
        v_role := COALESCE(v_invite_role, 'vendas')::app_role;
    EXCEPTION WHEN invalid_text_representation THEN
        v_role := 'vendas'::app_role;
    END;

    -- Lookup role_id pelo nome ORIGINAL do convite. Sem filtro is_system:
    -- em prod todas as roles (inclusive custom) estão marcadas is_system=true,
    -- então o filtro antigo fazia v_role_id sempre NULL.
    IF v_invite_role IS NOT NULL THEN
        SELECT r.id INTO v_role_id
        FROM public.roles r
        WHERE r.name = v_invite_role
        LIMIT 1;
    END IF;

    INSERT INTO public.profiles (id, email, nome, role, role_id, team_id, produtos, org_id, active_org_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_role,
        v_role_id,
        v_invite_team_id,
        COALESCE(v_invite_produtos, ARRAY['TRIPS'])::app_product[],
        v_org_id,
        v_org_id
    );

    -- Membership na org principal (origem do signup)
    INSERT INTO public.org_members (user_id, org_id, role, is_default)
    VALUES (NEW.id, v_org_id, COALESCE(v_invite_role, 'member'), true)
    ON CONFLICT (user_id, org_id) DO UPDATE SET is_default = true;

    -- Auto-aceite de outros invites pendentes para o mesmo email (outras orgs)
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

    -- Defesa em profundidade: garantir app_metadata.org_id no primeiro JWT
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                            || jsonb_build_object('org_id', v_org_id)
    WHERE id = NEW.id;

    RETURN NEW;
END;
$function$;
