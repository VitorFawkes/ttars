-- Trigger independente: sempre que webhook Calendly bate com um card existente,
-- atualiza data_reuniao + meeting_link + event_name no produto_data — mesmo
-- quando o workspace NÃO tem automação configurada.
--
-- Separado do trigger de automação (process_cadence_entry_on_calendly_invitee)
-- pra não acoplar atualização do campo a existência de regras.

CREATE OR REPLACE FUNCTION sync_card_meeting_data_from_calendly()
RETURNS TRIGGER AS $fn$
DECLARE
  v_extra JSONB;
BEGIN
  -- Só age em invitee.created com match resolvido pela edge function
  IF NEW.event_type <> 'invitee.created' THEN
    RETURN NEW;
  END IF;
  IF NEW.card_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_extra := jsonb_build_object(
    'data_reuniao', NEW.event_start_time::text,
    'calendly_meeting_link', NEW.meeting_join_url,
    'calendly_event_name', NEW.event_name
  );

  UPDATE cards
  SET produto_data = coalesce(produto_data, '{}'::jsonb) || v_extra,
      updated_at = NOW()
  WHERE id = NEW.card_id;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_calendly_sync_meeting_data ON calendly_webhook_events;
CREATE TRIGGER trg_calendly_sync_meeting_data
  AFTER UPDATE OF processed_status ON calendly_webhook_events
  FOR EACH ROW
  WHEN (NEW.processed_status = 'success'
        AND OLD.processed_status IS DISTINCT FROM 'success')
  EXECUTE FUNCTION sync_card_meeting_data_from_calendly();

COMMENT ON FUNCTION sync_card_meeting_data_from_calendly() IS
  'Atualiza cards.produto_data com data_reuniao quando webhook Calendly bate com card existente. Independente de automação.';
