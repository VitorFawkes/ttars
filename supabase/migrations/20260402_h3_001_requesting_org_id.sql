-- H3-001: Helper function requesting_org_id()
-- Extrai org_id do JWT claim app_metadata.org_id
-- Todas as RLS policies e RPCs devem usar esta funcao ao inves da expressao raw
-- Fallback para Welcome Group UUID garante backward compatibility
--
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.requesting_org_id();

-- Funcao helper: extrai org_id do JWT (STABLE = cacheia por statement)
CREATE OR REPLACE FUNCTION public.requesting_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id')::UUID,
    'a0000000-0000-0000-0000-000000000001'::UUID
  );
$$;

-- Permissoes
GRANT EXECUTE ON FUNCTION public.requesting_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.requesting_org_id() TO service_role;
REVOKE EXECUTE ON FUNCTION public.requesting_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.requesting_org_id() FROM PUBLIC;

COMMENT ON FUNCTION public.requesting_org_id() IS
  'Retorna o org_id do usuario autenticado via JWT claim app_metadata.org_id. '
  'Fallback para Welcome Group UUID se claim ausente.';
