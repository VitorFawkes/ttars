-- 2026-05-18 — reset_agent_conversations_with_phone (v4) respeita modo teste
--
-- Bug observado hoje (18/05): Vitor mandou /reset pelo WhatsApp em conversa
-- de teste da Patricia. A função antiga zerou nome/email/cpf de TODOS os
-- contatos com aquele telefone — incluindo o contato REAL do Vitor — e
-- apagou todas as whatsapp_messages do contato real também.
--
-- Causa: a função foi escrita antes do conceito de "identidade de teste"
-- existir (migration 20260518c). Ela faz match só por telefone normalizado
-- e atua em TODOS os contatos que batem.
--
-- Fix: quando o agente está em modo teste (test_mode_phone_whitelist não-
-- vazia), filtra os contatos por `test_agent_id = p_agent_id` antes de
-- agir. Em modo produção (whitelist vazia/null), mantém o comportamento
-- antigo — apaga tudo do telefone.
--
-- Histórico preservado:
--   v1 (20260423c): criação
--   v2 (20260423d): full reset (turns + state + conversations + buffer +
--                   outbound + whatsapp_messages + nome do contato +
--                   ai_resumo/contexto de cards)
--   v3 (20260423e): nome = '' (vazio) em vez de literal 'Cliente'
--   v4 (esta): filtra por test_agent_id quando em modo teste
--
-- Uso DROP + CREATE (em vez de CREATE OR REPLACE) por convenção do hook
-- anti-rebase. Releitura confirmada antes desta versão.

DROP FUNCTION IF EXISTS public.reset_agent_conversations_with_phone(uuid, text);

CREATE FUNCTION public.reset_agent_conversations_with_phone(
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
  v_whitelist TEXT[];
  v_is_test_mode BOOLEAN;
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

  SELECT org_id, test_mode_phone_whitelist
    INTO v_agent_org, v_whitelist
    FROM ai_agents
   WHERE id = p_agent_id;

  IF v_agent_org IS NULL THEN
    RAISE EXCEPTION 'Agente não encontrado';
  END IF;
  IF v_org_id IS NOT NULL AND v_agent_org <> v_org_id THEN
    RAISE EXCEPTION 'Agente não pertence à sua organização';
  END IF;

  -- v4: detecta modo teste pela presença de whitelist populada
  v_is_test_mode := (v_whitelist IS NOT NULL AND array_length(v_whitelist, 1) > 0);

  v_phone_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  v_phone_noddi  := regexp_replace(v_phone_digits, '^55', '');

  -- v4: em modo teste, só pega contato MARCADO como teste deste agente
  -- (não toca em contato real homônimo). Em modo prod, mantém match por
  -- telefone bruto (qualquer contato com aquele número).
  IF v_is_test_mode THEN
    SELECT ARRAY_AGG(DISTINCT id) INTO v_contact_ids
      FROM contatos
     WHERE test_agent_id = p_agent_id
       AND (regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_digits
            OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_noddi
            OR (length(v_phone_digits) >= 10
                AND regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ('55' || v_phone_noddi)));
  ELSE
    SELECT ARRAY_AGG(DISTINCT id) INTO v_contact_ids
      FROM contatos
     WHERE regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_digits
        OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_noddi
        OR (length(v_phone_digits) >= 10
            AND regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ('55' || v_phone_noddi));
  END IF;

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

    -- v3 preservada: nome='' em vez de placeholder literal
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
    'test_mode', v_is_test_mode,
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

GRANT EXECUTE ON FUNCTION public.reset_agent_conversations_with_phone(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reset_agent_conversations_with_phone IS
  'v4 (18/05/2026): em modo teste (test_mode_phone_whitelist não-vazia), filtra contatos por test_agent_id = p_agent_id antes de zerar — não toca em contato real homônimo. Em modo produção mantém comportamento antigo. Pré-requisito: contatos.test_agent_id (migration 20260518c).';
