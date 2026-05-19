-- ============================================================================
-- MIGRATION: RPCs de auditoria Monde para smoke test
-- Date: 2026-05-19
--
-- Cria 2 funções idempotentes que o smoke test chama para detectar regressão:
--   1. monde_items_in_archived_cards_count — items ativos em cards arquivados.
--      Esperado: 0 sempre (a guarda BEFORE INSERT/UPDATE + cascata 20260515e
--      impedem isso). Se aparecer > 0, é regressão grave.
--   2. monde_reconcile_divergence_count — pares (card_ativo, venda) onde a
--      contagem de items ativos ≠ contagem de produtos no arquivo Monde.
--      Esperado: 0 ou poucos casos legacy (cards com items mas pending_sale
--      ausente). Aceitamos > 0 com WARN, < N (limite).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.monde_items_in_archived_cards_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM card_financial_items cfi
  JOIN cards c ON c.id = cfi.card_id
  WHERE cfi.archived_at IS NULL
    AND c.archived_at IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.monde_items_in_archived_cards_count() TO authenticated, service_role;

COMMENT ON FUNCTION public.monde_items_in_archived_cards_count() IS
  'Conta items financeiros ativos em cards arquivados. Esperado: 0. Guarda BEFORE INSERT/UPDATE de card_financial_items + cascata trg_propagate_card_archived impedem regressão.';


CREATE OR REPLACE FUNCTION public.monde_reconcile_divergence_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Conta pares (card_ativo, venda) onde:
  --   - há monde_pending_sales correspondente (referência do arquivo Monde)
  --   - mas a contagem de items ativos no card diverge da contagem de produtos
  --     no JSONB da pending_sale
  -- Pares onde pending_sale não existe (legacy) NÃO entram — não dá pra reconciliar
  -- sem referência.
  SELECT COUNT(*)::INTEGER FROM (
    SELECT cfi.card_id, cfi.monde_venda_num
    FROM card_financial_items cfi
    JOIN cards c ON c.id = cfi.card_id
    WHERE cfi.archived_at IS NULL
      AND cfi.monde_venda_num IS NOT NULL
      AND c.archived_at IS NULL
    GROUP BY cfi.card_id, cfi.monde_venda_num, c.org_id
    HAVING COUNT(*) <> COALESCE(
      (SELECT jsonb_array_length(mps.products)
         FROM monde_pending_sales mps
        WHERE mps.venda_num = cfi.monde_venda_num
          AND mps.org_id = c.org_id
        LIMIT 1),
      COUNT(*)  -- se não há pending_sale, considera unchanged (COUNT = COUNT)
    )
  ) divs;
$$;

GRANT EXECUTE ON FUNCTION public.monde_reconcile_divergence_count() TO authenticated, service_role;

COMMENT ON FUNCTION public.monde_reconcile_divergence_count() IS
  'Conta divergências entre card_financial_items e monde_pending_sales.products. Casos legacy (pending_sale ausente) são excluídos. Esperado: 0 após backfill. Se > 0, indica que reconcile_card_monde_venda precisa rodar para esses pares.';

COMMIT;
