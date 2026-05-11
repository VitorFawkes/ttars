-- ============================================================================
-- MIGRATION: reset_agent_test_conversation — zera estado de teste de um agente
-- Date: 2026-04-26
--
-- RPC chamada pelo botão "Zerar conversa real" do editor de agente IA.
--
-- Segurança em camadas:
--   1. SECURITY DEFINER (roda com privilégio do owner pra atravessar RLS)
--   2. Falha se agente não tem test_mode_phone_whitelist (só permite em modo teste)
--   3. Falha se p_phone não está na whitelist do agente
--   4. Limita ações ao contato e produto do agente — não toca outros dados
--
-- O que faz:
--   1. Arquiva conversas ativas do agente com esse contato
--   2. Soft-delete cards do contato pertencentes ao produto do agente
--   3. Limpa ai_message_buffer pendente desse número
--
-- Retorna JSONB com contadores pra UI dar feedback.
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
  v_agent_produto TEXT;
  v_contact_id UUID;
  v_archived_conversations INT := 0;
  v_deleted_cards INT := 0;
  v_deleted_buffer INT := 0;
BEGIN
  -- Carrega config do agente
  SELECT test_mode_phone_whitelist, produto::TEXT
    INTO v_whitelist, v_agent_produto
    FROM ai_agents
   WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agente % não encontrado', p_agent_id;
  END IF;

  -- Camada 1: agente precisa estar em modo teste (whitelist preenchida)
  IF v_whitelist IS NULL OR array_length(v_whitelist, 1) = 0 THEN
    RAISE EXCEPTION 'Agente sem whitelist — operação só permitida em agentes em modo de teste';
  END IF;

  -- Normaliza telefone (só dígitos)
  v_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'Telefone vazio';
  END IF;

  -- Camada 2: telefone precisa estar na whitelist do agente
  IF NOT EXISTS (
    SELECT 1 FROM unnest(v_whitelist) AS w(phone)
     WHERE regexp_replace(w.phone, '[^0-9]', '', 'g') = v_normalized
  ) THEN
    RAISE EXCEPTION 'Telefone % não está na whitelist do agente', v_normalized;
  END IF;

  -- Acha o contato pelo telefone
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
      'deleted_buffer', 0
    );
  END IF;

  -- 1. Arquiva conversas ativas/waiting do agente com esse contato
  UPDATE ai_conversations
     SET status = 'archived',
         ended_at = COALESCE(ended_at, now()),
         updated_at = now()
   WHERE primary_agent_id = p_agent_id
     AND contact_id = v_contact_id
     AND status IN ('active', 'waiting');
  GET DIAGNOSTICS v_archived_conversations = ROW_COUNT;

  -- 2. Soft-delete cards do contato (limita ao produto do agente)
  UPDATE cards
     SET deleted_at = now(),
         updated_at = now()
   WHERE pessoa_principal_id = v_contact_id
     AND produto::TEXT = v_agent_produto
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_deleted_cards = ROW_COUNT;

  -- 3. Limpa buffer pendente desse número
  DELETE FROM ai_message_buffer
   WHERE contact_phone = v_normalized
     AND processed_at IS NULL;
  GET DIAGNOSTICS v_deleted_buffer = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', v_contact_id,
    'archived_conversations', v_archived_conversations,
    'deleted_cards', v_deleted_cards,
    'deleted_buffer', v_deleted_buffer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_agent_test_conversation(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_agent_test_conversation(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_agent_test_conversation IS
  'Zera estado de teste de um agente IA pra um número específico (whitelist). Arquiva conversas ativas, soft-delete cards do produto do agente, limpa buffer. Falha se agente não tem whitelist ou número fora dela.';
