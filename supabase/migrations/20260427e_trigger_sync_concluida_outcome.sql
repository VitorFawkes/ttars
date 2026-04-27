-- =====================================================================
-- Módulo Concierge — Marco 1 (Fundação)
-- 20260427e: trigger pra sincronizar tarefas.concluida → atendimentos_concierge.outcome_em
--
-- Quando alguém marca a tarefa como feita em qualquer UI (aba Tarefas do card,
-- página Tarefas, view Meu Dia), o complemento atendimento_concierge ganha
-- outcome_em automaticamente. Sem isso, o atendimento ficaria "fantasmado"
-- (tarefa fechada mas atendimento aberto).
--
-- Não força um outcome específico — deixa NULL pra concierge marcar manualmente
-- depois (aceito/recusado/feito) se quiser. Mas garante que outcome_em existe
-- pra refletir "fechado".
-- =====================================================================

CREATE OR REPLACE FUNCTION trg_tarefas_sync_concierge_outcome()
RETURNS TRIGGER AS $$
BEGIN
  -- Caso 1: tarefa virou concluida → marca outcome_em do atendimento (se ainda null)
  IF NEW.concluida = true AND (OLD.concluida = false OR OLD.concluida IS NULL) THEN
    UPDATE atendimentos_concierge
    SET outcome_em = COALESCE(outcome_em, now()),
        outcome_por = COALESCE(outcome_por, NEW.concluido_por, auth.uid()),
        -- Se outcome ainda não foi setado, marca como 'feito' por default
        outcome = COALESCE(outcome,
          CASE
            WHEN NEW.outcome IS NOT NULL THEN NEW.outcome
            ELSE 'feito'
          END
        )
    WHERE tarefa_id = NEW.id AND outcome_em IS NULL;
  END IF;

  -- Caso 2: tarefa foi reaberta (concluida true → false) → limpa outcome do atendimento
  IF NEW.concluida = false AND OLD.concluida = true THEN
    UPDATE atendimentos_concierge
    SET outcome = NULL,
        outcome_em = NULL,
        outcome_por = NULL
    WHERE tarefa_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tarefas_sync_concierge_outcome ON tarefas;
CREATE TRIGGER tarefas_sync_concierge_outcome
  AFTER UPDATE OF concluida ON tarefas
  FOR EACH ROW EXECUTE FUNCTION trg_tarefas_sync_concierge_outcome();

COMMENT ON FUNCTION trg_tarefas_sync_concierge_outcome IS
  'Sincroniza tarefas.concluida → atendimentos_concierge.outcome_em.
   Marcar tarefa como feita em qualquer UI atualiza o atendimento automaticamente.';
