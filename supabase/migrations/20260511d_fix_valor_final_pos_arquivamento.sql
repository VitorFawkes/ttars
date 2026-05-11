-- ============================================================================
-- MIGRATION: fix retroativo — recalcula valor_final/receita após arquivamento
-- Date: 2026-05-11
--
-- Bug: A migration 20260511c arquivou 379 itens em 100 cards, mas o passo de
-- recálculo de valor_final/receita rodou dentro da mesma CTE multi-statement.
-- Resultado: 90 dos 100 cards ficaram com valor_final/receita desatualizados
-- (em alguns casos valor_final=NULL apesar de receita popular, ou vice-versa).
--
-- Provável causa: CTEs com data-modifying statements em PostgreSQL veem o
-- snapshot inicial da transação — a subquery `WHERE archived_at IS NULL` na
-- CTE final viu os itens em estado pre-arquivamento, gerando valores
-- inconsistentes que não se misturaram bem com a sequência de UPDATEs.
--
-- Fix: UPDATE standalone (fora de CTE de arquivamento). Rerun-safe.
-- ============================================================================

UPDATE cards c
SET valor_final = COALESCE((
      SELECT SUM(sale_value) FROM card_financial_items
      WHERE card_id = c.id AND archived_at IS NULL
    ), 0),
    receita = COALESCE((
      SELECT SUM(sale_value - supplier_cost) FROM card_financial_items
      WHERE card_id = c.id AND archived_at IS NULL
    ), 0),
    updated_at = NOW()
WHERE c.id IN (
  SELECT DISTINCT card_id FROM card_financial_items
  WHERE archived_reason = 'monde_numero_substituido'
);
