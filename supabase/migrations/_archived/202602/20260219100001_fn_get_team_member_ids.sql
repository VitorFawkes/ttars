-- =============================================================================
-- Migration: RPC para resolver IDs de membros de times
-- Problema: Filtro teamIds no pipeline expande IDs client-side (N+1).
-- Solução: Função server-side que recebe array de team_ids e retorna array
--          de profile IDs dos membros ativos desses times.
-- Data: 2026-02-19
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_team_member_ids(p_team_ids UUID[])
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(array_agg(id), '{}')
    FROM public.profiles
    WHERE team_id = ANY(p_team_ids)
      AND active = true;
$$;

-- Acesso para usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_team_member_ids(UUID[]) TO authenticated;
