-- =====================================================
-- FIX: ganho_pos_at setado como NOW() durante import de cards legados
--
-- Problema: O import via DealImportModal setou ganho_planner_at = data_fechamento
-- corretamente, mas não setou ganho_pos_at. O trigger handle_card_status_automation
-- detectou NULL e usou NOW(), resultando em ~962 cards com ganho_pos_at = 2026-02-18
-- (data do import) ao invés da data histórica da venda.
--
-- Fix: SET ganho_pos_at = ganho_planner_at para cards afetados.
-- Safeguards:
--   - Só atualiza onde ganho_pos_at::date = created_at::date (evidência de NOW())
--   - Só atualiza se ganho_planner_at existe e é diferente (data histórica real)
--   - Não toca em cards novos (movimentação real no pipeline)
-- =====================================================

UPDATE cards
SET ganho_pos_at = ganho_planner_at
WHERE ganho_pos = true
  AND ganho_planner = true
  AND ganho_planner_at IS NOT NULL
  AND ganho_pos_at IS NOT NULL
  AND (ganho_pos_at::date = created_at::date)
  AND (ganho_planner_at::date != created_at::date);
