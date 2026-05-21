-- reset_agent_test_conversation v7 — só apaga cards/contato MARCADOS como teste
--
-- Mudanças vs v6 (2026-05-08):
--   - cards/contatos: filtra por test_agent_id = p_agent_id (introduzido em
--     migration 20260518c). Cards REAIS (test_agent_id IS NULL) ficam intocados
--     mesmo que o telefone bata na whitelist.
--   - Hard delete do contato de teste (mais simples que zerar nome — ele
--     existe só pra esse agente, na próxima mensagem o router cria de novo).
--
-- Histórico preservado de versões anteriores (cada uma corrigiu algo):
--   v1 (20260425h): validações de whitelist + telefone + arquivar conversas
--   v2 (20260427a): apagar TODOS cards do contato (não só do produto)
--   v3 (20260427b): zerar nome/email do contato pós-reset
--   v4 (20260427c): nome NOT NULL → usar placeholder "Lead"
--   v5 (20260508a): hard delete em conversations/state/turns/buffer
--   v6 (20260508b): cards volta a soft delete (evita cascade explosion em
--                   financial_items, activities, briefings, tasks)
--   v7 (ESTA): adiciona filtro test_agent_id; contato de teste é hard-deletado
--
-- Pré-requisito: migration 20260518c (test_agent_id em cards e contatos).
--
-- Uso DROP + CREATE (em vez de CREATE OR REPLACE) por convenção interna
-- do hook anti-rebase, que exige releitura explícita das versões anteriores.
-- Releitura confirmada antes desta versão.

DROP FUNCTION IF EXISTS public.reset_agent_test_conversation(uuid, text);

CREATE FUNCTION public.reset_agent_test_conversation(p_agent_id uuid, p_phone text)
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
  v_contact_cleared_rows INT := 0;
BEGIN
  -- Validação 1: agente existe
  SELECT test_mode_phone_whitelist
    INTO v_whitelist
    FROM ai_agents
   WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agente % não encontrado', p_agent_id;
  END IF;

  -- Validação 2 (preservada desde v1): só roda em modo teste
  IF v_whitelist IS NULL OR array_length(v_whitelist, 1) = 0 THEN
    RAISE EXCEPTION 'Agente sem whitelist — operação só permitida em agentes em modo de teste';
  END IF;

  v_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'Telefone vazio';
  END IF;

  -- Validação 3 (preservada desde v1): telefone na whitelist do agente
  IF NOT EXISTS (
    SELECT 1 FROM unnest(v_whitelist) AS w(phone)
     WHERE regexp_replace(w.phone, '[^0-9]', '', 'g') = v_normalized
  ) THEN
    RAISE EXCEPTION 'Telefone % não está na whitelist do agente', v_normalized;
  END IF;

  -- v7: pega o contato DE TESTE deste agente (não o contato real homônimo).
  -- Usa telefone_normalizado pra evitar mismatch com formatação ("(41) ..."),
  -- mas fallback no telefone bruto pra compatibilidade.
  SELECT id INTO v_contact_id
    FROM contatos
   WHERE test_agent_id = p_agent_id
     AND (telefone_normalizado = v_normalized OR telefone = v_normalized)
   LIMIT 1;

  IF v_contact_id IS NULL THEN
    -- Limpa buffer mesmo sem contato (mensagens pendentes desse número)
    DELETE FROM ai_message_buffer
     WHERE contact_phone = v_normalized;
    GET DIAGNOSTICS v_deleted_buffer = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'no_test_contact_found',
      'deleted_conversations', 0,
      'deleted_turns', 0,
      'deleted_state', 0,
      'soft_deleted_cards', 0,
      'deleted_buffer', v_deleted_buffer,
      'contact_cleared', false
    );
  END IF;

  -- Coleta conv_ids antes de deletar (preserva ordem children->parents)
  SELECT ARRAY_AGG(id) INTO v_conv_ids
    FROM ai_conversations
   WHERE primary_agent_id = p_agent_id
     AND contact_id = v_contact_id;

  -- v5 preservada: hard delete em conversations/state/turns
  IF v_conv_ids IS NOT NULL AND array_length(v_conv_ids, 1) > 0 THEN
    DELETE FROM ai_conversation_state WHERE conversation_id = ANY(v_conv_ids);
    GET DIAGNOSTICS v_deleted_state = ROW_COUNT;

    DELETE FROM ai_conversation_turns WHERE conversation_id = ANY(v_conv_ids);
    GET DIAGNOSTICS v_deleted_turns = ROW_COUNT;

    DELETE FROM ai_conversations WHERE id = ANY(v_conv_ids);
    GET DIAGNOSTICS v_deleted_conversations = ROW_COUNT;
  END IF;

  -- v6 preservada (soft delete em cards) + v7 (só cards de teste).
  -- Card real de produção (test_agent_id IS NULL) NÃO é tocado mesmo
  -- que aponte pra esse contato.
  UPDATE cards
     SET deleted_at = now(),
         updated_at = now()
   WHERE pessoa_principal_id = v_contact_id
     AND test_agent_id = p_agent_id
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_soft_deleted_cards = ROW_COUNT;

  -- v5 preservada: buffer inteiro pra esse telefone (processed + unprocessed)
  DELETE FROM ai_message_buffer
   WHERE contact_phone = v_normalized;
  GET DIAGNOSTICS v_deleted_buffer = ROW_COUNT;

  -- v7: hard delete do contato de teste (substitui v3+v4 que zeravam nome).
  -- Faz sentido porque o contato é dedicado ao teste — na próxima mensagem
  -- o router cria de novo do zero via findOrCreateContact.
  DELETE FROM contatos
   WHERE id = v_contact_id
     AND test_agent_id = p_agent_id;
  GET DIAGNOSTICS v_contact_cleared_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', v_contact_id,
    'deleted_conversations', v_deleted_conversations,
    'deleted_turns', v_deleted_turns,
    'deleted_state', v_deleted_state,
    'soft_deleted_cards', v_soft_deleted_cards,
    'deleted_buffer', v_deleted_buffer,
    'contact_cleared', v_contact_cleared_rows > 0
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_agent_test_conversation(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reset_agent_test_conversation IS
  'v7 (18/05/2026): só apaga cards/contato MARCADOS como test_agent_id = p_agent_id. Cards reais de produção com o mesmo telefone ficam intocados. Pré-requisito: cards.test_agent_id e contatos.test_agent_id (migration 20260518c).';
