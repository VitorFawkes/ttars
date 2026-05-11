-- ============================================================
-- MIGRATION: ai_message_buffer — auto-set org_id via trigger
-- Date: 2026-04-21
--
-- Bug: a coluna `org_id` tem `DEFAULT requesting_org_id()`. A edge function
-- whatsapp-webhook roda como service_role sem JWT → requesting_org_id()
-- retorna NULL → NOT NULL violation → INSERT falha silenciosamente
-- (webhook faz .catch(log) sem propagar). Buffer nunca populava.
--
-- Fix: BEFORE INSERT trigger busca org_id em whatsapp_linha_config via
-- phone_number_id quando a row chega sem org_id. Mesmo padrão do
-- auto_set_org_id_from_card documentado em memory/feedback_org_id_trigger_inserts.md
-- ============================================================

CREATE OR REPLACE FUNCTION auto_set_ai_message_buffer_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.phone_number_id IS NOT NULL THEN
    SELECT org_id INTO v_org_id
    FROM whatsapp_linha_config
    WHERE phone_number_id = NEW.phone_number_id
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ai_message_buffer: não foi possível resolver org_id a partir de phone_number_id=% (linha não encontrada em whatsapp_linha_config)', NEW.phone_number_id;
  END IF;

  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_message_buffer_auto_org_id ON ai_message_buffer;
CREATE TRIGGER trg_ai_message_buffer_auto_org_id
BEFORE INSERT ON ai_message_buffer
FOR EACH ROW
EXECUTE FUNCTION auto_set_ai_message_buffer_org_id();

COMMENT ON FUNCTION auto_set_ai_message_buffer_org_id() IS
  'Auto-resolve org_id para inserts vindos de edge functions sem JWT (whatsapp-webhook). Busca em whatsapp_linha_config via phone_number_id. Falha alto se linha não existir (melhor que silenciar).';
