-- ============================================================================
-- MIGRATION: RPC count_monde_zombie_items — usado pelo schema-smoke-test
-- Date: 2026-05-07
--
-- Detecta quando uma mesma venda Monde tem itens ativos coexistindo de duas
-- gerações diferentes (formato agregado pré-04-01 + formato granular pós-04-01).
-- Isso só acontece quando o importador deixa de aplicar a regra "último arquivo
-- vence" — situação corrigida pelo migration 20260506f para imports futuros.
--
-- Após o cleanup retroativo (20260507e), a RPC deve retornar 0. O smoke test
-- usa essa RPC e quebra a promoção se reincidir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.count_monde_zombie_items()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH grupos AS (
    SELECT card_id, monde_venda_num,
           MIN(created_at) AS min_at,
           MAX(created_at) AS max_at,
           COUNT(*) AS qtd
    FROM card_financial_items
    WHERE archived_at IS NULL
      AND monde_venda_num IS NOT NULL
    GROUP BY card_id, monde_venda_num
  )
  SELECT COUNT(*)::INTEGER
  FROM grupos
  WHERE qtd >= 2
    AND min_at < '2026-04-01'
    AND max_at >= '2026-04-01';
$$;

GRANT EXECUTE ON FUNCTION public.count_monde_zombie_items() TO authenticated, service_role;
