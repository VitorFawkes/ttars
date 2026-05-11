-- =====================================================================
-- Módulo Concierge — Marco 1 (Fundação)
-- 20260427c: RPCs pra criar/marcar/executar em lote atendimentos
-- =====================================================================

-- =====================================================================
-- rpc_criar_atendimento_concierge
-- Cria tarefa + complemento atendimentos_concierge numa transação.
-- Retorna o ID do atendimento criado.
-- =====================================================================
CREATE OR REPLACE FUNCTION rpc_criar_atendimento_concierge(
  p_card_id UUID,
  p_tipo_concierge TEXT,
  p_categoria TEXT,
  p_source TEXT DEFAULT 'manual',
  p_titulo TEXT DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_data_vencimento TIMESTAMPTZ DEFAULT NULL,
  p_responsavel_id UUID DEFAULT NULL,
  p_prioridade TEXT DEFAULT 'media',
  p_valor NUMERIC DEFAULT NULL,
  p_cobrado_de TEXT DEFAULT NULL,
  p_origem_descricao TEXT DEFAULT NULL,
  p_cadence_step_id UUID DEFAULT NULL,
  p_hospedagem_ref TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_org UUID;
  v_tarefa_id UUID;
  v_atendimento_id UUID;
  v_responsavel_final UUID;
BEGIN
  -- Validar card pertence ao org do solicitante
  SELECT org_id INTO v_card_org FROM cards WHERE id = p_card_id;
  IF v_card_org IS NULL THEN
    RAISE EXCEPTION 'Card % não encontrado', p_card_id;
  END IF;
  IF v_card_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Card % pertence a outro workspace', p_card_id;
  END IF;

  -- Default: responsável = concierge_owner_id do card, fallback ao auth.uid()
  v_responsavel_final := COALESCE(
    p_responsavel_id,
    (SELECT concierge_owner_id FROM cards WHERE id = p_card_id),
    auth.uid()
  );

  -- Criar tarefa
  INSERT INTO tarefas (
    card_id, titulo, descricao, responsavel_id, data_vencimento,
    status, tipo, prioridade, concluida, created_by, org_id,
    metadata
  ) VALUES (
    p_card_id,
    COALESCE(p_titulo, p_categoria || ' — ' || p_tipo_concierge),
    p_descricao,
    v_responsavel_final,
    p_data_vencimento,
    'aberta',
    'tarefa',
    p_prioridade,
    false,
    auth.uid(),
    v_card_org,
    jsonb_build_object('origem', 'concierge', 'tipo_concierge', p_tipo_concierge, 'categoria', p_categoria)
  ) RETURNING id INTO v_tarefa_id;

  -- Criar complemento atendimento_concierge
  INSERT INTO atendimentos_concierge (
    tarefa_id, org_id, card_id,
    tipo_concierge, categoria,
    source, cadence_step_id, origem_descricao,
    valor, cobrado_de,
    hospedagem_ref, payload
  ) VALUES (
    v_tarefa_id, v_card_org, p_card_id,
    p_tipo_concierge, p_categoria,
    p_source, p_cadence_step_id, p_origem_descricao,
    p_valor, p_cobrado_de,
    p_hospedagem_ref, COALESCE(p_payload, '{}'::jsonb)
  ) RETURNING id INTO v_atendimento_id;

  RETURN v_atendimento_id;
END;
$$;

REVOKE ALL ON FUNCTION rpc_criar_atendimento_concierge FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_criar_atendimento_concierge TO authenticated, service_role;

-- =====================================================================
-- rpc_marcar_outcome
-- Marca o outcome de um atendimento (aceito/recusado/feito/cancelado)
-- e fecha a tarefa correspondente.
-- =====================================================================
CREATE OR REPLACE FUNCTION rpc_marcar_outcome(
  p_atendimento_id UUID,
  p_outcome TEXT,
  p_valor_final NUMERIC DEFAULT NULL,
  p_cobrado_de TEXT DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tarefa_id UUID;
  v_org_id UUID;
BEGIN
  SELECT tarefa_id, org_id INTO v_tarefa_id, v_org_id
  FROM atendimentos_concierge WHERE id = p_atendimento_id;

  IF v_tarefa_id IS NULL THEN
    RAISE EXCEPTION 'Atendimento % não encontrado', p_atendimento_id;
  END IF;
  IF v_org_id <> requesting_org_id() THEN
    RAISE EXCEPTION 'Atendimento % pertence a outro workspace', p_atendimento_id;
  END IF;

  UPDATE atendimentos_concierge
  SET outcome = p_outcome,
      outcome_em = now(),
      outcome_por = auth.uid(),
      valor = COALESCE(p_valor_final, valor),
      cobrado_de = COALESCE(p_cobrado_de, cobrado_de),
      payload = CASE
        WHEN p_observacao IS NOT NULL
          THEN payload || jsonb_build_object('observacao_outcome', p_observacao)
        ELSE payload
      END
  WHERE id = p_atendimento_id;

  UPDATE tarefas
  SET concluida = true,
      concluida_em = now(),
      concluido_por = auth.uid(),
      status = 'concluida',
      data_conclusao = now(),
      outcome = p_outcome,
      resultado = p_observacao
  WHERE id = v_tarefa_id;
END;
$$;

REVOKE ALL ON FUNCTION rpc_marcar_outcome FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_marcar_outcome TO authenticated, service_role;

-- =====================================================================
-- rpc_executar_em_lote
-- Marca múltiplos atendimentos com o mesmo outcome de uma vez.
-- Usado na tela "Em Lote" pra ações em massa (ex: "todos os check-ins feitos").
-- =====================================================================
CREATE OR REPLACE FUNCTION rpc_executar_em_lote(
  p_atendimento_ids UUID[],
  p_outcome TEXT,
  p_observacao TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_id UUID;
BEGIN
  IF array_length(p_atendimento_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Validar todos pertencem ao org do solicitante
  IF EXISTS (
    SELECT 1 FROM atendimentos_concierge
    WHERE id = ANY(p_atendimento_ids) AND org_id <> requesting_org_id()
  ) THEN
    RAISE EXCEPTION 'Algum atendimento pertence a outro workspace';
  END IF;

  -- Marcar todos
  FOREACH v_id IN ARRAY p_atendimento_ids LOOP
    PERFORM rpc_marcar_outcome(v_id, p_outcome, NULL, NULL, p_observacao);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION rpc_executar_em_lote FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_executar_em_lote TO authenticated, service_role;

-- =====================================================================
-- rpc_notificar_cliente
-- Marca timestamp de quando o cliente foi notificado sobre o atendimento.
-- =====================================================================
CREATE OR REPLACE FUNCTION rpc_notificar_cliente(
  p_atendimento_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM atendimentos_concierge WHERE id = p_atendimento_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Atendimento % não encontrado', p_atendimento_id;
  END IF;
  IF v_org_id <> requesting_org_id() THEN
    RAISE EXCEPTION 'Atendimento % pertence a outro workspace', p_atendimento_id;
  END IF;

  UPDATE atendimentos_concierge
  SET notificou_cliente_em = now()
  WHERE id = p_atendimento_id;
END;
$$;

REVOKE ALL ON FUNCTION rpc_notificar_cliente FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_notificar_cliente TO authenticated, service_role;
