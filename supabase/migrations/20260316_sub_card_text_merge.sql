-- ============================================================
-- Migration: Sub-Card Text & Trip Merge Config
-- Date: 2026-03-16
--
-- Adds merge_config column to cards and updates criar_sub_card
-- and merge_sub_card RPCs to handle text and trip field merging
-- between sub-cards and parent cards.
--
-- merge_config format:
-- {
--   "texto":  { "copiar_pai": bool, "merge_mode": "replace"|"append" },
--   "viagem": { "copiar_pai": bool, "merge_mode": "replace"|"append" }
-- }
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. Nova coluna merge_config
-- ══════════════════════════════════════════════════════════════

ALTER TABLE cards ADD COLUMN IF NOT EXISTS merge_config JSONB;

-- Drop old 4-arg overload (before adding 5-arg version)
DROP FUNCTION IF EXISTS criar_sub_card(uuid, text, text, text);

-- ══════════════════════════════════════════════════════════════
-- 2. Atualizar criar_sub_card — aceitar p_merge_config
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION criar_sub_card(
    p_parent_id UUID,
    p_titulo TEXT,
    p_descricao TEXT,
    p_mode TEXT DEFAULT 'incremental',
    p_merge_config JSONB DEFAULT NULL
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
    v_merge_config JSONB;
    v_sub_produto_data JSONB;
    v_sub_briefing JSONB;
    v_texto_copiar BOOLEAN;
    v_viagem_copiar BOOLEAN;
BEGIN
    v_user_id := auth.uid();

    -- 1. Validate parent card
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

    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar alteração em card agrupador');
    END IF;

    IF p_mode NOT IN ('incremental', 'complete') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Modo inválido. Use incremental ou complete');
    END IF;

    -- 2. Resolve merge_config (auto-derive from mode if not provided)
    IF p_merge_config IS NOT NULL THEN
        v_merge_config := p_merge_config;
    ELSIF p_mode = 'incremental' THEN
        v_merge_config := '{"texto":{"copiar_pai":false,"merge_mode":"append"},"viagem":{"copiar_pai":false,"merge_mode":"append"}}'::jsonb;
    ELSE
        v_merge_config := '{"texto":{"copiar_pai":true,"merge_mode":"replace"},"viagem":{"copiar_pai":true,"merge_mode":"replace"}}'::jsonb;
    END IF;

    v_texto_copiar := COALESCE((v_merge_config->'texto'->>'copiar_pai')::boolean, false);
    v_viagem_copiar := COALESCE((v_merge_config->'viagem'->>'copiar_pai')::boolean, false);

    -- 3. Get Planner phase and target stage
    SELECT id INTO v_planner_phase_id
    FROM pipeline_phases
    WHERE name = 'Planner'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fase Planner não encontrada');
    END IF;

    SELECT id INTO v_target_stage_id
    FROM pipeline_stages
    WHERE phase_id = v_planner_phase_id
      AND pipeline_id = v_parent.pipeline_id
      AND nome = 'Proposta em Construção'
    LIMIT 1;

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

    -- 4. Determine valor_estimado
    IF p_mode = 'incremental' THEN
        v_valor_estimado := 0;
    ELSE
        v_valor_estimado := COALESCE(v_parent.valor_estimado, 0);
    END IF;

    -- 5. Prepare produto_data based on merge_config
    v_sub_produto_data := COALESCE(v_parent.produto_data, '{}'::jsonb);

    -- Always remove Monde numbers (handled separately in merge)
    v_sub_produto_data := v_sub_produto_data - 'numero_venda_monde' - 'numeros_venda_monde_historico';

    -- Remove taxa for incremental mode
    IF p_mode = 'incremental' THEN
        v_sub_produto_data := v_sub_produto_data - 'taxa_planejamento';
    END IF;

    -- Clear text fields if not copying from parent
    IF NOT v_texto_copiar THEN
        v_sub_produto_data := v_sub_produto_data || jsonb_build_object('observacoes', '');
    END IF;

    -- Clear trip fields if not copying from parent
    IF NOT v_viagem_copiar THEN
        v_sub_produto_data := v_sub_produto_data
            - 'destinos'
            - 'orcamento'
            - 'epoca_viagem'
            - 'duracao_viagem'
            - 'quantidade_viajantes';
    END IF;

    -- 6. Prepare briefing_inicial based on merge_config
    v_sub_briefing := COALESCE(v_parent.briefing_inicial, '{}'::jsonb);

    IF NOT v_texto_copiar THEN
        v_sub_briefing := v_sub_briefing || jsonb_build_object('observacoes', '{}'::jsonb);
    END IF;

    IF NOT v_viagem_copiar THEN
        -- Clear trip-related keys from briefing
        v_sub_briefing := v_sub_briefing
            - 'destinos'
            - 'orcamento'
            - 'epoca_viagem'
            - 'duracao_viagem'
            - 'quantidade_viajantes'
            - 'epoca_tipo'
            - 'periodo_viagem';
    END IF;

    -- 7. Create the sub-card
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, parent_card_id, merge_config,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, produto_data, moeda, briefing_inicial,
        data_viagem_inicio, data_viagem_fim, valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_by, created_at, updated_at
    )
    VALUES (
        p_titulo, 'sub_card', p_mode, 'active', p_parent_id, v_merge_config,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto,
        v_sub_produto_data,
        v_parent.moeda,
        v_sub_briefing,
        CASE WHEN v_viagem_copiar THEN v_parent.data_viagem_inicio ELSE NULL END,
        CASE WHEN v_viagem_copiar THEN v_parent.data_viagem_fim ELSE NULL END,
        v_valor_estimado,
        COALESCE(v_parent.vendas_owner_id, v_user_id), v_parent.sdr_owner_id, v_parent.vendas_owner_id,
        v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', v_user_id, now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 8. Create change request task on PARENT card
    INSERT INTO tarefas (card_id, tipo, titulo, descricao, responsavel_id, data_vencimento, prioridade, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'solicitacao_mudanca', 'Alteração: ' || p_titulo, p_descricao,
        COALESCE(v_parent.vendas_owner_id, v_user_id), now() + interval '7 days', 'alta',
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_mode', p_mode, 'merge_config', v_merge_config),
        v_user_id, now()
    )
    RETURNING id INTO v_new_task_id;

    -- 9. Log creation
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata, created_by)
    VALUES (
        v_new_card_id, p_parent_id, 'created',
        jsonb_build_object('titulo', p_titulo, 'mode', p_mode, 'valor_estimado', v_valor_estimado),
        jsonb_build_object('task_id', v_new_task_id, 'target_stage_id', v_target_stage_id, 'merge_config', v_merge_config),
        v_user_id
    );

    -- 10. Log activity on parent
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'sub_card_created', 'Card de alteração criado: ' || p_titulo,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo, 'mode', p_mode, 'merge_config', v_merge_config),
        v_user_id, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'task_id', v_new_task_id,
        'mode', p_mode,
        'parent_id', p_parent_id,
        'merge_config', v_merge_config
    );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 3. Atualizar merge_sub_card — transferir texto e viagem
