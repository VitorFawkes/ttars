-- ============================================================================
-- MIGRATION: reset_agent_test_conversation v4 — fix NOT NULL no contatos.nome
-- Date: 2026-04-27
--
-- v3 falhou: contatos.nome é NOT NULL. Trocamos por placeholder neutro "Lead",
-- que o router (buildConversationContext) já trata como nome desconhecido
-- via contact_name_known check (nomes em ["cliente","lead","whatsapp",
-- "desconhecido"] = não conhecido).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_agent_test_conversation(
  p_agent_id UUID,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_whitelist TEXT[];
  v_normalized TEXT;
  v_contact_id UUID;
  v_archived_conversations INT := 0;
  v_deleted_cards INT := 0;
  v_deleted_buffer INT := 0;
  v_contact_cleared BOOLEAN := false;
BEGIN
  SELECT test_mode_phone_whitelist
    INTO v_whitelist
    FROM ai_agents
   WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agente % não encontrado', p_agent_id;
  END IF;

  IF v_whitelist IS NULL OR array_length(v_whitelist, 1) = 0 THEN
    RAISE EXCEPTION 'Agente sem whitelist — operação só permitida em agentes em modo de teste';
  END IF;

  v_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'Telefone vazio';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM unnest(v_whitelist) AS w(phone)
     WHERE regexp_replace(w.phone, '[^0-9]', '', 'g') = v_normalized
  ) THEN
    RAISE EXCEPTION 'Telefone % não está na whitelist do agente', v_normalized;
  END IF;

  SELECT id INTO v_contact_id
    FROM contatos
   WHERE telefone = v_normalized
   LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'no_contact_found',
      'archived_conversations', 0,
      'deleted_cards', 0,
      'deleted_buffer', 0,
      'contact_cleared', false
    );
  END IF;

  UPDATE ai_conversations
     SET status = 'archived',
         ended_at = COALESCE(ended_at, now()),
         updated_at = now()
   WHERE primary_agent_id = p_agent_id
     AND contact_id = v_contact_id
     AND status IN ('active', 'waiting');
  GET DIAGNOSTICS v_archived_conversations = ROW_COUNT;

  UPDATE cards
     SET deleted_at = now(),
         updated_at = now()
   WHERE pessoa_principal_id = v_contact_id
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_deleted_cards = ROW_COUNT;

  DELETE FROM ai_message_buffer
   WHERE contact_phone = v_normalized
     AND processed_at IS NULL;
  GET DIAGNOSTICS v_deleted_buffer = ROW_COUNT;

  -- Zera dados do contato pra teste limpo (mantém telefone como chave).
  -- nome é NOT NULL, usa placeholder "Lead" que o router trata como
  -- nome desconhecido via contact_name_known (lista: cliente/lead/whatsapp/desconhecido).
  UPDATE contatos
     SET nome = 'Lead',
         sobrenome = NULL,
         email = NULL,
         updated_at = now()
   WHERE id = v_contact_id;
  v_contact_cleared := true;

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', v_contact_id,
    'archived_conversations', v_archived_conversations,
    'deleted_cards', v_deleted_cards,
    'deleted_buffer', v_deleted_buffer,
    'contact_cleared', v_contact_cleared
  );
END;
$$;
