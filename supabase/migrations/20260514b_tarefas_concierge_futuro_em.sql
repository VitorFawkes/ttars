-- =====================================================================
-- 20260514b: tarefas.concierge_futuro_em
--
-- Flag sticky usada pelo kanban /concierge pra estocar atendimentos na
-- coluna "Agendados para o futuro". NULL = fluxo normal. Preenchido =
-- card fica na coluna Futuro INDEFINIDAMENTE ate alguem limpar.
--
-- A data (TIMESTAMPTZ) e o prazo planejado pra voltar, usada SO pra
-- aviso visual no card (badge amber quando <=7d, vermelho quando passa).
-- Nao move o card sozinho.
--
-- A v1 da feature (commits 92fa783c + a1b65cd5) usava threshold global
-- e movia cards automaticamente; foi removida no PR #38. A v2 e sticky.
-- =====================================================================

BEGIN;

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS concierge_futuro_em TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.tarefas.concierge_futuro_em IS
  'Sticky flag do kanban Concierge: NULL = fluxo normal, preenchido = coluna "Futuro". A data e prazo planejado (so aviso visual, nao move o card).';

CREATE INDEX IF NOT EXISTS idx_tarefas_concierge_futuro_em
  ON public.tarefas (concierge_futuro_em)
  WHERE concierge_futuro_em IS NOT NULL;

COMMIT;
