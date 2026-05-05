-- =====================================================================
-- 20260505e: trigger pula quando a tarefa já veio de cadência/automação.
--
-- Bug introduzido em 20260505a/b/c: o trigger AFTER INSERT em `tarefas`
-- corre antes do cadence-engine inserir o atendimento explícito, e
-- preempta com source='manual'. O cadence-engine então tenta inserir e
-- falha silenciosamente no UNIQUE de tarefa_id, deixando o atendimento
-- com source errado (e sem cadence_step_id, origem_descricao, payload).
--
-- Sintoma confirmado em prod: 2 atendimentos com source='manual' cuja
-- tarefa tem `cadence_instance_id` na metadata.
--
-- Fix: o trigger detecta os sinais que o frontend já usa em
-- `useTasksList.deriveOrigem()` e pula. Quem cuida do atendimento nesses
-- casos é o motor responsável (cadence-engine, automações futuras).
-- =====================================================================

BEGIN;

-- 1. Substituir a função do trigger
CREATE OR REPLACE FUNCTION trg_tarefas_auto_create_concierge_atendimento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_concierge BOOLEAN := FALSE;
  v_tipo TEXT;
  v_categoria TEXT;
BEGIN
  -- Sem responsável = nada a fazer
  IF NEW.responsavel_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Defensivo: ambientes sem o módulo Concierge instalado
  IF to_regclass('public.atendimentos_concierge') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Já tem atendimento (ex: cadence-engine inseriu antes do trigger,
  -- raro mas possível dependendo da ordem)
  IF EXISTS (
    SELECT 1 FROM atendimentos_concierge WHERE tarefa_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Pulamos se a tarefa veio de cadência ou automação. O motor que criou
  -- a tarefa (cadence-engine, regras de auto-criação, etc) é responsável
  -- por inserir o atendimento com source='cadencia' + metadata específica
  -- (cadence_step_id, origem_descricao, payload). Se o trigger criasse
  -- aqui com defaults, perderíamos esses campos e o source ficaria errado.
  IF NEW.metadata IS NOT NULL AND (
       NEW.metadata->>'origin' IN ('cadence','cadencia','automation','automacao','event_trigger')
       OR NEW.metadata ? 'cadence_instance_id'
       OR NEW.metadata ? 'cadence_step_id'
       OR NEW.metadata ? 'automation_rule_id'
     ) THEN
    RETURN NEW;
  END IF;

  -- Responsável é concierge?
  SELECT TRUE INTO v_is_concierge
  FROM profiles p
  JOIN teams t ON t.id = p.team_id
  WHERE p.id = NEW.responsavel_id
    AND LOWER(t.name) = 'concierge'
  LIMIT 1;

  IF NOT COALESCE(v_is_concierge, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Defaults para criação humana sem metadata específica
  v_tipo := COALESCE(NEW.metadata->>'tipo_concierge', 'operacional');
  v_categoria := COALESCE(NEW.metadata->>'categoria_concierge', 'outro');

  IF v_tipo NOT IN ('oferta', 'reserva', 'suporte', 'operacional') THEN
    v_tipo := 'operacional';
  END IF;
  IF v_categoria IS NULL OR length(trim(v_categoria)) = 0 THEN
    v_categoria := 'outro';
  END IF;

  INSERT INTO atendimentos_concierge (
    tarefa_id, card_id, tipo_concierge, categoria, source
  ) VALUES (
    NEW.id, NEW.card_id, v_tipo, v_categoria, 'manual'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION trg_tarefas_auto_create_concierge_atendimento() FROM PUBLIC;

-- 2. Backfill: corrigir atendimentos existentes que ficaram com source='manual'
-- mas vieram de cadência/automação.
UPDATE atendimentos_concierge a
SET source = 'cadencia'
FROM tarefas t
WHERE a.tarefa_id = t.id
  AND a.source = 'manual'
  AND t.metadata IS NOT NULL
  AND (
    t.metadata->>'origin' IN ('cadence','cadencia','automation','automacao','event_trigger')
    OR t.metadata ? 'cadence_instance_id'
    OR t.metadata ? 'cadence_step_id'
    OR t.metadata ? 'automation_rule_id'
  );

COMMIT;
