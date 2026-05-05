-- =====================================================================
-- 20260505b: estender trigger 20260505a para também disparar em UPDATE
-- de responsavel_id.
--
-- Cenário: planner cria a tarefa atribuída a si mesmo (não-concierge),
-- depois muda o dono para alguém do time Concierge. O atendimento
-- precisa ser criado nesse momento, não só na criação original.
--
-- Cenários cobertos pela mudança:
--   INSERT  c/ responsável concierge          → cria atendimento (já fazia)
--   UPDATE  responsavel: NULL → concierge     → cria atendimento (novo)
--   UPDATE  responsavel: planner → concierge  → cria atendimento (novo)
--   UPDATE  responsavel: concierge_A → concierge_B → skip (atendimento já existe)
--   UPDATE  responsavel: concierge → planner  → skip (atendimento permanece;
--                                                  remoção não foi pedida)
--
-- A função em si não muda: as guardas (responsavel NULL, EXISTS,
-- table missing, é-concierge) já tratam todos os casos — incluindo
-- "UPDATE que reescreveu o mesmo responsavel" (EXISTS pula) e
-- "trocou para outro responsavel não-concierge" (checagem de time pula).
--
-- Nota: TG_OP não está disponível em cláusulas WHEN do CREATE TRIGGER
-- (só dentro do corpo da função). Por isso não há WHEN aqui — confiamos
-- nas guardas internas. O escopo `OF responsavel_id` já garante que
-- updates em outras colunas não disparam o trigger.
-- =====================================================================

BEGIN;

DROP TRIGGER IF EXISTS tarefas_auto_create_concierge_atendimento ON tarefas;

CREATE TRIGGER tarefas_auto_create_concierge_atendimento
  AFTER INSERT OR UPDATE OF responsavel_id ON tarefas
  FOR EACH ROW
  EXECUTE FUNCTION trg_tarefas_auto_create_concierge_atendimento();

COMMIT;
