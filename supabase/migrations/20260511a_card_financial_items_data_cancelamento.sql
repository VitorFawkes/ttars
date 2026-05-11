-- ============================================================================
-- MIGRATION: card_financial_items.data_cancelamento
-- Date: 2026-05-11
--
-- Motivo:
--   Relatório Vendas Monde passou a exportar coluna "Data Cancelamento".
--   Quando preenchida, o produto correspondente foi cancelado no Monde —
--   precisamos refletir no CRM arquivando o item com auditoria específica.
--
-- Comportamento:
--   - Coluna nova `data_cancelamento DATE` armazena a data informada pelo
--     Monde quando o produto foi cancelado. NULL = não cancelado.
--   - Combina com a coluna existente `archived_reason`: quando o produto vem
--     com data, o item é arquivado com `archived_reason = 'monde_cancelamento'`.
--   - Se um próximo upload trouxer o mesmo produto SEM data_cancelamento, a
--     RPC bulk_import_financial_items reativa o item (archived_at = NULL).
-- ============================================================================

ALTER TABLE public.card_financial_items
  ADD COLUMN IF NOT EXISTS data_cancelamento DATE;

COMMENT ON COLUMN public.card_financial_items.data_cancelamento IS
  'Data informada na coluna "Data Cancelamento" do relatório Vendas Monde. Quando preenchida, o item é soft-deleted com archived_reason=''monde_cancelamento''. NULL = não cancelado.';
