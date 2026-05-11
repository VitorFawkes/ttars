-- ============================================================================
-- MIGRATION: reset usa nome='' (string vazia) em vez de 'Cliente' literal
-- Date: 2026-04-23
--
-- Bug observado 2026-04-23 14:57: a Estela respondeu "Oi, Cliente, tudo bem?"
-- O reset anterior setava contatos.nome='Cliente' como marcador neutro, mas a
-- IA lia isso como nome próprio. Fix: usar string vazia em vez de literal.
-- O router passa a tratar nome vazio como "desconhecido" e instrui a IA a
-- descobrir o nome na conversa, sem usar placeholder.
--
-- contatos.nome é NOT NULL então não dá pra usar NULL; string vazia respeita
-- o constraint e é detectável no runtime (trim().length === 0).
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_agent_conversations_with_phone(
  p_agent_id UUID,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_agent_org UUID;
  v_phone_digits TEXT;
  v_phone_noddi TEXT;
  v_contact_ids UUID[];
  v_conversation_ids UUID[];
  v_turns_deleted INTEGER := 0;
  v_state_deleted INTEGER := 0;
  v_convs_deleted INTEGER := 0;
  v_buffer_deleted INTEGER := 0;
  v_outbound_deleted INTEGER := 0;
  v_messages_deleted INTEGER := 0;
  v_contacts_cleared INTEGER := 0;
  v_cards_cleared INTEGER := 0;
BEGIN
  v_org_id := requesting_org_id();

  IF p_agent_id IS NULL THEN
    RAISE EXCEPTION 'p_agent_id obrigatório';
  END IF;

  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'p_phone obrigatório';
  END IF;

  SELECT org_id INTO v_agent_org FROM ai_agents WHERE id = p_agent_id;
  IF v_agent_org IS NULL THEN
    RAISE EXCEPTION 'Agente não encontrado';
  END IF;
  IF v_org_id IS NOT NULL AND v_agent_org <> v_org_id THEN
    RAISE EXCEPTION 'Agente não pertence à sua organização';
  END IF;

  v_phone_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  v_phone_noddi  := regexp_replace(v_phone_digits, '^55', '');

  SELECT ARRAY_AGG(DISTINCT id) INTO v_contact_ids
    FROM contatos
   WHERE regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_digits
      OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_noddi
      OR (length(v_phone_digits) >= 10
          AND regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ('55' || v_phone_noddi));

  IF v_contact_ids IS NOT NULL AND array_length(v_contact_ids, 1) > 0 THEN
    SELECT ARRAY_AGG(id) INTO v_conversation_ids
      FROM ai_conversations
     WHERE contact_id = ANY(v_contact_ids)
       AND (current_agent_id = p_agent_id OR primary_agent_id = p_agent_id);

    IF v_conversation_ids IS NOT NULL AND array_length(v_conversation_ids, 1) > 0 THEN
      DELETE FROM ai_conversation_turns WHERE conversation_id = ANY(v_conversation_ids);
      GET DIAGNOSTICS v_turns_deleted = ROW_COUNT;

      DELETE FROM ai_conversation_state WHERE conversation_id = ANY(v_conversation_ids);
      GET DIAGNOSTICS v_state_deleted = ROW_COUNT;

      DELETE FROM ai_conversations WHERE id = ANY(v_conversation_ids);
      GET DIAGNOSTICS v_convs_deleted = ROW_COUNT;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ai_outbound_queue'
         AND column_name = 'contato_id'
    ) THEN
      EXECUTE format(
        'DELETE FROM ai_outbound_queue WHERE agent_id = %L AND contato_id = ANY(%L)',
        p_agent_id, v_contact_ids
      );
      GET DIAGNOSTICS v_outbound_deleted = ROW_COUNT;
    END IF;

    DELETE FROM whatsapp_messages
     WHERE contact_id = ANY(v_contact_ids);
    GET DIAGNOSTICS v_messages_deleted = ROW_COUNT;

    UPDATE cards
       SET ai_resumo = NULL,
           ai_contexto = NULL,
           updated_at = NOW()
     WHERE pessoa_principal_id = ANY(v_contact_ids)
       AND org_id = v_agent_org;
    GET DIAGNOSTICS v_cards_cleared = ROW_COUNT;

    -- Contatos: nome='' (vazio), não 'Cliente'. Router detecta vazio como
    -- desconhecido e instrui o agente a descobrir o nome na conversa.
    UPDATE contatos
       SET nome = '',
           sobrenome = NULL,
           email = NULL,
           cpf = NULL,
           passaporte = NULL,
           data_nascimento = NULL,
           updated_at = NOW()
     WHERE id = ANY(v_contact_ids);
    GET DIAGNOSTICS v_contacts_cleared = ROW_COUNT;
  END IF;

  DELETE FROM ai_message_buffer
   WHERE regexp_replace(COALESCE(contact_phone, ''), '[^0-9]', '', 'g') = v_phone_digits
      OR regexp_replace(COALESCE(contact_phone, ''), '[^0-9]', '', 'g') = v_phone_noddi;
  GET DIAGNOSTICS v_buffer_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'contacts_found', COALESCE(array_length(v_contact_ids, 1), 0),
    'conversations_deleted', v_convs_deleted,
    'turns_deleted', v_turns_deleted,
    'state_deleted', v_state_deleted,
    'buffer_deleted', v_buffer_deleted,
    'outbound_deleted', v_outbound_deleted,
    'messages_deleted', v_messages_deleted,
    'contacts_cleared', v_contacts_cleared,
    'cards_cleared', v_cards_cleared
  );
END;
$$;

-- Corrigir contatos que já foram resetados com 'Cliente' literal — troca pra ''.
UPDATE contatos SET nome = '' WHERE nome = 'Cliente';
