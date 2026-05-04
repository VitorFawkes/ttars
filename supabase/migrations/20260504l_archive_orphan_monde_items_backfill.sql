-- ============================================================================
-- MIGRATION: Reconciliacao retroativa — arquivar items orfaos de venda Monde
-- Date: 2026-05-04
--
-- Contexto: a 20260504k criou o trigger trg_archive_orphan_monde_items, mas
-- ele so age em UPDATE futuros de cards.produto_data. Cards onde o numero
-- de venda foi trocado ANTES da migration ja existiam com items orfaos
-- (monde_venda_num que nao bate mais com o numero atual do card).
--
-- Este script percorre todos os cards e arquiva os items cujo monde_venda_num
-- nao esta na lista atual de numero_venda_monde primario + historico.
-- ============================================================================

BEGIN;

WITH card_active_nums AS (
  SELECT
    c.id AS card_id,
    array_remove(
      ARRAY[c.produto_data->>'numero_venda_monde']
      || COALESCE(
           ARRAY(
             SELECT jsonb_array_elements(c.produto_data->'numeros_venda_monde_historico')->>'numero'
           ),
           ARRAY[]::TEXT[]
         ),
      NULL
    ) AS active_nums
  FROM public.cards c
)
UPDATE public.card_financial_items cfi
SET archived_at = NOW(),
    archived_reason = 'monde_venda_removida'
FROM card_active_nums can
WHERE cfi.card_id = can.card_id
  AND cfi.monde_venda_num IS NOT NULL
  AND cfi.archived_at IS NULL
  AND NOT (cfi.monde_venda_num = ANY(can.active_nums));

-- Recalcular valor_final / receita dos cards afetados (usando CTE pra
-- evitar atualizar tudo desnecessariamente). Considera apenas items ativos.
UPDATE public.cards c
SET valor_final = COALESCE((
      SELECT SUM(sale_value)
      FROM public.card_financial_items
      WHERE card_id = c.id AND archived_at IS NULL
    ), 0),
    receita = COALESCE((
      SELECT SUM(sale_value - supplier_cost)
      FROM public.card_financial_items
      WHERE card_id = c.id AND archived_at IS NULL
    ), 0),
    updated_at = NOW()
WHERE c.id IN (
  SELECT DISTINCT card_id
  FROM public.card_financial_items
  WHERE archived_reason = 'monde_venda_removida'
    AND archived_at >= NOW() - INTERVAL '5 minutes'
);

COMMIT;
