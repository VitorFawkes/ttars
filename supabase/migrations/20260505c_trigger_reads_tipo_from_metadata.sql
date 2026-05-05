-- =====================================================================
-- 20260505c: trigger lê tipo_concierge e categoria do metadata da tarefa.
--
-- Cenário: ao criar a tarefa pelo SmartTaskModal com responsável do time
-- Concierge, a tela exige que o operador escolha o tipo (Oferta/Reserva/
-- Suporte/Operacional). Esse valor é gravado em `tarefas.metadata`:
--   metadata = { ..., tipo_concierge: 'oferta', categoria_concierge: 'transfer' }
--
-- O trigger passa a ler esses campos quando presentes (em INSERT) e,
-- na falta, mantém os defaults atuais ('operacional' / 'outro').
--
-- O trigger continua disparando em INSERT e UPDATE OF responsavel_id
-- (20260505b). No caminho UPDATE — quando o planner reatribui uma tarefa
-- existente — não há tela perguntando tipo, então o default 'operacional'
-- é aplicado e o concierge pode editar depois pelo modal de atendimento.
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

  -- Defensivo: ambientes sem o módulo Concierge instalado (ex: staging
  -- defasado, branches de teste) não devem quebrar inserts de tarefa.
  IF to_regclass('public.atendimentos_concierge') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Já tem atendimento (ex: criado pelo cadence-engine antes deste trigger)
  IF EXISTS (
    SELECT 1 FROM atendimentos_concierge WHERE tarefa_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Responsável é concierge? (identificador estável: teams.name)
  SELECT TRUE INTO v_is_concierge
  FROM profiles p
  JOIN teams t ON t.id = p.team_id
  WHERE p.id = NEW.responsavel_id
    AND LOWER(t.name) = 'concierge'
  LIMIT 1;

  IF NOT COALESCE(v_is_concierge, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Ler tipo e categoria do metadata, se vieram da tela.
  v_tipo := COALESCE(NEW.metadata->>'tipo_concierge', 'operacional');
  v_categoria := COALESCE(NEW.metadata->>'categoria_concierge', 'outro');

  -- Validar tipo (defesa contra metadata corrompido).
  IF v_tipo NOT IN ('oferta', 'reserva', 'suporte', 'operacional') THEN
    v_tipo := 'operacional';
  END IF;

  -- Categoria é texto livre na tabela (sem CHECK), mas ainda assim
  -- protegemos contra string vazia.
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
