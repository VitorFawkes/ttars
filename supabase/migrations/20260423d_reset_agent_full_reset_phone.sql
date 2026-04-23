-- ============================================================================
-- MIGRATION: expande reset_agent_conversations_with_phone para full reset
-- Date: 2026-04-23
--
-- Contexto: na versão anterior o RPC apagava só conversa+memória do agente IA,
-- mas o NOME do contato continuava em `contatos.nome` e as mensagens do canal
-- em `whatsapp_messages`. Então o agente, na conversa seguinte, ainda chamava
-- o lead pelo nome ("Oi Vitor!") e o histórico anterior aparecia no CRM.
-- Pra teste do zero isso não serve.
--
-- Agora o RPC faz reset completo do que está associado ao telefone:
--   1. Conversa e memória IA (do agente informado): turns, state, conversations,
--      message_buffer, outbound_queue
--   2. Mensagens do WhatsApp: apaga whatsapp_messages com sender_phone do alvo
--      (ambas inbound e outbound desse número)
--   3. Contatos: resetar nome/sobrenome/email/cpf/passaporte/data_nascimento
--      para um estado neutro ("Cliente"/NULL). NÃO deleta o contato (quebraria
--      FKs de cards reais que possam estar vinculados).
--   4. Cards: limpa ai_resumo e ai_contexto dos cards cuja pessoa_principal é
--      um dos contatos alvos — a IA começa do zero sem carregar resumo antigo.
--
-- NÃO apaga:
--   - Os cards em si (dados de negócio)
--   - Outros vínculos (cards_contatos, activities) — são histórico do CRM
--
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

  -- Validar que o agente pertence à org do requester
  SELECT org_id INTO v_agent_org FROM ai_agents WHERE id = p_agent_id;
  IF v_agent_org IS NULL THEN
    RAISE EXCEPTION 'Agente não encontrado';
  END IF;
  IF v_org_id IS NOT NULL AND v_agent_org <> v_org_id THEN
    RAISE EXCEPTION 'Agente não pertence à sua organização';
  END IF;

  -- Normalizar telefone: só dígitos. Gerar tbm versão sem DDI 55 pra casar
  -- com whatsapp_messages.sender_phone que às vezes vem em forma encurtada.
  v_phone_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  v_phone_noddi  := regexp_replace(v_phone_digits, '^55', '');

  -- Resolver contatos por telefone (matches com e sem DDI 55)
  SELECT ARRAY_AGG(DISTINCT id) INTO v_contact_ids
    FROM contatos
   WHERE regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_digits
      OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = v_phone_noddi
      OR (length(v_phone_digits) >= 10
          AND regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ('55' || v_phone_noddi));

  IF v_contact_ids IS NOT NULL AND array_length(v_contact_ids, 1) > 0 THEN
    -- 1. Conversas IA do agente com esses contatos
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

    -- 2. Fila outbound do agente pra esses contatos
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

    -- 3. Mensagens WhatsApp do canal — por sender_phone e por contact_id.
    --    Apaga ambas inbound e outbound pra zerar o histórico visível no CRM.
    DELETE FROM whatsapp_messages
     WHERE contact_id = ANY(v_contact_ids);
    GET DIAGNOSTICS v_messages_deleted = ROW_COUNT;

    -- 4. Cards com pessoa_principal em v_contact_ids: limpar memória da IA.
    --    NÃO apagar o card (dado de negócio). Só limpa ai_resumo/ai_contexto
    --    que é onde a IA materializa o que "sabe" sobre o lead.
    UPDATE cards
       SET ai_resumo = NULL,
           ai_contexto = NULL,
           updated_at = NOW()
     WHERE pessoa_principal_id = ANY(v_contact_ids)
       AND org_id = v_agent_org;
    GET DIAGNOSTICS v_cards_cleared = ROW_COUNT;

    -- 5. Contatos: resetar nome e dados pessoais pra que o agente não os carregue
    --    na próxima conversa. Mantém telefone e org_id (senão perde vínculo).
    UPDATE contatos
       SET nome = 'Cliente',
           sobrenome = NULL,
           email = NULL,
           cpf = NULL,
           passaporte = NULL,
           data_nascimento = NULL,
           updated_at = NOW()
     WHERE id = ANY(v_contact_ids);
    GET DIAGNOSTICS v_contacts_cleared = ROW_COUNT;
  END IF;

  -- 6. Buffer de debounce pendente — independente de contato (por telefone)
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

COMMENT ON FUNCTION reset_agent_conversations_with_phone IS
  'Full reset de tudo relacionado a um telefone para um agente específico: conversas IA + memória + buffer + mensagens WhatsApp + dados pessoais do contato + ai_resumo/ai_contexto dos cards. Mantém cards e vínculos (cards_contatos, activities). Usado pelo botão "Zerar conversa" no editor do agente.';

GRANT EXECUTE ON FUNCTION reset_agent_conversations_with_phone(UUID, TEXT) TO authenticated;