-- ══════════════════════════════════════════════════════════════

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
    v_is_planner_won BOOLEAN;
    -- Merge config
    v_merge_config JSONB;
    v_text_mode TEXT;
    v_viagem_mode TEXT;
    -- Text merge vars
    v_separator TEXT;
    v_new_obs TEXT;
    v_parent_brief_obs JSONB;
    v_sub_brief_obs JSONB;
    v_merged_brief_obs JSONB;
    -- Viagem merge vars
    v_parent_destinos JSONB;
    v_sub_destinos JSONB;
    v_merged_destinos JSONB;
    -- Monde numbers
    v_sub_monde TEXT;
    -- Snapshot for audit
    v_parent_snapshot JSONB;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get sub-card with validation
    SELECT c.*
    INTO v_sub_card
    FROM cards c
    WHERE c.id = p_sub_card_id
      AND c.card_type = 'sub_card'
      AND c.sub_card_status = 'active'
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card não encontrado ou não está ativo');
    END IF;

    -- Check is_planner_won (NOT is_won)
    SELECT s.is_planner_won INTO v_is_planner_won
    FROM pipeline_stages s WHERE s.id = v_sub_card.pipeline_stage_id;

    IF NOT COALESCE(v_is_planner_won, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card deve estar em etapa "Ganho Planner" para fazer merge');
    END IF;

    -- 2. Get parent card
    SELECT * INTO v_parent
    FROM cards
    WHERE id = v_sub_card.parent_card_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai não encontrado');
    END IF;

    -- 3. Resolve merge_config (p_options override > sub-card stored > default)
    v_merge_config := COALESCE(
        p_options->'merge_config',
        v_sub_card.merge_config,
        '{"texto":{"merge_mode":"replace"},"viagem":{"merge_mode":"replace"}}'::jsonb
    );
    v_text_mode := COALESCE(v_merge_config->'texto'->>'merge_mode', 'replace');
    v_viagem_mode := COALESCE(v_merge_config->'viagem'->>'merge_mode', 'replace');

    -- 4. Calculate value
    v_old_parent_value := COALESCE(v_parent.valor_final, v_parent.valor_estimado, 0);
    v_sub_card_value := COALESCE(v_sub_card.valor_final, v_sub_card.valor_estimado, 0);

    IF v_sub_card.sub_card_mode = 'complete' AND v_sub_card_value = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card em modo "completo" com valor zero. Defina um valor antes de fazer merge.');
    END IF;

    IF v_sub_card.sub_card_mode = 'incremental' THEN
        v_new_parent_value := v_old_parent_value + v_sub_card_value;
    ELSE
        v_new_parent_value := v_sub_card_value;
    END IF;

    -- 5. Snapshot parent text/trip data for audit
    v_parent_snapshot := jsonb_build_object(
        'observacoes', v_parent.produto_data->>'observacoes',
        'briefing_observacoes', v_parent.briefing_inicial->'observacoes',
        'destinos', v_parent.produto_data->'destinos',
        'orcamento', v_parent.produto_data->'orcamento',
        'epoca_viagem', v_parent.produto_data->'epoca_viagem',
        'duracao_viagem', v_parent.produto_data->'duracao_viagem',
        'quantidade_viajantes', v_parent.produto_data->'quantidade_viajantes'
    );

    -- 6. Update parent value
    UPDATE cards
    SET valor_final = v_new_parent_value, updated_at = now()
    WHERE id = v_parent.id;

    -- ══════════════════════════════════════════════════════════
    -- 7. MERGE GRUPO TEXTO (observacoes livres + briefing SDR)
    -- ══════════════════════════════════════════════════════════

    v_separator := E'\n\n--- Alteração: ' || v_sub_card.titulo || ' (' || to_char(now(), 'DD/MM/YYYY') || E') ---\n\n';

    IF v_text_mode = 'replace' THEN
        -- Replace: overwrite parent text fields with sub-card's
        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb) || jsonb_build_object(
                'observacoes', COALESCE(v_sub_card.produto_data->>'observacoes', '')
            ),
            briefing_inicial = COALESCE(briefing_inicial, '{}'::jsonb) || jsonb_build_object(
                'observacoes', COALESCE(v_sub_card.briefing_inicial->'observacoes', '{}'::jsonb)
            ),
            updated_at = now()
        WHERE id = v_parent.id;

    ELSIF v_text_mode = 'append' THEN
        -- Append observacoes livres
        v_new_obs := COALESCE(v_parent.produto_data->>'observacoes', '');
        IF COALESCE(v_sub_card.produto_data->>'observacoes', '') != '' THEN
            IF v_new_obs != '' THEN
                v_new_obs := v_new_obs || v_separator;
            END IF;
            v_new_obs := v_new_obs || COALESCE(v_sub_card.produto_data->>'observacoes', '');
        END IF;

        -- Append briefing estruturado (key by key)
        v_parent_brief_obs := COALESCE(v_parent.briefing_inicial->'observacoes', '{}'::jsonb);
        v_sub_brief_obs := COALESCE(v_sub_card.briefing_inicial->'observacoes', '{}'::jsonb);

        -- Start with parent keys, then merge sub-card keys
        v_merged_brief_obs := v_parent_brief_obs;

        IF v_sub_brief_obs != '{}'::jsonb THEN
            SELECT v_merged_brief_obs || COALESCE(jsonb_object_agg(key,
                CASE
                    WHEN v_parent_brief_obs ? key
                     AND jsonb_typeof(v_parent_brief_obs->key) = 'string'
                     AND jsonb_typeof(value) = 'string'
                     AND (v_parent_brief_obs->>key) != ''
                     AND (value#>>'{}') != ''
                    THEN to_jsonb((v_parent_brief_obs->>key) || v_separator || (value#>>'{}'))
                    WHEN (value#>>'{}') != '' OR jsonb_typeof(value) != 'string'
                    THEN value
                    ELSE COALESCE(v_parent_brief_obs->key, value)
                END
            ), '{}'::jsonb)
            INTO v_merged_brief_obs
            FROM jsonb_each(v_sub_brief_obs);
        END IF;

        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb) || jsonb_build_object('observacoes', v_new_obs),
            briefing_inicial = COALESCE(briefing_inicial, '{}'::jsonb) || jsonb_build_object('observacoes', v_merged_brief_obs),
            updated_at = now()
        WHERE id = v_parent.id;
    END IF;

    -- ══════════════════════════════════════════════════════════
    -- 8. MERGE GRUPO VIAGEM (destinos, orcamento, epoca, etc.)
    -- ══════════════════════════════════════════════════════════

    IF v_viagem_mode = 'replace' THEN
        -- Replace: overwrite trip fields
        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb)
                || CASE WHEN v_sub_card.produto_data ? 'destinos'
                        THEN jsonb_build_object('destinos', v_sub_card.produto_data->'destinos')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'orcamento'
                        THEN jsonb_build_object('orcamento', v_sub_card.produto_data->'orcamento')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'epoca_viagem'
                        THEN jsonb_build_object('epoca_viagem', v_sub_card.produto_data->'epoca_viagem')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'duracao_viagem'
                        THEN jsonb_build_object('duracao_viagem', v_sub_card.produto_data->'duracao_viagem')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'quantidade_viajantes'
                        THEN jsonb_build_object('quantidade_viajantes', v_sub_card.produto_data->'quantidade_viajantes')
                        ELSE '{}'::jsonb END,
            -- Also update normalized columns
            data_viagem_inicio = COALESCE(v_sub_card.data_viagem_inicio, data_viagem_inicio),
            data_viagem_fim = COALESCE(v_sub_card.data_viagem_fim, data_viagem_fim),
            updated_at = now()
        WHERE id = v_parent.id;

    ELSIF v_viagem_mode = 'append' THEN
        -- Append: merge intelligently per field type
        -- destinos: concatenate arrays without duplicates
        v_parent_destinos := COALESCE(v_parent.produto_data->'destinos', '[]'::jsonb);
        v_sub_destinos := COALESCE(v_sub_card.produto_data->'destinos', '[]'::jsonb);

        IF jsonb_typeof(v_parent_destinos) = 'array' AND jsonb_typeof(v_sub_destinos) = 'array' THEN
            SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
            INTO v_merged_destinos
            FROM (
                SELECT jsonb_array_elements(v_parent_destinos) AS elem
                UNION
                SELECT jsonb_array_elements(v_sub_destinos) AS elem
            ) combined;
        ELSE
            v_merged_destinos := COALESCE(v_sub_destinos, v_parent_destinos);
        END IF;

        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb)
                || jsonb_build_object('destinos', v_merged_destinos)
                -- orcamento, epoca, duracao: use sub-card value (append doesn't make sense for objects)
                || CASE WHEN v_sub_card.produto_data ? 'orcamento'
                        THEN jsonb_build_object('orcamento', v_sub_card.produto_data->'orcamento')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'epoca_viagem'
                        THEN jsonb_build_object('epoca_viagem', v_sub_card.produto_data->'epoca_viagem')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'duracao_viagem'
                        THEN jsonb_build_object('duracao_viagem', v_sub_card.produto_data->'duracao_viagem')
                        ELSE '{}'::jsonb END
                -- quantidade_viajantes: sum
                || CASE WHEN v_sub_card.produto_data ? 'quantidade_viajantes'
                        THEN jsonb_build_object('quantidade_viajantes',
                            to_jsonb(
                                COALESCE((v_parent.produto_data->>'quantidade_viajantes')::int, 0)
                                + COALESCE((v_sub_card.produto_data->>'quantidade_viajantes')::int, 0)
                            )
                        )
                        ELSE '{}'::jsonb END,
            data_viagem_inicio = COALESCE(v_sub_card.data_viagem_inicio, data_viagem_inicio),
            data_viagem_fim = COALESCE(v_sub_card.data_viagem_fim, data_viagem_fim),
            updated_at = now()
        WHERE id = v_parent.id;
    END IF;

    -- ══════════════════════════════════════════════════════════
    -- 9. Transfer numero_venda_monde (existing logic)
    -- ══════════════════════════════════════════════════════════

    BEGIN
        v_sub_monde := v_sub_card.produto_data->>'numero_venda_monde';
        IF v_sub_monde IS NOT NULL AND v_sub_monde != '' THEN
            UPDATE cards
            SET produto_data = COALESCE(produto_data, '{}'::jsonb)
                || jsonb_build_object('numero_venda_monde', v_sub_monde)
                || jsonb_build_object('numeros_venda_monde_historico',
                    COALESCE(produto_data->'numeros_venda_monde_historico', '[]'::jsonb)
                    || to_jsonb(v_sub_monde)
                ),
                updated_at = now()
            WHERE id = v_parent.id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Non-critical
    END;

    -- 10. Mark sub-card as merged
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
            'merge_config', v_merge_config,
            'parent_snapshot', v_parent_snapshot,
            'monde_number_transferred', v_sub_monde
        ),
        updated_at = now()
    WHERE id = p_sub_card_id;

    -- 11. Mark change request task as completed
    UPDATE tarefas
    SET
        concluida = true,
        concluida_em = now(),
        concluido_por = v_user_id,
        outcome = 'concluido',
        updated_at = now()
    WHERE card_id = v_parent.id
      AND tipo = 'solicitacao_mudanca'
      AND metadata->>'sub_card_id' = p_sub_card_id::text
      AND COALESCE(concluida, false) = false;

    -- 12. Get accepted proposal
    SELECT id INTO v_proposal_id
    FROM proposals
    WHERE card_id = p_sub_card_id
      AND status = 'accepted'
    ORDER BY updated_at DESC
    LIMIT 1;

    -- 13. Log merge
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, old_value, new_value, metadata, created_by)
    VALUES (
        p_sub_card_id, v_parent.id, 'merged',
        jsonb_build_object('valor', v_old_parent_value),
        jsonb_build_object('valor', v_new_parent_value),
        jsonb_build_object(
            'mode', v_sub_card.sub_card_mode,
            'sub_card_value', v_sub_card_value,
            'proposal_id', v_proposal_id,
            'merge_config', v_merge_config,
            'monde_number_transferred', v_sub_monde
        ),
        v_user_id
    );

    -- 14. Log activity on parent
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        v_parent.id, 'sub_card_merged',
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
            'merge_config', v_merge_config
        ),
        v_user_id, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'parent_id', v_parent.id,
        'old_value', v_old_parent_value,
        'new_value', v_new_parent_value,
        'mode', v_sub_card.sub_card_mode,
        'proposal_id', v_proposal_id,
        'merge_config', v_merge_config
    );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 4. Atualizar get_sub_cards — retornar merge_config
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_sub_cards(p_parent_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'titulo', c.titulo,
            'sub_card_mode', c.sub_card_mode,
            'sub_card_status', c.sub_card_status,
            'valor_estimado', c.valor_estimado,
            'valor_final', c.valor_final,
            'status_comercial', c.status_comercial,
            'ganho_planner', COALESCE(c.ganho_planner, false),
            'is_planner_won', COALESCE(s.is_planner_won, false),
            'etapa_nome', s.nome,
            'fase', s.fase,
            'merged_at', c.merged_at,
            'merge_metadata', c.merge_metadata,
            'merge_config', c.merge_config,
            'created_at', c.created_at,
            'dono_nome', p.nome
        ) ORDER BY
            CASE c.sub_card_status
                WHEN 'active' THEN 1
                WHEN 'merged' THEN 2
                ELSE 3
            END,
            c.created_at DESC
    ), '[]'::jsonb)
    INTO v_result
    FROM cards c
    LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN profiles p ON c.dono_atual_id = p.id
    WHERE c.parent_card_id = p_parent_id
      AND c.card_type = 'sub_card'
      AND c.deleted_at IS NULL;

    RETURN v_result;
END;
$$;

COMMIT;
