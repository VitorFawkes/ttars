-- Platform Admin Fase 5: Impersonate
-- Permite platform_admin entrar em qualquer org (para suporte) com banner
-- visível e registro em audit log. Reverte ao contexto original ao sair.
--
-- Design:
--   - Nova coluna profiles.impersonating_org_id: se setado, JWT usa esse org_id.
--   - JWT hook inclui claim 'impersonating': true quando ativo.
--   - RPC platform_impersonate_org(p_org_id) seta a coluna + audit.
--   - RPC platform_end_impersonation() limpa + audit.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.platform_impersonate_org(UUID);
--   DROP FUNCTION IF EXISTS public.platform_end_impersonation();
--   ALTER TABLE profiles DROP COLUMN IF EXISTS impersonating_org_id;
--   Restaurar custom_access_token_hook da migration 20260412_platform_admin_02.

-- 1. Coluna de impersonação
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS impersonating_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.impersonating_org_id IS
  'Se setado, platform_admin está em modo impersonate nesta org. '
  'JWT prioriza este valor sobre active_org_id/org_id.';

-- 2. Atualizar JWT hook: priorizar impersonating_org_id > active_org_id > org_id
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id            UUID;
    v_org_id             UUID;
    v_is_platform_admin  BOOLEAN := FALSE;
    v_impersonating      BOOLEAN := FALSE;
    claims               JSONB;
BEGIN
    v_user_id := (event->>'user_id')::UUID;

    SELECT
        COALESCE(impersonating_org_id, active_org_id, org_id),
        COALESCE(is_platform_admin, FALSE),
        impersonating_org_id IS NOT NULL
    INTO v_org_id, v_is_platform_admin, v_impersonating
    FROM profiles
    WHERE id = v_user_id;

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
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
    'Injeta org_id, is_platform_admin e impersonating no JWT app_metadata. '
    'Prioridade do org_id: impersonating_org_id > active_org_id > org_id.';

-- 3. RPC: iniciar impersonate
CREATE OR REPLACE FUNCTION public.platform_impersonate_org(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'permission denied: platform admin required'
            USING ERRCODE = '42501';
    END IF;

    v_actor_id := auth.uid();

    -- Verificar que a org existe
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id) THEN
        RAISE EXCEPTION 'organization not found: %', p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Setar impersonating
    UPDATE profiles
    SET impersonating_org_id = p_org_id
    WHERE id = v_actor_id;

    -- Audit (dados sensíveis: qual actor, qual org, quando)
    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor_id, 'user.impersonate_start', 'organization', p_org_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_impersonate_org(UUID) TO authenticated;

-- 4. RPC: sair do impersonate
CREATE OR REPLACE FUNCTION public.platform_end_impersonation()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_prev_org UUID;
BEGIN
    v_actor_id := auth.uid();

    SELECT impersonating_org_id INTO v_prev_org
    FROM profiles
    WHERE id = v_actor_id;

    IF v_prev_org IS NULL THEN
        RETURN;  -- não estava impersonando, no-op
    END IF;

    UPDATE profiles
    SET impersonating_org_id = NULL
    WHERE id = v_actor_id;

    -- Não exige platform_admin aqui: usuário pode sempre sair do modo impersonate
    -- mesmo se alguém revogou o is_platform_admin no meio do caminho (self-healing).
    INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor_id, 'user.impersonate_end', 'organization', v_prev_org, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_end_impersonation() TO authenticated;
