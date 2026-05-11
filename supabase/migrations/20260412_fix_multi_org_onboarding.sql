-- =========================================================================
-- Fix Multi-Org Onboarding
-- =========================================================================
-- Corrige quatro bugs de onboarding validados em produção:
--
-- 1) handle_new_user escolhia invite por email com LIMIT 1 sem ORDER BY,
--    gerando org aleatória quando havia invites pendentes em várias orgs.
--    Fix: buscar invite via raw_user_meta_data.invite_token; fallback
--    determinístico pelo invite mais antigo.
--
-- 2) Trigger on_auth_user_created_mark_invite (função mark_invite_used)
--    marcava TODOS os invites pendentes do email, queimando convites de
--    outras orgs. Fix: remover trigger e função — handle_new_user já
--    marca o invite certo por id.
--
-- 3) handle_new_user não populava org_members. Fix: INSERT do invite
--    principal (is_default=true) + auto-aceite dos demais invites
--    pendentes do mesmo email (is_default=false).
--
-- 4) Não havia fluxo para usuário já logado aceitar convite em outra org.
--    Fix: RPC accept_invite_for_existing_user(p_token).
--
-- Bônus: generate_invite agora valida que p_team_id pertence à org do
-- chamador (requesting_org_id()).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) Dropar trigger destrutiva mark_invite_used
-- -------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created_mark_invite ON auth.users;
DROP FUNCTION IF EXISTS public.mark_invite_used();

-- -------------------------------------------------------------------------
-- 2) Reescrever handle_new_user — invite por token + org_members + multi-org
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_invite     RECORD;
    v_org_id     UUID;
    v_role       app_role;
    v_role_id    UUID;
    v_token      TEXT;
BEGIN
    v_token := NEW.raw_user_meta_data->>'invite_token';

    -- Preferência: invite casado por token (garante escolha da org certa)
    IF v_token IS NOT NULL AND length(v_token) > 0 THEN
        SELECT i.id, i.org_id, i.role, i.team_id, i.produtos, i.email
        INTO v_invite
        FROM public.invitations i
        WHERE i.token = v_token
          AND i.used_at IS NULL
          AND i.expires_at > NOW()
          AND lower(i.email) = lower(NEW.email);
    END IF;

    -- Fallback determinístico: invite mais antigo pendente para o email
    IF v_invite.id IS NULL THEN
        SELECT i.id, i.org_id, i.role, i.team_id, i.produtos, i.email
        INTO v_invite
        FROM public.invitations i
        WHERE lower(i.email) = lower(NEW.email)
          AND i.used_at IS NULL
          AND i.expires_at > NOW()
        ORDER BY i.created_at ASC
        LIMIT 1;
    END IF;

    v_org_id := COALESCE(v_invite.org_id, 'a0000000-0000-0000-0000-000000000001'::UUID);
    v_role   := COALESCE(v_invite.role, 'vendas')::app_role;

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
        v_invite.team_id,
        COALESCE(v_invite.produtos, ARRAY['TRIPS'])::app_product[],
        v_org_id,
        v_org_id
    );

    -- Membership na org principal (origem do signup)
    INSERT INTO public.org_members (user_id, org_id, role, is_default)
    VALUES (NEW.id, v_org_id, COALESCE(v_invite.role, 'member'), true)
    ON CONFLICT (user_id, org_id) DO UPDATE SET is_default = true;

    -- Auto-aceite de outros invites pendentes para o mesmo email (outras orgs)
    INSERT INTO public.org_members (user_id, org_id, role, is_default)
    SELECT NEW.id, i.org_id, COALESCE(i.role, 'member'), false
    FROM public.invitations i
    WHERE lower(i.email) = lower(NEW.email)
      AND i.used_at IS NULL
      AND i.expires_at > NOW()
      AND (v_invite.id IS NULL OR i.id <> v_invite.id)
      AND i.org_id <> v_org_id
    ON CONFLICT (user_id, org_id) DO NOTHING;

    -- Marcar como usados todos os invites pendentes consumidos no signup
    UPDATE public.invitations
    SET used_at = NOW()
    WHERE lower(email) = lower(NEW.email)
      AND used_at IS NULL
      AND expires_at > NOW();

    RETURN NEW;
END;
$function$;

-- -------------------------------------------------------------------------
-- 3) RPC accept_invite_for_existing_user — usuário logado aceita convite
--    em outra org. Retorna org_id aceito.
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

    INSERT INTO public.org_members (user_id, org_id, role, is_default)
    VALUES (v_user_id, v_invite.org_id, COALESCE(v_invite.role, 'member'), false)
    ON CONFLICT (user_id, org_id) DO NOTHING;

    UPDATE public.invitations
    SET used_at = NOW()
    WHERE id = v_invite.id;

    RETURN json_build_object(
        'success', true,
        'org_id',  v_invite.org_id,
        'role',    v_invite.role
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_invite_for_existing_user(text) TO authenticated;

-- -------------------------------------------------------------------------
-- 4) generate_invite — validar team_id pertence a requesting_org_id()
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_invite(
    p_email      text,
    p_role       text,
    p_team_id    uuid,
    p_created_by uuid,
    p_produtos   text[] DEFAULT NULL::text[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_token       TEXT;
    v_caller_role TEXT;
    v_org_id      UUID;
    v_team_org    UUID;
BEGIN
    v_org_id := requesting_org_id();

    -- Permissão: admin ou manager/member com is_admin
    SELECT r.name INTO v_caller_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'manager', 'member') THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        ) THEN
            RAISE EXCEPTION 'Permissão negada: apenas admins e managers podem criar convites';
        END IF;
    END IF;

    -- Role existe
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE name = p_role) THEN
        RAISE EXCEPTION 'Role inválida: %', p_role;
    END IF;

    -- Team pertence à org do chamador
    IF p_team_id IS NOT NULL THEN
        SELECT org_id INTO v_team_org
        FROM public.teams
        WHERE id = p_team_id;

        IF v_team_org IS NULL THEN
            RAISE EXCEPTION 'Time não encontrado: %', p_team_id;
        END IF;

        IF v_team_org <> v_org_id THEN
            RAISE EXCEPTION 'Time não pertence à organização atual';
        END IF;
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO public.invitations (email, role, team_id, token, expires_at, created_by, produtos, org_id)
    VALUES (p_email, p_role, p_team_id, v_token, now() + interval '7 days', p_created_by, p_produtos, v_org_id);

    RETURN v_token;
END;
$function$;
