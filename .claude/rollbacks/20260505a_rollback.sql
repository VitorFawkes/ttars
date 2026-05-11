-- =====================================================================
-- ROLLBACK da migration 20260505a_auto_create_atendimento_for_concierge_assignee.sql
--
-- Use este arquivo SE a feature precisar ser desfeita em produção.
-- Aplica via:
--   bash .claude/hooks/promote-to-prod.sh .claude/rollbacks/20260505a_rollback.sql
--
-- Efeito:
--   1. Remove o trigger AFTER INSERT em `tarefas`.
--   2. Remove a função PL/pgSQL associada.
--
-- O QUE ESTE ROLLBACK NÃO FAZ (proposital):
--   - NÃO apaga linhas de `atendimentos_concierge` que o trigger criou.
--     Razão: depois de criadas, essas linhas viraram dados reais
--     (operadores podem ter marcado outcome, notificado cliente, etc).
--     Não tem como distinguir com certeza atendimentos criados pelo
--     trigger vs criados manualmente — todos têm source='manual'.
--     Decisão: manter os dados; apenas parar de criar novos.
--
--   - NÃO desfaz mudanças de frontend (selo na CardTasks, modal, realtime).
--     Aquilo é desfeito por revert no Git, não por SQL.
-- =====================================================================

BEGIN;

DROP TRIGGER IF EXISTS tarefas_auto_create_concierge_atendimento ON tarefas;
DROP FUNCTION IF EXISTS trg_tarefas_auto_create_concierge_atendimento();

COMMIT;
