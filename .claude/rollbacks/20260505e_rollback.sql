-- =====================================================================
-- ROLLBACK da migration 20260505e_trigger_skips_cadence_metadata.sql
--
-- Volta a função do trigger pra versão de 20260505c (que NÃO tinha a
-- guarda de "pular se metadata é de cadência/automação"). Ressuscita o
-- bug de race condition entre o trigger e o cadence-engine — só use se
-- detectar regressão maior na nova lógica.
--
-- O rollback NÃO desfaz o backfill: linhas que foram migradas de
-- 'manual' → 'cadencia' permanecem como 'cadencia' (são dados corretos,
-- não há porque voltar pro estado errado).
--
-- Aplica via:
--   bash .claude/hooks/promote-to-prod.sh .claude/rollbacks/20260505e_rollback.sql
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
  IF NEW.responsavel_id IS NULL THEN RETURN NEW; END IF;
  IF to_regclass('public.atendimentos_concierge') IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM atendimentos_concierge WHERE tarefa_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT TRUE INTO v_is_concierge
  FROM profiles p JOIN teams t ON t.id = p.team_id
  WHERE p.id = NEW.responsavel_id AND LOWER(t.name) = 'concierge'
  LIMIT 1;

  IF NOT COALESCE(v_is_concierge, FALSE) THEN RETURN NEW; END IF;

  v_tipo := COALESCE(NEW.metadata->>'tipo_concierge', 'operacional');
  v_categoria := COALESCE(NEW.metadata->>'categoria_concierge', 'outro');
  IF v_tipo NOT IN ('oferta','reserva','suporte','operacional') THEN v_tipo := 'operacional'; END IF;
  IF v_categoria IS NULL OR length(trim(v_categoria)) = 0 THEN v_categoria := 'outro'; END IF;

  INSERT INTO atendimentos_concierge (tarefa_id, card_id, tipo_concierge, categoria, source)
  VALUES (NEW.id, NEW.card_id, v_tipo, v_categoria, 'manual');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION trg_tarefas_auto_create_concierge_atendimento() FROM PUBLIC;

COMMIT;
