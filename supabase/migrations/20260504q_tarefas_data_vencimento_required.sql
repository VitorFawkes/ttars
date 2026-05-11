-- ============================================================================
-- MIGRATION: tarefas.data_vencimento — torna obrigatório
-- Date: 2026-05-04
--
-- Motivação: o badge "Sem próxima tarefa" no header do card vinha aparecendo
-- mesmo com tarefa aberta porque o frontend não tratava task sem data.
-- Decisão do produto: toda tarefa DEVE ter data de vencimento.
--
-- Estratégia:
-- 1) Backfill: tarefas SEM data ganham NOW() + 5 dias.
--    Tarefas com data ficam INTOCADAS (filtro WHERE data_vencimento IS NULL).
-- 2) Trigger BEFORE INSERT: garante que qualquer fonte (frontend, RPC, edge
--    function, n8n, automação) que esqueça de passar a data ganhe o default
--    de 5 dias. Cobre INSERT com NULL explícito também.
-- 3) NOT NULL constraint: blinda a coluna.
-- ============================================================================

BEGIN;

-- 1. Backfill: só linhas SEM data ganham +5 dias. Linhas com data não mudam.
UPDATE tarefas
   SET data_vencimento = (NOW() + INTERVAL '5 days')
 WHERE data_vencimento IS NULL;

-- 2. Trigger BEFORE INSERT preenche data quando ausente
CREATE OR REPLACE FUNCTION public.tarefas_default_data_vencimento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.data_vencimento IS NULL THEN
    NEW.data_vencimento := NOW() + INTERVAL '5 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tarefas_default_data_vencimento ON public.tarefas;

CREATE TRIGGER trg_tarefas_default_data_vencimento
BEFORE INSERT ON public.tarefas
FOR EACH ROW
EXECUTE FUNCTION public.tarefas_default_data_vencimento();

-- 3. NOT NULL constraint (após backfill + trigger, é seguro)
ALTER TABLE public.tarefas
  ALTER COLUMN data_vencimento SET NOT NULL;

COMMIT;
