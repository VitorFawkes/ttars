-- reset_agent_test_conversation v6 (08/05/2026)
--
-- Fix de v5: hard delete em cards estourava timeout (FK cascade em
-- financial_items, activities, briefings, tasks etc — 31 cards × N filhos).
-- Volta pra soft delete em cards (deleted_at = now()) — rapido, e o router
-- ja filtra por deleted_at IS NULL ao criar conversa nova.
--
-- Mantem hard delete pras tabelas que sao 100% lixo de teste:
--   ai_conversations, ai_conversation_state, ai_conversation_turns,
--   ai_message_buffer (todas as entries do contato).
--
-- Preserva todas as correcoes incrementais:
--   v1: whitelist + agent + phone check
--   v2: TODOS os cards do contato (nao so do produto)
--   v3+v4: zera nome/email com placeholder "Lead"
--   v5 (revertida em cards): hard delete em conversas/turns/state/buffer
--   v6 (esta): cards volta pra soft delete

CREATE OR REPLACE FUNCTION public.reset_agent_test_conversation(p_agent_id uuid, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_whitelist TEXT[];
  v_normalized TEXT;
  v_contact_id UUID;
  v_conv_ids UUID[];
  v_deleted_conversations INT := 0;
  v_deleted_turns INT := 0;
  v_deleted_state INT := 0;
  v_soft_deleted_cards INT := 0;
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
      'deleted_conversations', 0,
      'deleted_turns', 0,
      'deleted_state', 0,
      'soft_deleted_cards', 0,
      'deleted_buffer', 0,
      'contact_cleared', false
    );
  END IF;

  -- Coleta conv_ids antes de deletar
  SELECT ARRAY_AGG(id) INTO v_conv_ids
    FROM ai_conversations
   WHERE primary_agent_id = p_agent_id
     AND contact_id = v_contact_id;

  -- Hard delete em ordem (children -> parents)
  IF v_conv_ids IS NOT NULL AND array_length(v_conv_ids, 1) > 0 THEN
    DELETE FROM ai_conversation_state WHERE conversation_id = ANY(v_conv_ids);
    GET DIAGNOSTICS v_deleted_state = ROW_COUNT;

    DELETE FROM ai_conversation_turns WHERE conversation_id = ANY(v_conv_ids);
    GET DIAGNOSTICS v_deleted_turns = ROW_COUNT;

    DELETE FROM ai_conversations WHERE id = ANY(v_conv_ids);
    GET DIAGNOSTICS v_deleted_conversations = ROW_COUNT;
  END IF;

  -- v2 preservada: soft-delete TODOS os cards do contato (qualquer produto)
  -- Soft em vez de hard pra evitar cascade explosion em financial_items,
  -- activities, briefings, tasks. Router filtra deleted_at IS NULL ao criar
  -- conversa nova, entao do ponto de vista da Estela e como se tivessem ido.
  UPDATE cards
     SET deleted_at = now(),
         updated_at = now()
   WHERE pessoa_principal_id = v_contact_id
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_soft_deleted_cards = ROW_COUNT;

  -- Buffer inteiro (processed + unprocessed)
  DELETE FROM ai_message_buffer
   WHERE contact_phone = v_normalized;
  GET DIAGNOSTICS v_deleted_buffer = ROW_COUNT;

  -- v3+v4 preservadas: zera nome/email com placeholder "Lead"
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
    'deleted_conversations', v_deleted_conversations,
    'deleted_turns', v_deleted_turns,
    'deleted_state', v_deleted_state,
    'soft_deleted_cards', v_soft_deleted_cards,
    'deleted_buffer', v_deleted_buffer,
    'contact_cleared', v_contact_cleared
  );
END;
$function$;

COMMENT ON FUNCTION public.reset_agent_test_conversation IS
  'v6 (08/05/2026): hard delete em conversations/state/turns/buffer (lixo puro de teste). Soft delete em cards (evita cascade explosion). whatsapp_messages preservado. So roda com whitelist+telefone validados.';
