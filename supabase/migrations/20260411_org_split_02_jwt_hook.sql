-- Org Split Fase 1b: Atualizar JWT hook para suportar active_org_id
-- Prioridade: active_org_id > org_id > fallback Welcome Group

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

    -- Prioridade: active_org_id (org escolhida) > org_id (org padrão) > fallback
    SELECT COALESCE(active_org_id, org_id) INTO v_org_id
    FROM profiles
    WHERE id = v_user_id;

    -- Fallback: Welcome Group
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

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
    'Injeta org_id no JWT app_metadata. Usa active_org_id se setado (org switching), '
    'senão org_id padrão. Ativar em Supabase Dashboard → Auth → Hooks → Custom Access Token.';
