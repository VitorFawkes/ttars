-- ============================================================================
-- M5 housekeeping — wsdr_buffer_claim APAGA a linha ao reivindicar (sem lixo)
-- Antes: ao reivindicar, zerava messages='[]' e deixava a linha órfã acumulando.
-- Agora: DELETE da linha. O próximo append recria via INSERT ... ON CONFLICT.
-- Sem cron, sem lixo. Recriação fiel de 20260531f; ÚNICA mudança: DELETE no lugar do UPDATE.
-- (Rule #5: grep confirmou que 20260531f é a única definição anterior.)
-- ============================================================================

CREATE OR REPLACE FUNCTION wsdr_buffer_claim(
  p_org_id UUID, p_agent_slug TEXT, p_contact_phone TEXT, p_seq INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INT; v_text TEXT;
BEGIN
  SELECT jsonb_array_length(messages) INTO v_count
  FROM wsdr_message_buffer
  WHERE org_id=p_org_id AND agent_slug=p_agent_slug AND contact_phone=p_contact_phone
  FOR UPDATE;
  IF v_count IS NULL OR v_count <> p_seq THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false);
  END IF;
  SELECT string_agg(value, E'\n') INTO v_text
  FROM wsdr_message_buffer b, jsonb_array_elements_text(b.messages) AS value
  WHERE b.org_id=p_org_id AND b.agent_slug=p_agent_slug AND b.contact_phone=p_contact_phone;
  DELETE FROM wsdr_message_buffer
   WHERE org_id=p_org_id AND agent_slug=p_agent_slug AND contact_phone=p_contact_phone;
  RETURN jsonb_build_object('ok', true, 'claimed', true, 'text', COALESCE(v_text,''), 'count', v_count);
END $$;

COMMENT ON FUNCTION wsdr_buffer_claim IS 'Sofia debounce: reivindica o buffer se seq estável (last-writer-wins), devolve texto concatenado e APAGA a linha. Org-safe.';

-- Limpeza única do lixo já acumulado por versões anteriores (linhas vazias).
DELETE FROM wsdr_message_buffer WHERE messages = '[]'::jsonb OR messages IS NULL;
