-- =========================================================================
-- Multi-Org Onboarding — Follow-ups
-- =========================================================================
-- Corrige quatro gaps identificados após 20260412_fix_multi_org_onboarding.sql:
--
-- Gap 1 (BLOQUEANTE): handle_new_user usava RECORD `v_invite` e acessava
--   v_invite.id sem atribuição prévia quando v_token era NULL, lançando
--   "record v_invite is not assigned yet". O fallback determinístico por
--   email era inalcançável. Fix: trocar RECORD por variáveis escalares
--   (sempre inicializadas como NULL em DECLARE).
--
-- Gap 2: check_invite_whitelist usava SELECT INTO sem LIMIT/ORDER BY.
--   Funcional hoje (só checa existência), mas anti-padrão. Fix: trocar
--   por NOT EXISTS — intenção explícita, sem dependência de ordem.
--
-- Gap 3: handle_new_user não populava app_metadata.org_id em auth.users.
--   Dependia 100% do custom_access_token_hook ler active_org_id do profile.
--   Fix: setar raw_app_meta_data.org_id explicitamente no final do trigger
--   como defesa em profundidade — requesting_org_id() funciona mesmo se o
--   hook for removido/desabilitado.
--
-- Gap 5: accept_invite_for_existing_user retornava role cru do invite
--   (podia ser NULL) enquanto o INSERT usava COALESCE(..., 'member').
--   Fix: aplicar o mesmo COALESCE no JSON de retorno.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Gap 1 + Gap 3: Reescrever handle_new_user
-- -------------------------------------------------------------------------
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
    -- (agora REALMENTE alcançável — variáveis escalares inicializam como NULL)
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
    v_role   := COALESCE(v_invite_role, 'vendas')::app_role;

    SELECT r.id INTO v_role_id
    FROM public.roles r
    WHERE r.name = v_role::TEXT
      AND r.is_system = false
    LIMIT 1;

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

    -- Gap 3: garantir app_metadata.org_id no primeiro JWT mesmo sem custom_access_token_hook
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                            || jsonb_build_object('org_id', v_org_id)
    WHERE id = NEW.id;

    RETURN NEW;
END;
$function$;

-- -------------------------------------------------------------------------
-- Gap 2: check_invite_whitelist com NOT EXISTS
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_invite_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.invitations
    WHERE lower(email) = lower(new.email)
      AND used_at IS NULL
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Acesso negado. Este email não possui um convite válido.';
  END IF;

  RETURN new;
END;
$function$;

-- -------------------------------------------------------------------------
-- Gap 5: accept_invite_for_existing_user retorna role resolvido
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite_for_existing_user(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_invite      RECORD;
    v_user_id     UUID;
    v_user_email  TEXT;
    v_role        TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_user_id;

    SELECT i.id, i.org_id, i.role, i.email, i.team_id, i.produtos
    INTO v_invite
    FROM public.invitations i
    WHERE i.token = p_token
      AND i.used_at IS NULL
      AND i.expires_at > NOW();

    IF v_invite.id IS NULL THEN
        RAISE EXCEPTION 'Convite inválido ou expirado';
    END IF;

    IF lower(v_invite.email) <> lower(v_user_email) THEN
        RAISE EXCEPTION 'Convite destinado a outro email';
    END IF;

    v_role := COALESCE(v_invite.role, 'member');

    INSERT INTO public.org_members (user_id, org_id, role, is_default)
    VALUES (v_user_id, v_invite.org_id, v_role, false)
    ON CONFLICT (user_id, org_id) DO NOTHING;

    UPDATE public.invitations
    SET used_at = NOW()
    WHERE id = v_invite.id;

    RETURN json_build_object(
        'success', true,
        'org_id',  v_invite.org_id,
        'role',    v_role
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_invite_for_existing_user(text) TO authenticated;
