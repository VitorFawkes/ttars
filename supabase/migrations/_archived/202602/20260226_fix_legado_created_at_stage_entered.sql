-- =====================================================
-- FIX: created_at e stage_entered_at dos cards legados
--
-- Problema: 2913 cards "(Legado)" foram importados em 2026-02-18/19.
-- created_at = data do import (NOW()), quando deveria refletir a data
-- histórica da viagem/venda (data_fechamento).
-- stage_entered_at = NULL, quando deveria ser data_fechamento.
--
-- Impacto: Analytics modo "entries" mostra 2913 viagens concluídas
-- nos últimos 3 meses, quando na verdade são vendas de 2022–2026.
--
-- Fix: SET created_at e stage_entered_at = data_fechamento para legados.
-- Safeguards:
--   - Só atualiza "(Legado)" no título
--   - Só onde data_fechamento existe e difere de created_at
--   - Não toca em cards novos
-- =====================================================

UPDATE cards
SET
  created_at = data_fechamento,
  stage_entered_at = data_fechamento
WHERE titulo LIKE '%(Legado)%'
  AND deleted_at IS NULL
  AND data_fechamento IS NOT NULL
  AND (created_at::date != data_fechamento::date);
