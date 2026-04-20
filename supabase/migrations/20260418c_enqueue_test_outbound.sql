-- ============================================================================
-- RPC enqueue_test_outbound
-- ============================================================================
-- Permite que o admin dispare manualmente um job de primeira mensagem outbound
-- para um agente IA, com telefone destino específico. Usado no botão "Disparar
-- teste" do editor de agente. Respeita multi-tenant (org do agente).
--
-- Pré-requisitos:
--   - Agente existe e está em modo 'outbound' ou 'hybrid'
--   - Agente tem first_message_config configurado
--   - Existe contato com o telefone na org do agente
--   - Existe card com esse contato como pessoa_principal_id
--
-- Não liga o agente. Se o agente estiver ativa=false, o job fica na fila mas
-- só é processado quando o admin ligar o agente.
-- ============================================================================

CREATE OR REPLACE FUNCTION enqueue_test_outbound(
  p_agent_id UUID,
  p_phone TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_contato RECORD;
  v_card_id UUID;
  v_phone_digits TEXT;
  v_phone_local TEXT;
  v_queue_id UUID;
BEGIN
  -- Normaliza o telefone: apenas dígitos, com prefixo 55 se BR sem
  v_phone_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF length(v_phone_digits) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone', 'phone', p_phone);
  END IF;
  IF length(v_phone_digits) >= 10 AND v_phone_digits !~ '^55' THEN
    v_phone_digits := '55' || v_phone_digits;
  END IF;
  v_phone_local := regexp_replace(v_phone_digits, '^55', '');

  -- Carrega agente
  SELECT id, org_id, interaction_mode, first_message_config, ativa, nome
    INTO v_agent
    FROM ai_agents WHERE id = p_agent_id;

  IF v_agent.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agent_not_found');
  END IF;

  IF v_agent.interaction_mode IS NULL OR v_agent.interaction_mode = 'inbound' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'agent_not_outbound_capable',
      'hint', 'Agente está em modo inbound. Troque para hybrid ou outbound na aba Modo de interação.'
    );
  END IF;

  IF v_agent.first_message_config IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'missing_first_message_config',
      'hint', 'Configure a primeira mensagem do agente na aba Modo de interação.'
    );
  END IF;

  -- Busca contato no org do agente com telefone compatível (match por dígitos locais)
  SELECT id, nome, sobrenome
    INTO v_contato
    FROM contatos
   WHERE org_id = v_agent.org_id
     AND regexp_replace(COALESCE(telefone, ''), '\D', '', 'g') LIKE '%' || v_phone_local
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_contato.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'contato_not_found',
      'phone', v_phone_digits,
      'org_id', v_agent.org_id,
      'hint', 'Crie um contato com este telefone na org antes de disparar o teste.'
    );
  END IF;

  -- Busca um card desse contato (mais recente)
  SELECT id INTO v_card_id
    FROM cards
   WHERE org_id = v_agent.org_id
     AND pessoa_principal_id = v_contato.id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_card_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'card_not_found',
      'contato_id', v_contato.id,
      'hint', 'O contato existe, mas não tem card. Crie um card com este contato como pessoa principal.'
    );
  END IF;

  -- Enfileira o job
  INSERT INTO ai_outbound_queue (
    org_id, agent_id, card_id, contato_id,
    contact_phone, contact_name, form_data,
    trigger_type, trigger_metadata, status, scheduled_for
  ) VALUES (
    v_agent.org_id, p_agent_id, v_card_id, v_contato.id,
    v_phone_digits,
    TRIM(COALESCE(v_contato.nome, '') || ' ' || COALESCE(v_contato.sobrenome, '')),
    '{}'::jsonb,
    'manual',
    jsonb_build_object('triggered_by_admin', true, 'triggered_at', now()),
    'pending', now()
  ) RETURNING id INTO v_queue_id;

  RETURN jsonb_build_object(
    'ok', true,
    'queue_id', v_queue_id,
    'agent_id', p_agent_id,
    'agent_nome', v_agent.nome,
    'agent_ativa', v_agent.ativa,
    'contato_id', v_contato.id,
    'card_id', v_card_id,
    'phone', v_phone_digits,
    'note', CASE
      WHEN NOT v_agent.ativa THEN 'Job na fila, mas o agente está desligado. Ligue o agente para processar.'
      ELSE 'Job enfileirado. Deve ser processado em até 60 segundos pelo cron.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION enqueue_test_outbound(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION enqueue_test_outbound(UUID, TEXT) IS
'Admin-only: enfileira manualmente um job outbound para testar primeira mensagem de um agente. Requer contato + card existentes na org do agente com o telefone dado. Retorna JSON {ok, queue_id | error, hint}.';
