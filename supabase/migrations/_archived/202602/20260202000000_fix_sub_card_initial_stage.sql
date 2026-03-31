-- ============================================================================
-- APLICAR MANUALMENTE NO SUPABASE DASHBOARD -> SQL EDITOR
-- Este SQL corrige a etapa inicial dos sub-cards para "Proposta em Construção"
-- ============================================================================

-- 1. MOVER SUB-CARD EXISTENTE PARA ETAPA CORRETA
UPDATE cards
SET
    pipeline_stage_id = '4d1a732a-44cf-423c-b0bd-94b253949d63',
    stage_entered_at = now()
WHERE id = '80c96633-ccba-4f41-86ee-2156331673e2';

-- 2. CORRIGIR FUNÇÃO criar_sub_card
CREATE OR REPLACE FUNCTION criar_sub_card(
    p_parent_id UUID,
    p_titulo TEXT,
    p_descricao TEXT,
    p_mode TEXT DEFAULT 'incremental'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent RECORD;
    v_planner_phase_id UUID;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_new_task_id UUID;
    v_user_id UUID;
    v_valor_estimado NUMERIC;
BEGIN
    v_user_id := auth.uid();

    -- 1. Validate parent card exists and is in Pós-venda
    SELECT c.*, s.fase, s.phase_id
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai não encontrado');
    END IF;

    IF v_parent.fase != 'Pós-venda' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai deve estar na fase Pós-venda');
    END IF;

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    IF p_mode NOT IN ('incremental', 'complete') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Modo inválido. Use incremental ou complete');
    END IF;

    -- 2. Get Planner phase ID
    SELECT id INTO v_planner_phase_id
    FROM pipeline_phases
    WHERE name = 'Planner'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fase Planner não encontrada');
    END IF;

    -- 3. CORRIGIDO: Buscar etapa "Proposta em Construção" em vez da primeira etapa
    SELECT id INTO v_target_stage_id
    FROM pipeline_stages
    WHERE phase_id = v_planner_phase_id
      AND pipeline_id = v_parent.pipeline_id
      AND nome = 'Proposta em Construção'
    LIMIT 1;

    -- Fallback: se não encontrar "Proposta em Construção", usa primeira etapa
    IF NOT FOUND THEN
        SELECT id INTO v_target_stage_id
        FROM pipeline_stages
        WHERE phase_id = v_planner_phase_id
          AND pipeline_id = v_parent.pipeline_id
        ORDER BY ordem ASC
        LIMIT 1;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa encontrada na fase Planner');
    END IF;

    -- 4. Determine valor_estimado based on mode
    IF p_mode = 'incremental' THEN
        v_valor_estimado := 0;
    ELSE
        v_valor_estimado := COALESCE(v_parent.valor_estimado, 0);
    END IF;

    -- 5. Create the sub-card
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, produto_data, moeda, briefing_inicial,
        data_viagem_inicio, data_viagem_fim, valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_by, created_at, updated_at
    )
    VALUES (
        p_titulo, 'sub_card', p_mode, 'active', p_parent_id,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto,
        CASE WHEN p_mode = 'complete' THEN v_parent.produto_data ELSE v_parent.produto_data - 'taxa_planejamento' END,
        v_parent.moeda, v_parent.briefing_inicial,
        v_parent.data_viagem_inicio, v_parent.data_viagem_fim, v_valor_estimado,
        COALESCE(v_parent.vendas_owner_id, v_user_id), v_parent.sdr_owner_id, v_parent.vendas_owner_id,
        v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', v_user_id, now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 6. Create change request task on PARENT card
    INSERT INTO tarefas (card_id, tipo, titulo, descricao, responsavel_id, data_vencimento, prioridade, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'solicitacao_mudanca', 'Alteração: ' || p_titulo, p_descricao,
        COALESCE(v_parent.vendas_owner_id, v_user_id), now() + interval '7 days', 'alta',
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_mode', p_mode),
        v_user_id, now()
    )
    RETURNING id INTO v_new_task_id;

    -- 7. Log the creation
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata, created_by)
    VALUES (
        v_new_card_id, p_parent_id, 'created',
        jsonb_build_object('titulo', p_titulo, 'mode', p_mode, 'valor_estimado', v_valor_estimado),
        jsonb_build_object('task_id', v_new_task_id, 'parent_fase', v_parent.fase, 'target_stage_id', v_target_stage_id),
        v_user_id
    );

    -- 8. Log activity on parent
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'sub_card_created', 'Card de alteração criado: ' || p_titulo,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo, 'mode', p_mode),
        v_user_id, now()
    );

    RETURN jsonb_build_object('success', true, 'sub_card_id', v_new_card_id, 'task_id', v_new_task_id, 'mode', p_mode, 'parent_id', p_parent_id);
END;
$$;

-- Verificar
SELECT id, titulo, pipeline_stage_id FROM cards WHERE id = '80c96633-ccba-4f41-86ee-2156331673e2';
