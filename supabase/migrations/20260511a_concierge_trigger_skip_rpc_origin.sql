-- =====================================================================
-- 20260511a: trigger AFTER INSERT em `tarefas` precisa pular quando a
-- tarefa foi criada pelo RPC `rpc_criar_atendimento_concierge`.
--
-- Bug: o RPC insere primeiro em `tarefas` (marcando metadata.origem='concierge')
-- e logo em seguida insere em `atendimentos_concierge` com os valores
-- escolhidos pelo usuário (tipo, categoria, source='manual', valor, etc).
-- Mas o trigger AFTER INSERT dispara entre os dois statements e já cria
-- um `atendimentos_concierge` com defaults — o segundo INSERT do RPC então
-- viola o UNIQUE(tarefa_id) e a criação falha:
--
--   duplicate key value violates unique constraint
--   "atendimentos_concierge_tarefa_id_key"
--
-- Solução: o trigger detecta a marca `metadata.origem='concierge'` que o
-- RPC já coloca (ver 20260427c, linha 72) e pula. Quem cria o atendimento
-- nesse caminho é o próprio RPC, com os valores corretos do formulário.
--
-- Outros caminhos (tarefa avulsa atribuída a um concierge, sem passar pelo
-- RPC) continuam sendo cobertos pelo trigger.
--
-- Esta migration recria a function inteira em cima da versão atual
-- (20260505e_trigger_skips_cadence_metadata) — adicionar a checagem na
-- mesma cláusula IF preserva todas as regras anteriores.
-- =====================================================================

BEGIN;

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

  -- Já tem atendimento (raro, mas possível)
  IF EXISTS (
    SELECT 1 FROM atendimentos_concierge WHERE tarefa_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Pulamos se a tarefa veio de cadência, automação OU do RPC do concierge.
  -- O motor responsável já cuida do atendimento explícito com os valores
  -- corretos (source, tipo, categoria, payload).
  IF NEW.metadata IS NOT NULL AND (
       NEW.metadata->>'origin' IN ('cadence','cadencia','automation','automacao','event_trigger')
       OR NEW.metadata->>'origem' = 'concierge'
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

COMMIT;
