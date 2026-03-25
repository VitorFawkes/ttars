-- ============================================================================
-- FIX: Terminologia sub-card nos RPCs
--
-- Sub-card = nova venda/trabalho de planejamento (NÃO "item da viagem")
-- Cada sub-card pode ter vários financial items dentro.
--
-- Corrige:
--   1. criar_sub_card: activity descriptions + task titles + error messages
--   2. completar_sub_card: activity descriptions
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Recriar criar_sub_card com terminologia correta
-- ============================================================================

-- Drop ALL overloads para evitar conflito PostgREST
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION criar_sub_card(
    p_parent_id UUID,
    p_titulo TEXT,
    p_descricao TEXT,
    p_mode TEXT DEFAULT 'incremental',
    p_merge_config JSONB DEFAULT NULL,
    p_category TEXT DEFAULT 'addition',
    p_valor_estimado NUMERIC DEFAULT 0
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
    v_user_id UUID;
    v_sub_produto_data JSONB;
    v_category TEXT;
    v_valor NUMERIC;
BEGIN
    v_user_id := auth.uid();
    v_category := CASE WHEN p_category IN ('addition', 'change') THEN p_category ELSE 'addition' END;
    v_valor := COALESCE(p_valor_estimado, 0);

    -- 1. Validar card pai
    SELECT c.*, s.fase, s.phase_id, c.pipeline_id
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
    END IF;

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card em card agrupador');
    END IF;

    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de uma oportunidade futura');
    END IF;

    -- 2. Determinar estágio inicial
    SELECT sub_card_default_stage_id INTO v_target_stage_id
    FROM pipelines WHERE id = v_parent.pipeline_id;

    IF v_target_stage_id IS NULL THEN
        SELECT id INTO v_planner_phase_id
        FROM pipeline_phases
        WHERE slug = 'planner'
        LIMIT 1;

        IF v_planner_phase_id IS NOT NULL THEN
            SELECT id INTO v_target_stage_id
            FROM pipeline_stages
            WHERE phase_id = v_planner_phase_id
              AND pipeline_id = v_parent.pipeline_id
              AND nome = 'Proposta em Construção'
            LIMIT 1;

            IF v_target_stage_id IS NULL THEN
                SELECT id INTO v_target_stage_id
                FROM pipeline_stages
                WHERE phase_id = v_planner_phase_id
                  AND pipeline_id = v_parent.pipeline_id
                ORDER BY ordem ASC
                LIMIT 1;
            END IF;
        END IF;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa encontrada na fase Planner');
    END IF;

    -- 3. Preparar produto_data
    v_sub_produto_data := COALESCE(v_parent.produto_data, '{}'::jsonb);
    v_sub_produto_data := v_sub_produto_data
        - 'numero_venda_monde'
        - 'numeros_venda_monde_historico'
        - 'taxa_planejamento'
        - 'orcamento';

    -- 4. Criar o sub-card
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, sub_card_category, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, produto_data, moeda,
        data_viagem_inicio, data_viagem_fim, valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_by, created_at, updated_at
    )
    VALUES (
        p_titulo, 'sub_card', 'incremental', 'active', v_category, p_parent_id,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto, v_sub_produto_data, v_parent.moeda,
        v_parent.data_viagem_inicio, v_parent.data_viagem_fim, v_valor,
        COALESCE(v_parent.vendas_owner_id, v_user_id), v_parent.sdr_owner_id,
        v_parent.vendas_owner_id, v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', v_user_id, now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Log
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata, created_by)
    VALUES (
        v_new_card_id, p_parent_id, 'created',
        jsonb_build_object('titulo', p_titulo, 'mode', 'incremental', 'category', v_category, 'valor_estimado', v_valor),
        jsonb_build_object('target_stage_id', v_target_stage_id),
        v_user_id
    );

    -- 6. Activity no pai
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'sub_card_created',
        CASE v_category
            WHEN 'change' THEN 'Sub-card de mudança criado: ' || p_titulo
            ELSE 'Sub-card criado: ' || p_titulo
        END,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo, 'sub_card_category', v_category),
        v_user_id, now()
    );

    -- 7. Tarefa solicitacao_mudanca (só quando pai em Pós-Venda)
    -- IMPORTANTE: fase no banco é 'Pós-venda' (com acento e maiúscula)
    IF v_parent.fase = 'Pós-venda' THEN
        INSERT INTO tarefas (
            card_id, tipo, titulo, descricao, responsavel_id,
            data_vencimento, prioridade, metadata, created_by, created_at
        )
        VALUES (
            p_parent_id,
            'solicitacao_mudanca',
            CASE v_category
                WHEN 'change' THEN 'Mudança: ' || p_titulo
                ELSE 'Nova venda: ' || p_titulo
            END,
            COALESCE(p_descricao, 'Sub-card criado pelo Planner'),
            COALESCE(v_parent.pos_owner_id, v_parent.vendas_owner_id, v_user_id),
            now() + interval '3 days',
            'alta',
            jsonb_build_object(
                'sub_card_id', v_new_card_id,
                'sub_card_titulo', p_titulo,
                'sub_card_category', v_category,
                'created_by', v_user_id
            ),
            v_user_id,
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'mode', 'incremental',
        'category', v_category,
        'parent_id', p_parent_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION criar_sub_card TO authenticated;

-- ============================================================================
-- 2. Recriar completar_sub_card com terminologia correta
-- ============================================================================

CREATE OR REPLACE FUNCTION completar_sub_card(p_sub_card_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub RECORD;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    SELECT c.id, c.titulo, c.card_type, c.sub_card_status, c.sub_card_category,
           c.parent_card_id
    INTO v_sub
    FROM cards c
    WHERE c.id = p_sub_card_id AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card não encontrado');
    END IF;

    IF v_sub.card_type != 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card não é um sub-card');
    END IF;

    IF v_sub.sub_card_status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card não está ativo (status: ' || v_sub.sub_card_status || ')');
    END IF;

    -- Mark as completed
    UPDATE cards
    SET sub_card_status = 'completed',
        updated_at = now()
    WHERE id = p_sub_card_id;

    -- Log activity on parent
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        v_sub.parent_card_id,
        'sub_card_completed',
        CASE COALESCE(v_sub.sub_card_category, 'addition')
            WHEN 'change' THEN 'Sub-card de mudança concluído: ' || v_sub.titulo
            ELSE 'Sub-card concluído: ' || v_sub.titulo
        END,
        jsonb_build_object(
            'sub_card_id', p_sub_card_id,
            'sub_card_titulo', v_sub.titulo,
            'sub_card_category', COALESCE(v_sub.sub_card_category, 'addition'),
            'completed_by', v_user_id
        ),
        v_user_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', p_sub_card_id,
        'parent_id', v_sub.parent_card_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION completar_sub_card TO authenticated;

COMMIT;
