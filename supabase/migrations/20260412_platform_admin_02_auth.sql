-- Platform Admin Fase 1: Autorização
-- - Função is_platform_admin() lê claim do JWT
-- - JWT hook injeta is_platform_admin no app_metadata
-- - Corrige fallback inseguro de requesting_org_id() (deixava vazar Welcome Group)
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.is_platform_admin();
--   Restaurar custom_access_token_hook e requesting_org_id da versão 20260411/20260402.

-- 1. Função is_platform_admin() — espelho de requesting_org_id() mas para a flag platform
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb
       -> 'app_metadata' ->> 'is_platform_admin')::BOOLEAN,
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'TRUE se o usuário autenticado tem app_metadata.is_platform_admin=true no JWT. '
  'Usado em RLS policies e guards de RPCs platform_*.';

-- 2. Atualizar JWT hook: injetar is_platform_admin + active_org_id/org_id
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
    claims               JSONB;
BEGIN
    v_user_id := (event->>'user_id')::UUID;

    SELECT
        COALESCE(active_org_id, org_id),
        COALESCE(is_platform_admin, FALSE)
    INTO v_org_id, v_is_platform_admin
    FROM profiles
    WHERE id = v_user_id;

    -- Sem fallback hardcoded: se não há org_id, JWT fica sem a claim
    -- e RLS nega acesso (era o fallback antigo que vazava Welcome Group).
    claims := event->'claims';
    claims := jsonb_set(
        claims,
        '{app_metadata}',
        COALESCE(claims->'app_metadata', '{}'::JSONB)
          || jsonb_build_object(
               'org_id', v_org_id,
               'is_platform_admin', v_is_platform_admin
             )
    );

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
    'Injeta org_id e is_platform_admin no JWT app_metadata. '
    'Usa active_org_id se setado (org switching), senão org_id padrão. '
    'Ativar em Supabase Dashboard → Auth → Hooks → Custom Access Token.';

-- 3. Corrigir requesting_org_id: sem fallback hardcoded
-- Antigo: COALESCE(..., 'a0000000-...-000000000001'::UUID) — vazava Welcome Group
-- Novo: NULL se claim ausente (RLS nega, que é o comportamento seguro)
CREATE OR REPLACE FUNCTION public.requesting_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb
          -> 'app_metadata' ->> 'org_id')::UUID;
$$;

GRANT EXECUTE ON FUNCTION public.requesting_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.requesting_org_id() TO service_role;
REVOKE EXECUTE ON FUNCTION public.requesting_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.requesting_org_id() FROM PUBLIC;

COMMENT ON FUNCTION public.requesting_org_id() IS
  'Retorna org_id do JWT claim app_metadata.org_id. '
  'NULL se claim ausente (RLS nega — comportamento seguro). '
  'Fallback para Welcome Group foi REMOVIDO em 2026-04-12 por risco de vazamento.';
