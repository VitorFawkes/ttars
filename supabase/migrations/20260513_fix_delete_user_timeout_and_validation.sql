-- =========================================================================
-- Fix: delete_user dava "sucesso silencioso" quando user_id não existia,
-- e dava timeout (8s default) ao excluir usuários com muitas referências
-- em cascata (cards, atendimentos, mensagens, etc — 70+ tabelas).
--
-- Caso real (2026-05-13): tentativa de excluir Ana Beatriz (admin em 5
-- workspaces) batia statement_timeout. Tentativa de excluir Vanessa
-- (leve) demorava ~3s. Frontend recebia void sem error e mostrava
-- "Sucesso" mesmo quando o cascade era abortado.
--
-- Fix:
--   1) SET statement_timeout = '60s' no nível da função
--   2) Validar user_id NOT NULL explicitamente
--   3) GET DIAGNOSTICS ROW_COUNT — raise se DELETE não afetou linha
-- =========================================================================

CREATE OR REPLACE FUNCTION public.delete_user(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
    v_caller_role  TEXT;
    v_deleted      INTEGER;
BEGIN
    -- Permissão: admin (role 'admin' OU is_admin legacy)
    SELECT r.name INTO v_caller_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        ) THEN
            RAISE EXCEPTION 'Permission denied: only admins can delete users';
        END IF;
    END IF;

    -- Validação explícita: user_id NULL antes silenciava (0 rows, sem erro)
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be NULL';
    END IF;

    -- Cascade vai cuidar de profiles, org_members, etc. via FKs
    DELETE FROM auth.users WHERE id = user_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'User % not found in auth.users', user_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;
