-- =====================================================================
-- ROLLBACK da migration 20260505d_drop_planner_request_source.sql
--
-- Restaura a constraint antiga aceitando 'planner_request' como valor
-- válido novamente. Não restaura linhas (não havia nenhuma linha com
-- esse valor quando a migration foi aplicada).
--
-- Aplica via:
--   bash .claude/hooks/promote-to-prod.sh .claude/rollbacks/20260505d_rollback.sql
-- =====================================================================

BEGIN;

ALTER TABLE atendimentos_concierge
  DROP CONSTRAINT IF EXISTS atendimentos_concierge_source_check;

ALTER TABLE atendimentos_concierge
  ADD CONSTRAINT atendimentos_concierge_source_check
  CHECK (source IN ('cadencia', 'manual', 'cliente', 'planner_request'));

COMMIT;
