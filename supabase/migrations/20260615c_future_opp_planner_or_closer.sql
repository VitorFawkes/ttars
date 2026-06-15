-- ============================================================================
-- MIGRATION: Oportunidade Futura — resolver fase de destino por pipeline
--            (slug 'planner' OU 'closer') + setar org_id
-- Date: 2026-06-15
--
-- Problema: criar_card_oportunidade_futura / criar_sub_card_futuro
-- (def original em 20260317_future_opportunities.sql) resolvem o destino com
-- `WHERE pp.name = 'Planner'` SEM filtrar por pipeline. Welcome Weddings não tem
-- fase 'Planner' (tem 'Closer'), então o card de retorno nunca é criado para
-- Weddings (mesmo padrão do bug marcar_ganho slug 'planner' vs 'closer',
-- corrigido em 20260615b).
--
-- Fix (base FIEL em 20260317 — regra #5; só muda o bloco de resolução de
-- fase/etapa e adiciona org_id):
--   1. deriva o pipeline do card;
--   2. acha a fase de fechamento DENTRO desse pipeline (slug planner/closer);
--   3. etapa: 'Proposta em Construção' (Trips) senão 1ª etapa ativa não
--      ganho/perdido da fase (Weddings → "1ª Reunião");
--   4. INSERT do card/sub-card novo passa a setar org_id = org do card-fonte
--      (o cron roda como service_role sem JWT → requesting_org_id() cairia no
--      fallback errado).
--
-- Trips: continua resolvendo 'planner' + 'Proposta em Construção' (idêntico).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- A) criar_card_oportunidade_futura (source_type = 'lost_future')
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION criar_card_oportunidade_futura(
    p_future_opp_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opp RECORD;
    v_source RECORD;
    v_pipeline_id UUID;
    v_target_phase_id UUID;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_new_task_id UUID;
BEGIN
    -- 1. Buscar oportunidade futura
    SELECT * INTO v_opp
    FROM future_opportunities
    WHERE id = p_future_opp_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Oportunidade não encontrada ou já processada');
    END IF;

    -- 2. Buscar card de origem
    SELECT * INTO v_source
    FROM cards
    WHERE id = v_opp.source_card_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card de origem não encontrado');
    END IF;

    v_pipeline_id := COALESCE(v_opp.pipeline_id, v_source.pipeline_id);

    -- 3. Resolver a fase de fechamento DENTRO do pipeline do card
    --    (Trips → 'planner', Weddings → 'closer'). Filtra por pipeline via EXISTS
    --    para não pegar fase homônima de outra org/pipeline (colisão de slug).
    SELECT pp.id INTO v_target_phase_id
    FROM pipeline_phases pp
    WHERE pp.slug IN ('planner', 'closer')
      AND EXISTS (
          SELECT 1 FROM pipeline_stages s
          WHERE s.phase_id = pp.id AND s.pipeline_id = v_pipeline_id
      )
    ORDER BY pp.order_index ASC
    LIMIT 1;

    IF v_target_phase_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fase de fechamento (planner/closer) não encontrada no pipeline');
    END IF;

    -- Etapa preferida: "Proposta em Construção" (Trips). Fallback: primeira etapa
    -- ativa não-ganho/não-perdido da fase (Weddings → "1ª Reunião").
    SELECT s.id INTO v_target_stage_id
    FROM pipeline_stages s
    WHERE s.phase_id = v_target_phase_id
      AND s.pipeline_id = v_pipeline_id
      AND s.nome = 'Proposta em Construção'
      AND s.ativo = true
    LIMIT 1;

    IF v_target_stage_id IS NULL THEN
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_target_phase_id
          AND s.pipeline_id = v_pipeline_id
          AND s.ativo = true
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
        ORDER BY s.ordem ASC
        LIMIT 1;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa de destino encontrada na fase de fechamento');
    END IF;

    -- 4. Criar o card (independente — NÃO é sub-card, NÃO faz merge)
    INSERT INTO cards (
        titulo, card_type, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, moeda,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, org_id, created_at, updated_at
    )
    VALUES (
        v_opp.titulo,
        'future_opportunity',
        v_opp.source_card_id,  -- link ao card perdido original
        v_pipeline_id,
        v_target_stage_id,
        now(),
        COALESCE(v_opp.pessoa_principal_id, v_source.pessoa_principal_id),
        COALESCE(v_opp.produto::app_product, v_source.produto),
        v_source.moeda,
        COALESCE(v_opp.responsavel_id, v_source.dono_atual_id),
        v_source.sdr_owner_id,
        v_source.vendas_owner_id,
        v_source.pos_owner_id,
        v_source.concierge_owner_id,
        'aberto',
        v_source.org_id,
        now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Criar tarefa de follow-up no card novo
    INSERT INTO tarefas (
        card_id, tipo, titulo, descricao,
        responsavel_id, data_vencimento, prioridade,
        metadata, created_at
    )
    VALUES (
        v_new_card_id,
        'contato',
        'Retomar: ' || v_opp.titulo,
        COALESCE(v_opp.descricao, '') || E'\n\nOriginado de oportunidade futura do card: ' || v_source.titulo,
        COALESCE(v_opp.responsavel_id, v_source.dono_atual_id),
        now(),
        'alta',
        jsonb_build_object(
            'future_opportunity_id', v_opp.id,
            'source_card_id', v_opp.source_card_id,
            'source_card_titulo', v_source.titulo
        ),
        now()
    )
    RETURNING id INTO v_new_task_id;

    -- 6. Activity no card de origem
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
    VALUES (
        v_opp.source_card_id,
        'future_opportunity_executed',
        'Oportunidade futura reaberta: ' || v_opp.titulo,
        jsonb_build_object(
            'new_card_id', v_new_card_id,
            'future_opportunity_id', v_opp.id,
            'scheduled_date', v_opp.scheduled_date
        ),
        now()
    );

    -- 7. Activity no card novo
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
    VALUES (
        v_new_card_id,
        'future_opportunity_created',
        'Card criado automaticamente de oportunidade futura',
        jsonb_build_object(
            'source_card_id', v_opp.source_card_id,
            'source_card_titulo', v_source.titulo,
            'future_opportunity_id', v_opp.id
        ),
        now()
    );

    -- 8. Marcar oportunidade como executada
    UPDATE future_opportunities
    SET status = 'executed',
        created_card_id = v_new_card_id,
        executed_at = now()
    WHERE id = p_future_opp_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_card_id', v_new_card_id,
        'task_id', v_new_task_id,
        'source_card_id', v_opp.source_card_id
    );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- B) criar_sub_card_futuro (source_type = 'won_upsell' / 'won_future')
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION criar_sub_card_futuro(
    p_future_opp_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opp RECORD;
    v_parent RECORD;
    v_target_phase_id UUID;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_new_task_id UUID;
    v_valor_estimado NUMERIC;
    v_merge_config JSONB;
BEGIN
    -- 1. Buscar oportunidade futura
    SELECT * INTO v_opp
    FROM future_opportunities
    WHERE id = p_future_opp_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Oportunidade não encontrada ou já processada');
    END IF;

    -- 2. Buscar card pai
    SELECT c.*, s.fase
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = v_opp.source_card_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
    END IF;

    -- SEM validação de fase — aceita Planner/Closer, Pós-Venda, stages won

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    -- 3. Resolver merge_config
    IF COALESCE(v_opp.sub_card_mode, 'incremental') = 'incremental' THEN
        v_merge_config := '{"texto":{"copiar_pai":false,"merge_mode":"append"},"viagem":{"copiar_pai":false,"merge_mode":"append"}}'::jsonb;
        v_valor_estimado := 0;
    ELSE
        v_merge_config := '{"texto":{"copiar_pai":true,"merge_mode":"replace"},"viagem":{"copiar_pai":true,"merge_mode":"replace"}}'::jsonb;
        v_valor_estimado := COALESCE(v_parent.valor_estimado, 0);
    END IF;

    -- 4. Resolver fase de fechamento DENTRO do pipeline do card pai
    --    (Trips → 'planner', Weddings → 'closer').
    SELECT pp.id INTO v_target_phase_id
    FROM pipeline_phases pp
    WHERE pp.slug IN ('planner', 'closer')
      AND EXISTS (
          SELECT 1 FROM pipeline_stages s
          WHERE s.phase_id = pp.id AND s.pipeline_id = v_parent.pipeline_id
      )
    ORDER BY pp.order_index ASC
    LIMIT 1;

    IF v_target_phase_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fase de fechamento (planner/closer) não encontrada no pipeline');
    END IF;

    SELECT s.id INTO v_target_stage_id
    FROM pipeline_stages s
    WHERE s.phase_id = v_target_phase_id
      AND s.pipeline_id = v_parent.pipeline_id
      AND s.nome = 'Proposta em Construção'
      AND s.ativo = true
    LIMIT 1;

    IF v_target_stage_id IS NULL THEN
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_target_phase_id
          AND s.pipeline_id = v_parent.pipeline_id
          AND s.ativo = true
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
        ORDER BY s.ordem ASC
        LIMIT 1;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa de destino encontrada na fase de fechamento');
    END IF;

    -- 5. Criar sub-card
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, parent_card_id, merge_config,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, moeda,
        valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, org_id, created_at, updated_at
    )
    VALUES (
        v_opp.titulo,
        'sub_card',
        COALESCE(v_opp.sub_card_mode, 'incremental'),
        'active',
        v_opp.source_card_id,
        v_merge_config,
        v_parent.pipeline_id,
        v_target_stage_id,
        now(),
        v_parent.pessoa_principal_id,
        v_parent.produto,
        v_parent.moeda,
        v_valor_estimado,
        COALESCE(v_opp.responsavel_id, v_parent.vendas_owner_id, v_parent.dono_atual_id),
        v_parent.sdr_owner_id,
        v_parent.vendas_owner_id,
        v_parent.pos_owner_id,
        v_parent.concierge_owner_id,
        'aberto',
        v_parent.org_id,
        now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 6. Tarefa no card pai
    INSERT INTO tarefas (
        card_id, tipo, titulo, descricao,
        responsavel_id, data_vencimento, prioridade,
        metadata, created_at
    )
    VALUES (
        v_opp.source_card_id,
        'solicitacao_mudanca',
        'Alteração agendada: ' || v_opp.titulo,
        COALESCE(v_opp.descricao, 'Sub-card criado automaticamente por oportunidade futura'),
        COALESCE(v_opp.responsavel_id, v_parent.vendas_owner_id, v_parent.dono_atual_id),
        now() + interval '7 days',
        'alta',
        jsonb_build_object(
            'sub_card_id', v_new_card_id,
            'sub_card_mode', COALESCE(v_opp.sub_card_mode, 'incremental'),
            'merge_config', v_merge_config,
            'future_opportunity_id', v_opp.id
        ),
        now()
    )
    RETURNING id INTO v_new_task_id;

    -- 7. Log sync
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata)
    VALUES (
        v_new_card_id, v_opp.source_card_id, 'created',
        jsonb_build_object('titulo', v_opp.titulo, 'mode', COALESCE(v_opp.sub_card_mode, 'incremental'), 'valor_estimado', v_valor_estimado),
        jsonb_build_object('target_stage_id', v_target_stage_id, 'future_opportunity_id', v_opp.id, 'source', 'future_opportunity')
    );

    -- 8. Activity no card pai
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
    VALUES (
        v_opp.source_card_id,
        'sub_card_created',
        'Sub-card futuro criado automaticamente: ' || v_opp.titulo,
        jsonb_build_object(
            'sub_card_id', v_new_card_id,
            'sub_card_titulo', v_opp.titulo,
            'mode', COALESCE(v_opp.sub_card_mode, 'incremental'),
            'future_opportunity_id', v_opp.id,
            'source', 'future_opportunity'
        ),
        now()
    );

    -- 9. Marcar oportunidade como executada
    UPDATE future_opportunities
    SET status = 'executed',
        created_card_id = v_new_card_id,
        executed_at = now()
    WHERE id = p_future_opp_id;

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'task_id', v_new_task_id,
        'parent_id', v_opp.source_card_id,
        'mode', COALESCE(v_opp.sub_card_mode, 'incremental')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION criar_card_oportunidade_futura(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION criar_sub_card_futuro(UUID) TO service_role;

COMMIT;
