-- ============================================================================
-- MIGRATION: reset_agent_test_conversation v2 — apaga TODOS os cards do contato
-- Date: 2026-04-27
--
-- Vitor pediu (2026-04-27): ao zerar pelo botão, apagar TODOS os cards onde
-- o contato é o número da whitelist — não só do produto do agente.
--
-- Cenário real: card foi criado em org Welcome Trips (a0000000) por engano
-- de configuração da linha (linha SDR Weddings tem org_id de Trips, mas
-- produto WEDDING). RPC anterior só apagava cards do produto do agente,
-- mas mesmo isso filtrava bem — o problema era outro (timing). Mesmo assim,
-- pra teste é mais robusto apagar todos os cards do contato. Em produção
-- real (sem whitelist), a função falha antes — então o blast radius continua
-- restrito ao número de teste.
--
-- Mantém todas as guardas:
-- 1. Falha se agente sem test_mode_phone_whitelist
-- 2. Falha se phone fora da whitelist
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
BEGIN
  -- Carrega whitelist do agente
  SELECT test_mode_phone_whitelist
    INTO v_whitelist
    FROM ai_agents
   WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agente % não encontrado', p_agent_id;
  END IF;

  -- Camada 1: agente precisa estar em modo teste
  IF v_whitelist IS NULL OR array_length(v_whitelist, 1) = 0 THEN
    RAISE EXCEPTION 'Agente sem whitelist — operação só permitida em agentes em modo de teste';
  END IF;

  -- Normaliza telefone
  v_normalized := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'Telefone vazio';
  END IF;

  -- Camada 2: telefone precisa estar na whitelist
  IF NOT EXISTS (
    SELECT 1 FROM unnest(v_whitelist) AS w(phone)
     WHERE regexp_replace(w.phone, '[^0-9]', '', 'g') = v_normalized
  ) THEN
    RAISE EXCEPTION 'Telefone % não está na whitelist do agente', v_normalized;
  END IF;

  -- Acha o contato
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

  -- 2. Soft-delete TODOS os cards do contato (sem filtro de produto/agente)
  --    Mudança 2026-04-27: antes filtrava por produto do agente, agora apaga
  --    todos os cards onde o contato é pessoa_principal. Necessário porque
  --    cards podem ser criados em orgs/produtos diferentes via configurações
  --    de linha cruzadas. Whitelist guard acima garante que só roda em teste.
  UPDATE cards
     SET deleted_at = now(),
         updated_at = now()
   WHERE pessoa_principal_id = v_contact_id
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

COMMENT ON FUNCTION public.reset_agent_test_conversation IS
  'Zera estado de teste do agente IA pra um número whitelisted. Arquiva conversas, soft-delete TODOS os cards do contato (qualquer produto/org), limpa buffer. Falha se agente sem whitelist ou número fora dela. v2 (2026-04-27): removido filtro de produto pra cobrir cards criados em orgs cruzadas.';
