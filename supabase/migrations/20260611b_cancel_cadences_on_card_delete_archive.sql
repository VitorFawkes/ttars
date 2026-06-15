-- Comportamento PADRÃO da plataforma: card excluído (lixeira) ou arquivado
-- → TODAS as cadências dele param na hora.
--
-- Antes, uma cadência no meio de uma espera ia até o fim e mandava mensagem
-- pra card excluído/arquivado; os gatilhos pendentes na fila de entrada também
-- executavam. Este trigger cancela tudo no momento do soft-delete/arquivamento
-- (restaurar o card NÃO reativa as cadências — reaplicar manualmente se preciso).
--
-- Camadas complementares (mesma leva, 11/06/2026):
-- - cadence-engine executeStep: cancela instância se card deleted/archived/perdido
--   (cobre também marcação de perdido, que não passa por este trigger)
-- - cadence-engine processEntryQueue: cancela item de entrada de card morto
-- - fn_enqueue_temporal_events (20260611a): não enfileira card excluído/arquivado

CREATE OR REPLACE FUNCTION public.cancel_cadences_on_card_dead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  -- Só age na TRANSIÇÃO para excluído/arquivado (não em updates subsequentes)
  IF (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN
    v_reason := 'card_deleted';
  ELSIF (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL) THEN
    v_reason := 'card_archived';
  ELSE
    RETURN NEW;
  END IF;

  -- Cancela passos pendentes das instâncias ativas (antes de mudar o status
  -- das instâncias, pra cláusula de status ainda enxergá-las)
  UPDATE public.cadence_queue q
     SET status = 'cancelled'
    FROM public.cadence_instances i
   WHERE q.instance_id = i.id
     AND i.card_id = NEW.id
     AND i.status IN ('active', 'waiting_task', 'paused')
     AND q.status IN ('pending', 'processing');

  -- Cancela as instâncias ativas
  UPDATE public.cadence_instances
     SET status = 'cancelled',
         cancelled_at = NOW(),
         cancelled_reason = v_reason
   WHERE card_id = NEW.id
     AND status IN ('active', 'waiting_task', 'paused');

  -- Cancela gatilhos pendentes na fila de entrada
  UPDATE public.cadence_entry_queue
     SET status = 'cancelled',
         processed_at = NOW(),
         last_error = v_reason
   WHERE card_id = NEW.id
     AND status = 'pending';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_cadences_on_card_dead ON public.cards;
CREATE TRIGGER trg_cancel_cadences_on_card_dead
  AFTER UPDATE OF deleted_at, archived_at ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_cadences_on_card_dead();
