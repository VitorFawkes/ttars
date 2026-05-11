-- Fix: Filtros de pessoas (Pipeline, Analytics, Times) vinham vazios para
-- usuários não-admin. Causa: as únicas policies SELECT em org_members eram
-- "select_own" (só a própria linha) e "admin_all" (somente quem tem
-- role='admin' enxerga colegas). Membros comuns viam só a si mesmos.
--
-- Solução: política adicional que libera SELECT para qualquer usuário
-- autenticado que seja membro do org da linha. Função SECURITY DEFINER
-- evita recursão de RLS (mesma técnica de is_org_admin em
-- 20260411_org_split_04_fix_rls.sql).

CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_members
        WHERE user_id = p_user_id AND org_id = p_org_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "org_members_select_same_org" ON org_members;

CREATE POLICY "org_members_select_same_org" ON org_members
    FOR SELECT TO authenticated
    USING (is_org_member(auth.uid(), org_id));

COMMENT ON POLICY "org_members_select_same_org" ON org_members IS
    'Usuários autenticados veem membros das orgs em que eles próprios são membros. Necessário para filtros, dropdowns de owners e listagem de equipe (Pipeline, Analytics, Settings).';
