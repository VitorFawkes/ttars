-- =====================================================================
-- 20260505a — Auto-create atendimentos_concierge quando uma tarefa
-- é criada com um concierge como responsável.
--
-- Step 1: surface card-created tasks in the Concierge tab.
-- Scope: AFTER INSERT em tarefas. UPDATE/DELETE ficam fora deste passo.
--
-- "Concierge" = profiles.team_id → teams.name ILIKE 'concierge'
-- (a fase do time é 'pos_venda' em todos os workspaces; o identificador
--  do papel é o NOME do time, conforme convenção de
--  20260326_add_concierge_nome_to_view.sql, que cria o time "Concierge"
--  sob a fase pos_venda. Não existe pipeline_phases.slug='concierge').
--
-- Defaults: tipo_concierge='operacional', categoria='outro', source='manual'.
-- Usuário pode editar tipo/categoria depois pelo modal do atendimento.
--
-- Idempotente: se já existir um atendimento_concierge pra essa tarefa
-- (path do cadence-engine), o trigger sai sem fazer nada.
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
  -- Convenção: time "Concierge" sob a fase pos_venda.
  SELECT TRUE INTO v_is_concierge
  FROM profiles p
  JOIN teams t ON t.id = p.team_id
  WHERE p.id = NEW.responsavel_id
    AND LOWER(t.name) = 'concierge'
  LIMIT 1;

  IF NOT COALESCE(v_is_concierge, FALSE) THEN
    RETURN NEW;
  END IF;

  -- card_id é NOT NULL e sem default em atendimentos_concierge.
  -- org_id será sobrescrito pelo trigger BEFORE INSERT existente
  -- (trg_atend_concierge_force_org_consistency em 20260427a).
  INSERT INTO atendimentos_concierge (
    tarefa_id, card_id, tipo_concierge, categoria, source
  ) VALUES (
    NEW.id, NEW.card_id, 'operacional', 'outro', 'manual'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION trg_tarefas_auto_create_concierge_atendimento() FROM PUBLIC;

DROP TRIGGER IF EXISTS tarefas_auto_create_concierge_atendimento ON tarefas;
CREATE TRIGGER tarefas_auto_create_concierge_atendimento
  AFTER INSERT ON tarefas
  FOR EACH ROW
  EXECUTE FUNCTION trg_tarefas_auto_create_concierge_atendimento();

COMMENT ON FUNCTION trg_tarefas_auto_create_concierge_atendimento() IS
  'Cria atendimentos_concierge automaticamente quando uma tarefa é inserida com responsavel_id de um usuário do time concierge. INSERT-only por design (UPDATE/DELETE de responsavel_id ficam para passo 2).';

COMMIT;
