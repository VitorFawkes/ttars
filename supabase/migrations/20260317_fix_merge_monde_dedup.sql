-- ============================================================
-- Fix: merge_sub_card Monde numbers — structured objects + dedup
-- A migration anterior (20260316) simplificou a seção 9 e quebrou:
--   1. Appendava string crua ao invés de objeto {numero, origem, ...}
--   2. Não fazia dedup — mesmo número era adicionado múltiplas vezes
-- Esta migration restaura a lógica correta da 20260313.
-- ============================================================

BEGIN;

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
    -- Monde numbers (restored full vars)
    v_sub_monde TEXT;
    v_parent_monde TEXT;
    v_parent_pd JSONB;
    v_historico JSONB;
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
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
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
        v_new_obs := COALESCE(v_parent.produto_data->>'observacoes', '');
        IF COALESCE(v_sub_card.produto_data->>'observacoes', '') != '' THEN
            IF v_new_obs != '' THEN
                v_new_obs := v_new_obs || v_separator;
            END IF;
            v_new_obs := v_new_obs || COALESCE(v_sub_card.produto_data->>'observacoes', '');
        END IF;

        v_parent_brief_obs := COALESCE(v_parent.briefing_inicial->'observacoes', '{}'::jsonb);
        v_sub_brief_obs := COALESCE(v_sub_card.briefing_inicial->'observacoes', '{}'::jsonb);

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
            data_viagem_inicio = COALESCE(v_sub_card.data_viagem_inicio, data_viagem_inicio),
            data_viagem_fim = COALESCE(v_sub_card.data_viagem_fim, data_viagem_fim),
            updated_at = now()
        WHERE id = v_parent.id;

    ELSIF v_viagem_mode = 'append' THEN
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
    -- 9. Transfer numero_venda_monde (FIXED: structured objects + dedup)
    -- ══════════════════════════════════════════════════════════

    BEGIN
        v_sub_monde := v_sub_card.produto_data->>'numero_venda_monde';

        IF v_sub_monde IS NOT NULL AND v_sub_monde != '' THEN
            -- Re-read parent produto_data (may have been updated by sections 7/8)
            SELECT produto_data INTO v_parent_pd
            FROM cards WHERE id = v_parent.id;

            v_parent_pd := COALESCE(v_parent_pd, '{}'::jsonb);
            v_historico := COALESCE(v_parent_pd->'numeros_venda_monde_historico', '[]'::jsonb);
            v_parent_monde := v_parent_pd->>'numero_venda_monde';

            -- Step 1: Ensure parent's original number is in historico (dedup)
            IF v_parent_monde IS NOT NULL AND v_parent_monde != '' THEN
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

            -- Step 2: Add sub-card's number (dedup — skip if already exists)
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

            -- Step 3: Update parent with new primary + full historico
            UPDATE cards
            SET produto_data = v_parent_pd
                    || jsonb_build_object('numero_venda_monde', v_sub_monde)
                    || jsonb_build_object('numeros_venda_monde_historico', v_historico),
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
        outcome = 'concluido'
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

COMMIT;
