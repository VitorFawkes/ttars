-- =========================================================================
-- Fix Cross-Tenant Invite Escalation (Gap 4)
-- =========================================================================
-- Bug demonstrado em produção: qualquer usuário autenticado pode criar
-- convites em qualquer organização sem ser membro dela.
--
-- Cadeia (9 requests HTTP):
--   1. PATCH /profiles?id=eq.<self> {"active_org_id": "<welcome-group>"}
--   2. Re-login → JWT.app_metadata.org_id = WG
--   3. GET /roles?name=eq.member → pega role_id de 'member' (existe só em WG)
--   4. PATCH /profiles {"role_id": "<member>"}
--   5. PATCH /profiles {"active_org_id": "<org-alvo>"}
--   6. Re-login → JWT.app_metadata.org_id = org-alvo
--   7. GET /teams → pega team_id da org-alvo
--   8. POST /rpc/generate_invite → invite criado em org-alvo
--   9. Signup com email do invite → attacker vira membro legítimo
--
-- Causas raiz:
--   A) custom_access_token_hook injeta `active_org_id` no JWT sem validar
--      que o user é membro daquela org. profiles_self_update permite UPDATE
--      sem restrição de coluna.
--   B) generate_invite usa requesting_org_id() para definir org_id do invite,
--      sem checar que o caller é membro dessa org.
--   C) Bonus: generate_invite trata 'admin'/'manager'/'member' como nomes de
--      role autorizados sem checar is_admin — design por nome, não capability.
--
-- Esta migration corrige A e B. C fica para um refactor maior do modelo de
-- permissões.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Fix A: custom_access_token_hook valida membership antes de aceitar
-- active_org_id; só aceita impersonating_org_id se for platform admin.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id              UUID;
    v_home_org_id          UUID;
    v_active_org_id        UUID;
    v_impersonating_org_id UUID;
    v_is_platform_admin    BOOLEAN := FALSE;
    v_org_id               UUID;
    v_impersonating        BOOLEAN := FALSE;
    claims                 JSONB;
BEGIN
    v_user_id := (event->>'user_id')::UUID;

    SELECT org_id, active_org_id, impersonating_org_id, COALESCE(is_platform_admin, FALSE)
    INTO   v_home_org_id, v_active_org_id, v_impersonating_org_id, v_is_platform_admin
    FROM profiles
    WHERE id = v_user_id;

    -- Impersonation: só aceita se for platform admin (defesa server-side
    -- contra UPDATE direto de impersonating_org_id via profiles_self_update)
    IF v_impersonating_org_id IS NOT NULL AND v_is_platform_admin THEN
        v_org_id := v_impersonating_org_id;
        v_impersonating := TRUE;
    -- Active org: aceita se o user é membro daquela org
    ELSIF v_active_org_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM org_members
        WHERE user_id = v_user_id AND org_id = v_active_org_id
    ) THEN
        v_org_id := v_active_org_id;
    -- Fallback: home org (definido por handle_new_user no signup)
    ELSE
        v_org_id := v_home_org_id;
    END IF;

    claims := event->'claims';
    claims := jsonb_set(
        claims,
        '{app_metadata}',
        COALESCE(claims->'app_metadata', '{}'::JSONB)
          || jsonb_build_object(
               'org_id', v_org_id,
               'is_platform_admin', v_is_platform_admin,
               'impersonating', v_impersonating
             )
    );

    RETURN jsonb_set(event, '{claims}', claims);
END;
$function$;

-- -------------------------------------------------------------------------
-- Fix B: generate_invite valida que o caller é membro de requesting_org_id()
-- (defesa em profundidade — caso o hook falhe ou seja revertido)
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
    v_is_platform BOOLEAN;
BEGIN
    v_org_id := requesting_org_id();

    -- Caller é membro da org corrente? Platform admin pode operar em qualquer org.
    SELECT COALESCE(is_platform_admin, FALSE) INTO v_is_platform
    FROM public.profiles WHERE id = auth.uid();

    IF NOT v_is_platform AND NOT EXISTS (
        SELECT 1 FROM public.org_members
        WHERE user_id = auth.uid() AND org_id = v_org_id
    ) THEN
        RAISE EXCEPTION 'Permissão negada: você não é membro desta organização';
    END IF;

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
