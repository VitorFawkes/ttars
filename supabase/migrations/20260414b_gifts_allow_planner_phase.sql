-- ============================================================
-- Permitir que T. Planners (team phase='planner') também vejam
-- e gerenciem presentes/estoque — necessário para o botão
-- "Montar Kit de Presentes" no GiftsWidget do card.
--
-- Migration anterior (20260414_gifts_inventory_role_restriction)
-- restringiu demais: só admin/pos_venda. Planners têm role='vendas'
-- (legacy) mas precisam do acesso para montar kits.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_gifts()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    LEFT JOIN teams t ON t.id = p.team_id
    LEFT JOIN pipeline_phases ph ON ph.id = t.phase_id
    WHERE p.id = auth.uid()
      AND (
        p.is_admin = TRUE
        OR p.role = 'pos_venda'
        OR ph.slug IN ('pos_venda', 'planner')
      )
  );
$$;

COMMIT;
