-- H2: Custom Access Token Hook — injeta org_id no JWT
-- Supabase chama esta function a cada login/refresh de token
-- O claim fica em auth.jwt()->'app_metadata'->>'org_id'
-- Uso: RLS pode usar (auth.jwt()->'app_metadata'->>'org_id')::UUID sem subquery em profiles

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_org_id  UUID;
    claims    JSONB;
BEGIN
    v_user_id := (event->>'user_id')::UUID;

    -- Buscar org_id do profile
    SELECT org_id INTO v_org_id
    FROM profiles
    WHERE id = v_user_id;

    -- Fallback: Welcome Group (caso profile não tenha org_id ainda)
    IF v_org_id IS NULL THEN
        v_org_id := 'a0000000-0000-0000-0000-000000000001'::UUID;
    END IF;

    -- Injetar no app_metadata do JWT
    claims := event->'claims';
    claims := jsonb_set(
        claims,
        '{app_metadata}',
        COALESCE(claims->'app_metadata', '{}'::JSONB) || jsonb_build_object('org_id', v_org_id::TEXT)
    );

    -- Retornar evento com claims atualizadas
    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Permissões: supabase_auth_admin precisa executar este hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) TO supabase_auth_admin;

-- Revogar acesso geral por segurança
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) FROM authenticated, anon, PUBLIC;

COMMENT ON FUNCTION public.custom_access_token_hook IS 'H2: Injeta org_id no JWT app_metadata. Ativar em Supabase Dashboard → Auth → Hooks → Custom Access Token.';
