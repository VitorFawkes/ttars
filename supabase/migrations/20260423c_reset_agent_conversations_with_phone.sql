-- ============================================================================
-- MIGRATION: reset_agent_conversations_with_phone
-- Date: 2026-04-23
--
-- RPC para zerar histórico de conversas + memória de um agente IA com
-- contatos de um telefone específico. Usada pelo botão "Resetar conversa
-- com este número" no editor do agente — permite que admin teste o agente
-- do zero sem precisar mudar de número.
--
-- Escopo (por agent_id + contact por telefone):
--   - ai_conversation_turns (memória de turnos)
--   - ai_conversation_state (variáveis extraídas, resumo, tópico)
--   - ai_conversations (conversa em si)
--   - ai_message_buffer (buffer de debounce pendente)
--   - ai_outbound_queue (fila outbound pendente/processada)
--
-- NÃO apaga whatsapp_messages (é histórico do canal, compartilhado) nem
-- contatos/cards (dados de negócio).
--
-- Validações:
--   - Agente precisa pertencer à requesting_org_id() (defesa em profundidade)
--   - Só afeta conversas onde current_agent_id OU primary_agent_id = p_agent_id
--   - Retorna contagem do que foi apagado
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
  v_contact_ids UUID[];
  v_conversation_ids UUID[];
  v_turns_deleted INTEGER := 0;
  v_state_deleted INTEGER := 0;
  v_convs_deleted INTEGER := 0;
  v_buffer_deleted INTEGER := 0;
  v_outbound_deleted INTEGER := 0;
BEGIN
  v_org_id := requesting_org_id();

  IF p_agent_id IS NULL THEN
    RAISE EXCEPTION 'p_agent_id obrigatório';
  END IF;

  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'p_phone obrigatório';
  END IF;

  -- Validar que o agente pertence à org do requester (defesa em profundidade
  -- sobre RLS — o RPC é SECURITY DEFINER e bypassa policies).
  SELECT org_id INTO v_agent_org FROM ai_agents WHERE id = p_agent_id;
  IF v_agent_org IS NULL THEN
    RAISE EXCEPTION 'Agente não encontrado';
  END IF;
  IF v_org_id IS NOT NULL AND v_agent_org <> v_org_id THEN
    RAISE EXCEPTION 'Agente não pertence à sua organização';
  END IF;

  -- Normalizar telefone: só dígitos. Aceita formatos "5511964293533",
  -- "(11) 96429-3533", "+55 11 96429 3533" etc.
  v_phone_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');

  -- Resolver contatos pelo telefone. Compara formas com e sem código do país.
  SELECT ARRAY_AGG(DISTINCT id) INTO v_contact_ids
    FROM contatos
   WHERE regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_digits
      OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = regexp_replace('55' || v_phone_digits, '^5555', '55')
      OR (length(v_phone_digits) >= 10
          AND regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = regexp_replace(v_phone_digits, '^55', ''));

  IF v_contact_ids IS NULL OR array_length(v_contact_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'contacts_found', 0,
      'conversations_deleted', 0,
      'message', 'Nenhum contato com esse telefone.'
    );
  END IF;

  -- Conversas do agente com esses contatos (inclui status arquivado/waiting).
  SELECT ARRAY_AGG(id) INTO v_conversation_ids
    FROM ai_conversations
   WHERE contact_id = ANY(v_contact_ids)
     AND (current_agent_id = p_agent_id OR primary_agent_id = p_agent_id);

  IF v_conversation_ids IS NOT NULL AND array_length(v_conversation_ids, 1) > 0 THEN
    -- 1. Apagar turns (memória de mensagens)
    DELETE FROM ai_conversation_turns WHERE conversation_id = ANY(v_conversation_ids);
    GET DIAGNOSTICS v_turns_deleted = ROW_COUNT;

    -- 2. Apagar state (variáveis extraídas, resumo, tópico atual)
    DELETE FROM ai_conversation_state WHERE conversation_id = ANY(v_conversation_ids);
    GET DIAGNOSTICS v_state_deleted = ROW_COUNT;

    -- 3. Apagar a conversa em si
    DELETE FROM ai_conversations WHERE id = ANY(v_conversation_ids);
    GET DIAGNOSTICS v_convs_deleted = ROW_COUNT;
  END IF;

  -- 4. Buffer de debounce pendente pro telefone (não é por agente — é por linha
  --    + telefone. Como o admin quer zerar tudo, limpa o que está pendente).
  DELETE FROM ai_message_buffer
   WHERE regexp_replace(COALESCE(contact_phone, ''), '[^0-9]', '', 'g') = v_phone_digits
      OR regexp_replace(COALESCE(contact_phone, ''), '[^0-9]', '', 'g') = regexp_replace(v_phone_digits, '^55', '');
  GET DIAGNOSTICS v_buffer_deleted = ROW_COUNT;

  -- 5. Fila outbound — só linhas desse agente pra esses contatos
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

  RETURN jsonb_build_object(
    'success', true,
    'contacts_found', array_length(v_contact_ids, 1),
    'conversations_deleted', v_convs_deleted,
    'turns_deleted', v_turns_deleted,
    'state_deleted', v_state_deleted,
    'buffer_deleted', v_buffer_deleted,
    'outbound_deleted', v_outbound_deleted
  );
END;
$$;

COMMENT ON FUNCTION reset_agent_conversations_with_phone IS
  'Zera histórico + memória de um agente IA com contatos de um telefone. Usado no botão "Resetar conversa" do editor do agente para testes. NÃO apaga whatsapp_messages/contatos/cards.';

GRANT EXECUTE ON FUNCTION reset_agent_conversations_with_phone(UUID, TEXT) TO authenticated;
