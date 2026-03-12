-- ============================================================================
-- MIGRATION: Acumulação de N de Venda Monde via sub-cards
-- Description: Atualiza merge_sub_card para transferir numero_venda_monde
--              do sub-card para o pai (acumulando em array histórico).
--              Atualiza criar_sub_card para limpar campo Monde herdado.
-- Date: 2026-03-13
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ÍNDICES para busca por número Monde
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_cards_monde_number
  ON cards ((produto_data->>'numero_venda_monde'));

CREATE INDEX IF NOT EXISTS idx_cards_monde_historico
  ON cards USING GIN ((produto_data->'numeros_venda_monde_historico'));

-- ============================================================================
-- 2. ATUALIZAR merge_sub_card — transferir numero_venda_monde
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_sub_card(
    p_sub_card_id UUID,
    p_options JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub_card RECORD;
    v_parent RECORD;
    v_user_id UUID;
    v_old_parent_value NUMERIC;
    v_new_parent_value NUMERIC;
    v_sub_card_value NUMERIC;
    v_proposal_id UUID;
    -- Monde numbers
    v_sub_monde TEXT;
    v_parent_monde TEXT;
    v_parent_pd JSONB;
    v_historico JSONB;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get sub-card with validation
    SELECT c.*, s.is_won
    INTO v_sub_card
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_sub_card_id
      AND c.card_type = 'sub_card'
      AND c.sub_card_status = 'active'
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card não encontrado ou não está ativo');
    END IF;

    -- Check if sub-card is in "won" stage
    IF NOT COALESCE(v_sub_card.is_won, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card deve estar em uma etapa "Ganho" para fazer merge');
    END IF;

    -- 2. Get parent card
    SELECT * INTO v_parent
    FROM cards
    WHERE id = v_sub_card.parent_card_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai não encontrado');
    END IF;

    -- 3. Calculate new value based on mode
    v_old_parent_value := COALESCE(v_parent.valor_final, v_parent.valor_estimado, 0);
    v_sub_card_value := COALESCE(v_sub_card.valor_final, v_sub_card.valor_estimado, 0);

    IF v_sub_card.sub_card_mode = 'incremental' THEN
        v_new_parent_value := v_old_parent_value + v_sub_card_value;
    ELSE
        v_new_parent_value := v_sub_card_value;
    END IF;

    -- 4. Update parent card value
    UPDATE cards
    SET
        valor_final = v_new_parent_value,
        updated_at = now()
    WHERE id = v_parent.id;

    -- ================================================================
    -- 4b. Transferir numero_venda_monde do sub-card para o pai
    -- ================================================================
    v_sub_monde := v_sub_card.produto_data->>'numero_venda_monde';

    IF v_sub_monde IS NOT NULL AND v_sub_monde <> '' THEN
        v_parent_pd := COALESCE(v_parent.produto_data, '{}'::jsonb);
        v_historico := COALESCE(v_parent_pd->'numeros_venda_monde_historico', '[]'::jsonb);
        v_parent_monde := v_parent_pd->>'numero_venda_monde';

        -- Garantir que o número original do pai está no histórico
        IF v_parent_monde IS NOT NULL AND v_parent_monde <> '' THEN
            IF NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_historico) elem
                WHERE elem->>'numero' = v_parent_monde
            ) THEN
                v_historico := v_historico || jsonb_build_array(
                    jsonb_build_object(
                        'numero', v_parent_monde,
                        'origem', 'original',
                        'sub_card_id', NULL,
                        'sub_card_titulo', NULL,
                        'adicionado_em', v_parent.created_at
                    )
                );
            END IF;
        END IF;

        -- Adicionar número do sub-card (dedup)
        IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_historico) elem
            WHERE elem->>'numero' = v_sub_monde
        ) THEN
            v_historico := v_historico || jsonb_build_array(
                jsonb_build_object(
                    'numero', v_sub_monde,
                    'origem', 'sub_card',
                    'sub_card_id', p_sub_card_id,
                    'sub_card_titulo', v_sub_card.titulo,
                    'adicionado_em', now()
                )
            );
        END IF;

        -- Atualizar produto_data do pai com o histórico
        UPDATE cards
        SET
            produto_data = v_parent_pd || jsonb_build_object(
                'numeros_venda_monde_historico', v_historico
            ),
            updated_at = now()
        WHERE id = v_parent.id;
    END IF;

    -- 5. Mark sub-card as merged
    UPDATE cards
    SET
        sub_card_status = 'merged',
        merged_at = now(),
        merged_by = v_user_id,
        merge_metadata = jsonb_build_object(
            'old_parent_value', v_old_parent_value,
            'sub_card_value', v_sub_card_value,
            'new_parent_value', v_new_parent_value,
            'mode', v_sub_card.sub_card_mode,
            'monde_number_transferred', v_sub_monde
        ),
        updated_at = now()
    WHERE id = p_sub_card_id;

    -- 6. Mark the change request task as completed
    UPDATE tarefas
    SET
        concluida = true,
        concluida_em = now(),
        concluido_por = v_user_id,
        outcome = 'concluido'
    WHERE card_id = v_parent.id
      AND tipo = 'solicitacao_mudanca'
      AND metadata->>'sub_card_id' = p_sub_card_id::text
      AND COALESCE(concluida, false) = false;

    -- 7. Get accepted proposal from sub-card (if any) for reference
    SELECT id INTO v_proposal_id
    FROM proposals
    WHERE card_id = p_sub_card_id
      AND status = 'accepted'
    ORDER BY updated_at DESC
    LIMIT 1;

    -- 8. Log the merge
    INSERT INTO sub_card_sync_log (
        sub_card_id,
        parent_card_id,
        action,
        old_value,
        new_value,
        metadata,
        created_by
    )
    VALUES (
        p_sub_card_id,
        v_parent.id,
        'merged',
        jsonb_build_object('valor', v_old_parent_value),
        jsonb_build_object('valor', v_new_parent_value),
        jsonb_build_object(
            'mode', v_sub_card.sub_card_mode,
            'sub_card_value', v_sub_card_value,
            'proposal_id', v_proposal_id,
            'monde_number_transferred', v_sub_monde
        ),
        v_user_id
    );

    -- 9. Log activity on parent
    INSERT INTO activities (
        card_id,
        tipo,
        descricao,
        metadata,
        created_by,
        created_at
    )
    VALUES (
        v_parent.id,
        'sub_card_merged',
        CASE v_sub_card.sub_card_mode
            WHEN 'incremental' THEN 'Alteração concluída: +' || v_sub_card_value || ' (total: ' || v_new_parent_value || ')'
            ELSE 'Proposta refeita: novo valor ' || v_new_parent_value
        END,
        jsonb_build_object(
            'sub_card_id', p_sub_card_id,
            'sub_card_titulo', v_sub_card.titulo,
            'mode', v_sub_card.sub_card_mode,
            'old_value', v_old_parent_value,
            'new_value', v_new_parent_value,
            'proposal_id', v_proposal_id,
            'monde_number_transferred', v_sub_monde
        ),
        v_user_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'parent_id', v_parent.id,
        'old_value', v_old_parent_value,
        'new_value', v_new_parent_value,
        'mode', v_sub_card.sub_card_mode,
        'proposal_id', v_proposal_id,
        'monde_number_transferred', v_sub_monde
    );
END;
$$;

-- ============================================================================
-- 3. ATUALIZAR criar_sub_card — limpar campo Monde do sub-card
-- ============================================================================

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
    v_sub_produto_data JSONB;
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
        RETURN jsonb_build_object('success', false, 'error', 'Modo inválido. Use "incremental" ou "complete"');
    END IF;

    -- 2. Get first stage in Planner phase
    SELECT id INTO v_planner_phase_id
    FROM pipeline_phases
    WHERE name = 'Planner'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fase Planner não encontrada');
    END IF;

    -- Buscar etapa "Proposta em Construção" (preferencial)
    SELECT id INTO v_target_stage_id
    FROM pipeline_stages
    WHERE phase_id = v_planner_phase_id
      AND pipeline_id = v_parent.pipeline_id
      AND nome = 'Proposta em Construção'
    LIMIT 1;

    -- Fallback: primeira etapa do Planner
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

    -- 3. Determine valor_estimado based on mode
    IF p_mode = 'incremental' THEN
        v_valor_estimado := 0;
    ELSE
        v_valor_estimado := COALESCE(v_parent.valor_estimado, 0);
    END IF;

    -- 4. Preparar produto_data do sub-card (sem campos Monde e taxa)
    v_sub_produto_data := COALESCE(v_parent.produto_data, '{}'::jsonb);
    -- Remover numero_venda_monde e histórico (sub-card recebe campo vazio)
    v_sub_produto_data := v_sub_produto_data - 'numero_venda_monde' - 'numeros_venda_monde_historico';
    IF p_mode = 'incremental' THEN
        v_sub_produto_data := v_sub_produto_data - 'taxa_planejamento';
    END IF;

    -- 5. Create the sub-card
    INSERT INTO cards (
        titulo,
        card_type,
        sub_card_mode,
        sub_card_status,
        parent_card_id,
        pipeline_id,
        pipeline_stage_id,
        stage_entered_at,
        pessoa_principal_id,
        produto,
        produto_data,
        moeda,
        briefing_inicial,
        data_viagem_inicio,
        data_viagem_fim,
        valor_estimado,
        dono_atual_id,
        sdr_owner_id,
        vendas_owner_id,
        pos_owner_id,
        concierge_owner_id,
        status_comercial,
        created_by,
        created_at,
        updated_at
    )
    VALUES (
        p_titulo,
        'sub_card',
        p_mode,
        'active',
        p_parent_id,
        v_parent.pipeline_id,
        v_target_stage_id,
        now(),
        v_parent.pessoa_principal_id,
        v_parent.produto,
        v_sub_produto_data,
        v_parent.moeda,
        v_parent.briefing_inicial,
        v_parent.data_viagem_inicio,
        v_parent.data_viagem_fim,
        v_valor_estimado,
        COALESCE(v_parent.vendas_owner_id, v_user_id),
        v_parent.sdr_owner_id,
        v_parent.vendas_owner_id,
        v_parent.pos_owner_id,
        v_parent.concierge_owner_id,
        'aberto',
        v_user_id,
        now(),
        now()
    )
    RETURNING id INTO v_new_card_id;

    -- 6. Create change request task on PARENT card
    INSERT INTO tarefas (
        card_id,
        tipo,
        titulo,
        descricao,
        responsavel_id,
        data_vencimento,
        prioridade,
        metadata,
        created_by,
        created_at
    )
    VALUES (
        p_parent_id,
        'solicitacao_mudanca',
        'Alteração: ' || p_titulo,
        p_descricao,
        COALESCE(v_parent.vendas_owner_id, v_user_id),
        now() + interval '7 days',
        'alta',
        jsonb_build_object(
            'sub_card_id', v_new_card_id,
            'sub_card_mode', p_mode
        ),
        v_user_id,
        now()
    )
    RETURNING id INTO v_new_task_id;

    -- 7. Log the creation
    INSERT INTO sub_card_sync_log (
        sub_card_id,
        parent_card_id,
        action,
        new_value,
        metadata,
        created_by
    )
    VALUES (
        v_new_card_id,
        p_parent_id,
        'created',
        jsonb_build_object(
            'titulo', p_titulo,
            'mode', p_mode,
            'valor_estimado', v_valor_estimado
        ),
        jsonb_build_object(
            'task_id', v_new_task_id,
            'parent_fase', v_parent.fase,
            'planner_stage_id', v_target_stage_id
        ),
        v_user_id
    );

    -- 8. Log activity on parent
    INSERT INTO activities (
        card_id,
        tipo,
        descricao,
        metadata,
        created_by,
        created_at
    )
    VALUES (
        p_parent_id,
        'sub_card_created',
        'Card de alteração criado: ' || p_titulo,
        jsonb_build_object(
            'sub_card_id', v_new_card_id,
            'sub_card_titulo', p_titulo,
            'mode', p_mode
        ),
        v_user_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'task_id', v_new_task_id,
        'mode', p_mode,
        'parent_id', p_parent_id
    );
END;
$$;

COMMIT;
