-- ============================================================
-- Migration: Sub-Card System Fixes
-- Date: 2026-03-13
--
-- Changes:
--   1. merge_sub_card: check is_planner_won instead of is_won
--   2. criar_sub_card: add group parent validation
--   3. get_sub_cards: add ganho_planner field
--   4. log_outbound_card_event: skip sub-cards (never sync to AC)
--   5. WhatsApp: deferred (function too large)
--   6. Analytics RPCs: exclude sub-cards (card_type != 'sub_card')
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- SECTION 1: Fix merge_sub_card — is_planner_won instead of is_won
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

    -- Check if sub-card is in Planner "won" stage (is_planner_won, NOT is_won)
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

    -- 3. Calculate new value based on mode
    v_old_parent_value := COALESCE(v_parent.valor_final, v_parent.valor_estimado, 0);
    v_sub_card_value := COALESCE(v_sub_card.valor_final, v_sub_card.valor_estimado, 0);

    -- Safety: complete mode with zero value
    IF v_sub_card.sub_card_mode = 'complete' AND v_sub_card_value = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card em modo "completo" com valor zero. Defina um valor antes de fazer merge.');
    END IF;

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
            'mode', v_sub_card.sub_card_mode
        ),
        updated_at = now()
    WHERE id = p_sub_card_id;

    -- 6. Mark the change request task as completed
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

    -- 7. Get accepted proposal from sub-card (if any) for reference
    SELECT id INTO v_proposal_id
    FROM proposals
    WHERE card_id = p_sub_card_id
      AND status = 'accepted'
    ORDER BY updated_at DESC
    LIMIT 1;

    -- 8. Log the merge
    INSERT INTO sub_card_sync_log (
        sub_card_id, parent_card_id, action, old_value, new_value, metadata, created_by
    )
    VALUES (
        p_sub_card_id, v_parent.id, 'merged',
        jsonb_build_object('valor', v_old_parent_value),
        jsonb_build_object('valor', v_new_parent_value),
        jsonb_build_object('mode', v_sub_card.sub_card_mode, 'sub_card_value', v_sub_card_value, 'proposal_id', v_proposal_id),
        v_user_id
    );

    -- 9. Log activity on parent
    INSERT INTO activities (
        card_id, tipo, descricao, metadata, created_by, created_at
    )
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
            'proposal_id', v_proposal_id
        ),
        v_user_id, now()
    );

    -- 10. Transfer numero_venda_monde if applicable
    BEGIN
        IF v_sub_card.produto_data IS NOT NULL
           AND v_sub_card.produto_data->>'numero_venda_monde' IS NOT NULL
           AND v_sub_card.produto_data->>'numero_venda_monde' != '' THEN

            UPDATE cards
            SET produto_data = COALESCE(produto_data, '{}'::jsonb)
                || jsonb_build_object('numero_venda_monde', v_sub_card.produto_data->>'numero_venda_monde')
                || jsonb_build_object('numeros_venda_monde_historico',
                    COALESCE(produto_data->'numeros_venda_monde_historico', '[]'::jsonb)
                    || to_jsonb(v_sub_card.produto_data->>'numero_venda_monde')
                ),
                updated_at = now()
            WHERE id = v_parent.id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Non-critical, don't fail the merge
    END;

    RETURN jsonb_build_object(
        'success', true,
        'parent_id', v_parent.id,
        'old_value', v_old_parent_value,
        'new_value', v_new_parent_value,
        'mode', v_sub_card.sub_card_mode,
        'proposal_id', v_proposal_id
    );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- SECTION 2: Fix criar_sub_card — add group parent validation
-- ══════════════════════════════════════════════════════════════

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

    -- Prevent sub-card of group parent
    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar alteração em card agrupador');
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

    -- 3. Buscar etapa "Proposta em Construção" em vez da primeira etapa
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

-- ══════════════════════════════════════════════════════════════
-- SECTION 3: Fix get_sub_cards — add ganho_planner field
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

-- ══════════════════════════════════════════════════════════════
-- SECTION 4: AC Outbound Guard — skip sub-cards
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_outbound_card_event()
RETURNS TRIGGER AS $$
DECLARE
    v_integration_id UUID;
    v_external_id TEXT;
    v_event_type TEXT;
    v_payload JSONB := '{}';
    v_stage_mapping RECORD;
    v_outbound_enabled BOOLEAN := FALSE;
    v_shadow_mode BOOLEAN := TRUE;
    v_allowed_events TEXT;
    v_rule_result RECORD;
    v_card_status TEXT;
    v_changed_fields JSONB := '{}';
    v_jsonb_key TEXT;
BEGIN
    -- Guard 1: Evitar loop infinito (integration-process seta esta variável)
    IF current_setting('app.update_source', TRUE) = 'integration' THEN
        RETURN NEW;
    END IF;

    -- Guard 2: Só cards sincronizados (com external_id)
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Guard: Skip sub-cards (never sync to AC)
    IF NEW.card_type = 'sub_card' THEN
        RETURN NEW;
    END IF;

    -- Guard 3: Buscar integração
    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE provider = NEW.external_source OR name = NEW.external_source
    LIMIT 1;

    IF v_integration_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_external_id := NEW.external_id;

    -- Configurações globais
    SELECT COALESCE(value, 'false')::boolean INTO v_outbound_enabled
    FROM public.integration_settings WHERE key = 'OUTBOUND_SYNC_ENABLED';

    SELECT COALESCE(value, 'true')::boolean INTO v_shadow_mode
    FROM public.integration_settings WHERE key = 'OUTBOUND_SHADOW_MODE';

    SELECT COALESCE(value, 'stage_change,won,lost,field_update') INTO v_allowed_events
    FROM public.integration_settings WHERE key = 'OUTBOUND_ALLOWED_EVENTS';

    IF NOT v_outbound_enabled THEN
        RETURN NEW;
    END IF;

    v_card_status := COALESCE(NEW.status_comercial, 'ativo');

    -- 1. STAGE CHANGE
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        IF v_allowed_events LIKE '%stage_change%' THEN
            v_event_type := 'stage_change';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, v_event_type, NULL
            );

            IF NOT COALESCE(v_rule_result.allowed, true) THEN
                RETURN NEW;
            END IF;

            SELECT * INTO v_stage_mapping
            FROM public.integration_outbound_stage_map
            WHERE integration_id = v_integration_id
              AND internal_stage_id = NEW.pipeline_stage_id
              AND is_active = true
            LIMIT 1;

            IF v_stage_mapping IS NOT NULL THEN
                v_payload := jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'target_external_stage_id', v_stage_mapping.external_stage_id,
                    'target_external_stage_name', v_stage_mapping.external_stage_name,
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;
    END IF;

    -- 2. WON
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial AND NEW.status_comercial = 'ganho' THEN
        IF v_allowed_events LIKE '%won%' THEN
            v_event_type := 'won';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, v_event_type, NULL
            );

            IF NOT COALESCE(v_rule_result.allowed, true) THEN
                RETURN NEW;
            END IF;

            v_payload := jsonb_build_object(
                'status', 'won',
                'valor_final', NEW.valor_final,
                'shadow_mode', v_shadow_mode,
                'matched_rule', v_rule_result.rule_name
            );

            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload,
                status, triggered_by
            ) VALUES (
                NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                'system'
            );
        END IF;
    END IF;

    -- 3. LOST
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial AND NEW.status_comercial = 'perdido' THEN
        IF v_allowed_events LIKE '%lost%' THEN
            v_event_type := 'lost';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, v_event_type, NULL
            );

            IF NOT COALESCE(v_rule_result.allowed, true) THEN
                RETURN NEW;
            END IF;

            v_payload := jsonb_build_object(
                'status', 'lost',
                'motivo_perda', NEW.motivo_perda_id,
                'shadow_mode', v_shadow_mode,
                'matched_rule', v_rule_result.rule_name
            );

            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload,
                status, triggered_by
            ) VALUES (
                NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                'system'
            );
        END IF;
    END IF;

    -- 4. FIELD UPDATES (expanded: all mapped columns)
    IF v_allowed_events LIKE '%field_update%' THEN

        -- Direct columns
        IF OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('valor_estimado', NEW.valor_estimado);
        END IF;

        IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('valor_final', NEW.valor_final);
        END IF;

        IF OLD.data_viagem_inicio IS DISTINCT FROM NEW.data_viagem_inicio THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('data_viagem_inicio', NEW.data_viagem_inicio);
        END IF;

        IF OLD.data_viagem_fim IS DISTINCT FROM NEW.data_viagem_fim THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('data_viagem_fim', NEW.data_viagem_fim);
        END IF;

        IF OLD.prioridade IS DISTINCT FROM NEW.prioridade THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('prioridade', NEW.prioridade);
        END IF;

        IF OLD.origem IS DISTINCT FROM NEW.origem THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('origem', NEW.origem);
        END IF;

        IF OLD.utm_source IS DISTINCT FROM NEW.utm_source THEN
            v_changed_fields := v_changed_fields || jsonb_build_object('utm_source', NEW.utm_source);
        END IF;

        -- JSONB: marketing_data
        IF OLD.marketing_data IS DISTINCT FROM NEW.marketing_data THEN
            FOR v_jsonb_key IN
                SELECT jsonb_object_keys(COALESCE(NEW.marketing_data, '{}'::jsonb))
                UNION
                SELECT jsonb_object_keys(COALESCE(OLD.marketing_data, '{}'::jsonb))
            LOOP
                IF (OLD.marketing_data->>v_jsonb_key) IS DISTINCT FROM (NEW.marketing_data->>v_jsonb_key) THEN
                    v_changed_fields := v_changed_fields || jsonb_build_object(v_jsonb_key, NEW.marketing_data->v_jsonb_key);
                END IF;
            END LOOP;
        END IF;

        -- JSONB: produto_data
        IF OLD.produto_data IS DISTINCT FROM NEW.produto_data THEN
            FOR v_jsonb_key IN
                SELECT jsonb_object_keys(COALESCE(NEW.produto_data, '{}'::jsonb))
                UNION
                SELECT jsonb_object_keys(COALESCE(OLD.produto_data, '{}'::jsonb))
            LOOP
                IF (OLD.produto_data->>v_jsonb_key) IS DISTINCT FROM (NEW.produto_data->>v_jsonb_key) THEN
                    v_changed_fields := v_changed_fields || jsonb_build_object(v_jsonb_key, NEW.produto_data->v_jsonb_key);
                END IF;
            END LOOP;
        END IF;

        -- JSONB: briefing_inicial
        IF OLD.briefing_inicial IS DISTINCT FROM NEW.briefing_inicial THEN
            FOR v_jsonb_key IN
                SELECT jsonb_object_keys(COALESCE(NEW.briefing_inicial, '{}'::jsonb))
                UNION
                SELECT jsonb_object_keys(COALESCE(OLD.briefing_inicial, '{}'::jsonb))
            LOOP
                IF (OLD.briefing_inicial->>v_jsonb_key) IS DISTINCT FROM (NEW.briefing_inicial->>v_jsonb_key) THEN
                    v_changed_fields := v_changed_fields || jsonb_build_object(v_jsonb_key, NEW.briefing_inicial->v_jsonb_key);
                END IF;
            END LOOP;
        END IF;

        -- Se houve mudanças de campo, verificar regras e enfileirar
        IF v_changed_fields != '{}'::jsonb THEN
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, 'field_update', NULL
            );

            IF COALESCE(v_rule_result.allowed, true) THEN
                v_payload := v_changed_fields || jsonb_build_object(
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- NOTE: WhatsApp card-linking (process_whatsapp_raw_event) also needs sub-card filter
-- but the function is too large to safely re-create here. Will be patched separately.

-- ══════════════════════════════════════════════════════════════
-- SECTION 6: Analytics RPCs — Exclude sub-cards
--
-- All analytics RPCs get: AND COALESCE(c.card_type, 'standard') != 'sub_card'
-- wherever cards are queried with deleted_at/archived_at filters.
-- ══════════════════════════════════════════════════════════════

-- ── Drop all overloads for analytics functions ───────────────
DO $$
DECLARE
    fn_names TEXT[] := ARRAY[
        'analytics_funnel_live',
        'analytics_funnel_conversion',
        'analytics_overview_kpis',
        'analytics_sla_summary',
        'analytics_funnel_by_owner',
        'analytics_team_performance',
        'analytics_financial_breakdown',
        'analytics_sla_violations',
        'analytics_drill_down_cards',
        'analytics_operations_summary'
    ];
    fn TEXT;
    r RECORD;
BEGIN
    FOREACH fn IN ARRAY fn_names LOOP
        FOR r IN
            SELECT oid::regprocedure::text AS sig
            FROM pg_proc
            WHERE proname = fn
              AND pronamespace = 'public'::regnamespace
        LOOP
            EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
        END LOOP;
    END LOOP;
END $$;

-- ── 6.1 analytics_funnel_live ────────────────────────────────

CREATE OR REPLACE FUNCTION analytics_funnel_live(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id      UUID,
    stage_nome    TEXT,
    fase          TEXT,
    ordem         INT,
    total_cards   BIGINT,
    valor_total   NUMERIC,
    receita_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.created_at >= p_date_start AND c.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id            AS stage_id,
            s.nome          AS stage_nome,
            s.fase,
            s.ordem::INT,
            COUNT(ae.card_id)::BIGINT AS total_cards,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;

    ELSE
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
              AND CASE
                  WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                      c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
                  WHEN p_mode = 'ganho_sdr' THEN
                      c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
                  WHEN p_mode = 'ganho_planner' THEN
                      c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
                  WHEN p_mode = 'ganho_total' THEN
                      c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
                  ELSE
                      c.created_at >= p_date_start AND c.created_at < p_date_end
              END
        ),
        transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            WHERE a.tipo = 'stage_changed'
              AND a.card_id IN (SELECT pop.card_id FROM population pop)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.id IN (SELECT pop.card_id FROM population pop)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id            AS stage_id,
            s.nome          AS stage_nome,
            s.fase,
            s.ordem::INT,
            COUNT(ae.card_id)::BIGINT AS total_cards,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;
    END IF;
END;
$$;

-- ── 6.2 analytics_funnel_conversion ──────────────────────────

CREATE OR REPLACE FUNCTION analytics_funnel_conversion(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id           UUID,
    stage_nome         TEXT,
    phase_slug         TEXT,
    ordem              INT,
    current_count      BIGINT,
    total_valor        NUMERIC,
    avg_days_in_stage  NUMERIC,
    p75_days_in_stage  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.created_at >= p_date_start AND c.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        ),
        stage_times AS (
            SELECT c.pipeline_stage_id AS sid,
                EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400 AS days
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND c.status_comercial NOT IN ('ganho', 'perdido')
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
        )
        SELECT
            s.id AS stage_id,
            s.nome AS stage_nome,
            COALESCE(s.fase, 'SDR') AS phase_slug,
            s.ordem::INT,
            COUNT(DISTINCT ae.card_id)::BIGINT AS current_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS total_valor,
            COALESCE(ROUND(AVG(st.days), 1), 0)::NUMERIC AS avg_days_in_stage,
            COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY st.days)::NUMERIC, 1), 0)::NUMERIC AS p75_days_in_stage
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN stage_times st ON st.sid = s.id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;

    ELSE
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
              AND CASE
                  WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                      c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
                  WHEN p_mode = 'ganho_sdr' THEN
                      c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
                  WHEN p_mode = 'ganho_planner' THEN
                      c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
                  WHEN p_mode = 'ganho_total' THEN
                      c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
                  ELSE
                      c.created_at >= p_date_start AND c.created_at < p_date_end
              END
        ),
        transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            WHERE a.tipo = 'stage_changed'
              AND a.card_id IN (SELECT pop.card_id FROM population pop)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.id IN (SELECT pop.card_id FROM population pop)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        ),
        stage_times AS (
            SELECT c.pipeline_stage_id AS sid,
                EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400 AS days
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND c.status_comercial NOT IN ('ganho', 'perdido')
              AND c.id IN (SELECT pop.card_id FROM population pop)
        )
        SELECT
            s.id AS stage_id,
            s.nome AS stage_nome,
            COALESCE(s.fase, 'SDR') AS phase_slug,
            s.ordem::INT,
            COUNT(DISTINCT ae.card_id)::BIGINT AS current_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS total_valor,
            COALESCE(ROUND(AVG(st.days), 1), 0)::NUMERIC AS avg_days_in_stage,
            COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY st.days)::NUMERIC, 1), 0)::NUMERIC AS p75_days_in_stage
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN stage_times st ON st.sid = s.id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;
    END IF;
END;
$$;

-- ── 6.3 analytics_overview_kpis ──────────────────────────────

CREATE OR REPLACE FUNCTION analytics_overview_kpis(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    v_taxa_paga_id UUID;
    v_briefing_id UUID;
    v_proposta_id UUID;
    v_viagem_id UUID;
    v_pipeline_id UUID;
BEGIN
    -- Resolve pipeline do produto para filtrar milestones
    IF p_product IS NOT NULL THEN
        SELECT p.id INTO v_pipeline_id FROM pipelines p WHERE p.produto::TEXT = p_product LIMIT 1;
    END IF;

    SELECT s.id INTO v_taxa_paga_id FROM pipeline_stages s
    WHERE s.ativo = true AND s.milestone_key = 'taxa_paga'
      AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    SELECT s.id INTO v_briefing_id FROM pipeline_stages s
    WHERE s.ativo = true AND s.milestone_key = 'briefing'
      AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    SELECT s.id INTO v_proposta_id FROM pipeline_stages s
    WHERE s.ativo = true AND s.milestone_key = 'proposta'
      AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    SELECT s.id INTO v_viagem_id FROM pipeline_stages s
    WHERE s.ativo = true AND s.milestone_key = 'viagem_confirmada'
      AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;

    WITH leads_pool AS (
        SELECT c.id, c.pipeline_stage_id, c.status_comercial,
               c.valor_final, c.receita, c.data_fechamento, c.created_at
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
              ELSE
                  c.created_at >= p_date_start AND c.created_at < p_date_end
          END
    ),
    outcomes_pool AS (
        SELECT c.id, c.status_comercial, c.valor_final, c.receita,
               c.data_fechamento, c.created_at
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.status_comercial IN ('ganho', 'perdido')
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
              ELSE
                  c.created_at >= p_date_start AND c.created_at < p_date_end
          END
    ),
    milestone_proof AS (
        SELECT DISTINCT a.card_id, (a.metadata->>'new_stage_id')::UUID AS proved_stage_id
        FROM activities a
        WHERE a.tipo = 'stage_changed'
          AND a.card_id IN (SELECT lp.id FROM leads_pool lp)
          AND (a.metadata->>'new_stage_id')::UUID IN (v_taxa_paga_id, v_briefing_id, v_proposta_id, v_viagem_id)
    )
    SELECT json_build_object(
        'total_leads', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool),
        'total_won', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'total_lost', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'perdido'),
        'total_open', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE status_comercial NOT IN ('ganho', 'perdido')),
        'conversao_venda_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0
            THEN ROUND(
                (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'receita_total', (SELECT COALESCE(SUM(valor_final), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'margem_total', (SELECT COALESCE(SUM(receita), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'ticket_medio', CASE
            WHEN (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho') > 0
            THEN (SELECT ROUND(SUM(valor_final) / COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho')
            ELSE 0
        END,
        'ciclo_medio_dias', (
            SELECT COALESCE(ROUND(AVG(
                EXTRACT(EPOCH FROM (o.data_fechamento::TIMESTAMPTZ - o.created_at)) / 86400
            ), 1), 0)
            FROM outcomes_pool o
            WHERE o.status_comercial = 'ganho'
              AND o.data_fechamento IS NOT NULL
              AND o.data_fechamento::TIMESTAMPTZ > o.created_at
        ),
        'viagens_vendidas', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'taxa_paga_count', CASE WHEN v_taxa_paga_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_taxa_paga_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_taxa_paga_id)
        ) ELSE 0 END,
        'taxa_paga_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_taxa_paga_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_taxa_paga_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_taxa_paga_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'briefing_count', CASE WHEN v_briefing_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_briefing_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_briefing_id)
        ) ELSE 0 END,
        'briefing_agendado_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_briefing_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_briefing_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_briefing_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'proposta_count', CASE WHEN v_proposta_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_proposta_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_proposta_id)
        ) ELSE 0 END,
        'proposta_enviada_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_proposta_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_proposta_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_proposta_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'viagem_confirmada_count', CASE WHEN v_viagem_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_viagem_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_viagem_id)
        ) ELSE 0 END,
        'viagem_confirmada_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_viagem_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_viagem_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_viagem_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END
    ) INTO result;

    RETURN result;
END;
$$;

-- ── 6.4 analytics_sla_summary ────────────────────────────────

CREATE OR REPLACE FUNCTION analytics_sla_summary(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01', p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL, p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL, p_owner_id UUID DEFAULT NULL,
    p_owner_ids UUID[] DEFAULT NULL, p_tag_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(stage_nome TEXT, sla_hours INT, total_cards BIGINT, compliant_cards BIGINT,
    violating_cards BIGINT, compliance_rate NUMERIC, avg_hours_in_stage NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT s.nome, COALESCE(s.sla_hours, 0)::INT,
        COUNT(c.id)::BIGINT,
        COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 <= s.sla_hours)::BIGINT,
        COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 > s.sla_hours)::BIGINT,
        CASE WHEN COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0) > 0
            THEN ROUND(
                COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0
                    AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 <= s.sla_hours)::NUMERIC
                / COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0)::NUMERIC * 100, 1)
            ELSE NULL END,
        COALESCE(ROUND(AVG(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600
        ), 1), 0)::NUMERIC
    FROM pipeline_stages s
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    JOIN pipelines pip ON pip.id = s.pipeline_id
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND COALESCE(c.card_type, 'standard') != 'sub_card'
        AND c.status_comercial NOT IN ('ganho', 'perdido')
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
        AND _a_tag_ok(c.id, p_tag_ids)
        AND CASE
            WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
            WHEN p_mode = 'ganho_sdr' THEN
                c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
            WHEN p_mode = 'ganho_planner' THEN
                c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
            WHEN p_mode = 'ganho_total' THEN
                c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
            ELSE
                c.created_at >= p_date_start AND c.created_at < p_date_end
        END
    WHERE s.ativo = true
      AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    GROUP BY s.id, s.nome, s.sla_hours, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

-- ── 6.5 analytics_funnel_by_owner ────────────────────────────

CREATE OR REPLACE FUNCTION analytics_funnel_by_owner(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id      UUID,
    stage_nome    TEXT,
    fase          TEXT,
    ordem         INT,
    owner_id      UUID,
    owner_name    TEXT,
    card_count    BIGINT,
    valor_total   NUMERIC,
    receita_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.created_at >= p_date_start AND c.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id                                        AS stage_id,
            s.nome                                      AS stage_nome,
            s.fase,
            s.ordem::INT,
            c.dono_atual_id                             AS owner_id,
            COALESCE(p.nome, 'Não atribuído')           AS owner_name,
            COUNT(ae.card_id)::BIGINT                   AS card_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC        AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index, c.dono_atual_id, p.nome
        ORDER BY pp.order_index, s.ordem, p.nome NULLS LAST;

    ELSE
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND COALESCE(c.card_type, 'standard') != 'sub_card'
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
              AND CASE
                  WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                      c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
                  WHEN p_mode = 'ganho_sdr' THEN
                      c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
                  WHEN p_mode = 'ganho_planner' THEN
                      c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
                  WHEN p_mode = 'ganho_total' THEN
                      c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
                  ELSE
                      c.created_at >= p_date_start AND c.created_at < p_date_end
              END
        ),
        transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            WHERE a.tipo = 'stage_changed'
              AND a.card_id IN (SELECT pop.card_id FROM population pop)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.id IN (SELECT pop.card_id FROM population pop)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id                                        AS stage_id,
            s.nome                                      AS stage_nome,
            s.fase,
            s.ordem::INT,
            c.dono_atual_id                             AS owner_id,
            COALESCE(p.nome, 'Não atribuído')           AS owner_name,
            COUNT(ae.card_id)::BIGINT                   AS card_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC        AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index, c.dono_atual_id, p.nome
        ORDER BY pp.order_index, s.ordem, p.nome NULLS LAST;
    END IF;
END;
$$;

-- ── 6.6 analytics_team_performance ───────────────────────────

CREATE OR REPLACE FUNCTION analytics_team_performance(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_phase      TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID, user_nome TEXT, phase TEXT,
    total_cards BIGINT, won_cards BIGINT, lost_cards BIGINT, open_cards BIGINT,
    conversion_rate NUMERIC, total_receita NUMERIC, ticket_medio NUMERIC,
    ciclo_medio_dias NUMERIC, active_cards BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- SDR metrics
    SELECT
        p.id AS user_id, p.nome AS user_nome, 'SDR'::TEXT AS phase,
        COUNT(c.id)::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'perdido')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT,
        CASE WHEN COUNT(c.id) > 0
            THEN ROUND(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::NUMERIC / COUNT(c.id)::NUMERIC * 100, 1)
            ELSE 0 END,
        COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0)::NUMERIC,
        CASE WHEN COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho') > 0
            THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho') / COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0)
            ELSE 0 END,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.data_fechamento::TIMESTAMPTZ - c.created_at)) / 86400)
            FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL), 1), 0),
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT
    FROM profiles p
    INNER JOIN cards c ON c.sdr_owner_id = p.id
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND COALESCE(c.card_type, 'standard') != 'sub_card'
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
        AND _a_tag_ok(c.id, p_tag_ids)
        AND CASE
            WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
            WHEN p_mode = 'ganho_sdr' THEN
                c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
            WHEN p_mode = 'ganho_planner' THEN
                c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
            WHEN p_mode = 'ganho_total' THEN
                c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
            ELSE
                c.created_at >= p_date_start AND c.created_at < p_date_end
        END
    WHERE (p_phase IS NULL OR p_phase = 'SDR')
    GROUP BY p.id, p.nome

    UNION ALL

    -- Planner metrics
    SELECT
        p.id, p.nome, 'Vendas'::TEXT,
        COUNT(c.id)::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'perdido')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT,
        CASE WHEN COUNT(c.id) > 0
            THEN ROUND(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::NUMERIC / COUNT(c.id)::NUMERIC * 100, 1)
            ELSE 0 END,
        COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0)::NUMERIC,
        CASE WHEN COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho') > 0
            THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho') / COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0)
            ELSE 0 END,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.data_fechamento::TIMESTAMPTZ - c.created_at)) / 86400)
            FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL), 1), 0),
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT
    FROM profiles p
    INNER JOIN cards c ON c.vendas_owner_id = p.id
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND COALESCE(c.card_type, 'standard') != 'sub_card'
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
        AND _a_tag_ok(c.id, p_tag_ids)
        AND CASE
            WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
            WHEN p_mode = 'ganho_sdr' THEN
                c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
            WHEN p_mode = 'ganho_planner' THEN
                c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
            WHEN p_mode = 'ganho_total' THEN
                c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
            ELSE
                c.created_at >= p_date_start AND c.created_at < p_date_end
        END
    WHERE (p_phase IS NULL OR p_phase = 'Vendas')
    GROUP BY p.id, p.nome

    UNION ALL

    -- Pos-Venda metrics
    SELECT
        p.id, p.nome, 'Pos-Venda'::TEXT,
        COUNT(c.id)::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'perdido')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT,
        CASE WHEN COUNT(c.id) > 0
            THEN ROUND(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::NUMERIC / COUNT(c.id)::NUMERIC * 100, 1)
            ELSE 0 END,
        COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0)::NUMERIC,
        CASE WHEN COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho') > 0
            THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho') / COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0)
            ELSE 0 END,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.data_fechamento::TIMESTAMPTZ - c.created_at)) / 86400)
            FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL), 1), 0),
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT
    FROM profiles p
    INNER JOIN cards c ON c.pos_owner_id = p.id
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND COALESCE(c.card_type, 'standard') != 'sub_card'
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
        AND _a_tag_ok(c.id, p_tag_ids)
        AND CASE
            WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
            WHEN p_mode = 'ganho_sdr' THEN
                c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
            WHEN p_mode = 'ganho_planner' THEN
                c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
            WHEN p_mode = 'ganho_total' THEN
                c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
            ELSE
                c.created_at >= p_date_start AND c.created_at < p_date_end
        END
    WHERE (p_phase IS NULL OR p_phase = 'Pos-Venda')
    GROUP BY p.id, p.nome

    ORDER BY total_cards DESC;
END;
$$;

-- ── 6.7 analytics_financial_breakdown ────────────────────────

CREATE OR REPLACE FUNCTION analytics_financial_breakdown(
    p_date_start  DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_granularity TEXT DEFAULT 'month', p_product TEXT DEFAULT NULL,
    p_mode        TEXT DEFAULT 'entries', p_stage_id UUID DEFAULT NULL,
    p_owner_id    UUID DEFAULT NULL, p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids     UUID[] DEFAULT NULL
)
RETURNS TABLE(period TEXT, valor_final_sum NUMERIC, receita_sum NUMERIC, count_won BIGINT, ticket_medio NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE p_granularity
            WHEN 'day'  THEN TO_CHAR(c.data_fechamento, 'YYYY-MM-DD')
            WHEN 'week' THEN TO_CHAR(DATE_TRUNC('week', c.data_fechamento), 'YYYY-MM-DD')
            ELSE TO_CHAR(DATE_TRUNC('month', c.data_fechamento), 'YYYY-MM')
        END AS period,
        COALESCE(SUM(c.valor_final), 0), COALESCE(SUM(c.receita), 0),
        COUNT(*),
        CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(c.valor_final), 0) / COUNT(*), 2) ELSE 0 END
    FROM cards c
    WHERE c.status_comercial = 'ganho' AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND c.data_fechamento IS NOT NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                  p_stage_id, COALESCE(p_date_start, '2020-01-01'::DATE)::TIMESTAMPTZ,
                  COALESCE(p_date_end + 1, '2099-01-01'::DATE)::TIMESTAMPTZ, p_product))
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true
              AND (p_date_start IS NULL OR c.ganho_sdr_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_sdr_at < (p_date_end + 1)::TIMESTAMPTZ)
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true
              AND (p_date_start IS NULL OR c.ganho_planner_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_planner_at < (p_date_end + 1)::TIMESTAMPTZ)
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true
              AND (p_date_start IS NULL OR c.ganho_pos_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_pos_at < (p_date_end + 1)::TIMESTAMPTZ)
          ELSE
              (p_date_start IS NULL OR c.created_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.created_at < (p_date_end + 1)::TIMESTAMPTZ)
      END
    GROUP BY 1 ORDER BY 1;
END;
$$;

-- ── 6.8 analytics_sla_violations ─────────────────────────────

CREATE OR REPLACE FUNCTION analytics_sla_violations(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01', p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL, p_mode TEXT DEFAULT 'entries',
    p_limit INT DEFAULT 50, p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL, p_owner_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(card_id UUID, titulo TEXT, stage_nome TEXT, owner_nome TEXT,
    dias_na_etapa NUMERIC, sla_hours INT, sla_exceeded_hours NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.titulo, s.nome, p.nome,
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400, 1),
        COALESCE(s.sla_hours, 0)::INT,
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 - COALESCE(s.sla_hours, 0), 1)
    FROM cards c
    INNER JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN profiles p ON p.id = c.dono_atual_id
    WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND c.status_comercial NOT IN ('ganho', 'perdido')
      AND s.sla_hours IS NOT NULL AND s.sla_hours > 0
      AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 > s.sla_hours
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
          ELSE
              c.created_at >= p_date_start AND c.created_at < p_date_end
      END
    ORDER BY sla_exceeded_hours DESC LIMIT p_limit;
END;
$$;

-- ── 6.9 analytics_drill_down_cards ───────────────────────────

CREATE OR REPLACE FUNCTION analytics_drill_down_cards(
    -- Filtros globais
    p_date_start   TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end     TIMESTAMPTZ DEFAULT NOW(),
    p_product      TEXT DEFAULT NULL,
    p_mode         TEXT DEFAULT 'entries',
    p_global_stage_id UUID DEFAULT NULL,
    p_global_owner_id UUID DEFAULT NULL,
    -- Contexto do drill-down
    p_drill_stage_id    UUID DEFAULT NULL,
    p_drill_owner_id    UUID DEFAULT NULL,
    p_drill_loss_reason TEXT DEFAULT NULL,
    p_drill_status      TEXT DEFAULT NULL,
    p_drill_phase       TEXT DEFAULT NULL,
    p_drill_period_start TIMESTAMPTZ DEFAULT NULL,
    p_drill_period_end   TIMESTAMPTZ DEFAULT NULL,
    -- Source
    p_drill_source TEXT DEFAULT 'default',
    -- Paginação
    p_sort_by  TEXT DEFAULT 'created_at',
    p_sort_dir TEXT DEFAULT 'desc',
    p_limit    INT DEFAULT 50,
    p_offset   INT DEFAULT 0,
    -- Filtro por destino
    p_drill_destino TEXT DEFAULT NULL,
    -- exclude terminal + tags + multi-owner
    p_exclude_terminal BOOLEAN DEFAULT FALSE,
    p_tag_ids    UUID[] DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    titulo TEXT,
    produto TEXT,
    status_comercial TEXT,
    etapa_nome TEXT,
    fase TEXT,
    dono_atual_nome TEXT,
    valor_display NUMERIC,
    receita NUMERIC,
    created_at TIMESTAMPTZ,
    data_fechamento TIMESTAMPTZ,
    pessoa_nome TEXT,
    pessoa_telefone TEXT,
    total_count BIGINT,
    stage_entered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_query TEXT;
    v_where TEXT := '';
    v_order TEXT;
    v_source TEXT := COALESCE(p_drill_source, 'default');
    v_period_start TIMESTAMPTZ;
    v_period_end   TIMESTAMPTZ;
    v_is_entries_mode BOOLEAN;
BEGIN
    v_is_entries_mode := (p_mode = 'entries' OR p_mode IS NULL
        OR (p_mode = 'stage_entry' AND p_global_stage_id IS NULL));

    -- 1. FILTROS GLOBAIS
    IF p_product IS NOT NULL THEN
        v_where := v_where || format(' AND c.produto::TEXT = %L', p_product);
    END IF;

    IF p_owner_ids IS NOT NULL AND array_length(p_owner_ids, 1) > 0 THEN
        v_where := v_where || format(' AND c.dono_atual_id = ANY(%L::UUID[])', p_owner_ids);
    ELSIF p_global_owner_id IS NOT NULL THEN
        v_where := v_where || format(' AND c.dono_atual_id = %L', p_global_owner_id);
    END IF;

    IF p_drill_destino IS NOT NULL THEN
        v_where := v_where || format(
            ' AND EXISTS (
                SELECT 1 FROM contact_stats cs2
                CROSS JOIN LATERAL jsonb_array_elements(cs2.top_destinations) AS d(elem)
                WHERE cs2.contact_id = c.pessoa_principal_id
                  AND cs2.top_destinations IS NOT NULL
                  AND jsonb_typeof(cs2.top_destinations) = ''array''
                  AND jsonb_array_length(cs2.top_destinations) > 0
                  AND (d.elem #>> ''{}'' = %L OR d.elem->>''name'' = %L)
            )',
            p_drill_destino, p_drill_destino
        );
    END IF;

    IF p_exclude_terminal THEN
        v_where := v_where || ' AND ps.is_won IS NOT TRUE AND ps.is_lost IS NOT TRUE';
    END IF;

    IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
        v_where := v_where || format(
            ' AND c.id IN (SELECT cta.card_id FROM card_tag_assignments cta WHERE cta.tag_id = ANY(%L::UUID[]))',
            p_tag_ids
        );
    END IF;

    -- 2. MODE / POPULATION FILTER
    IF NOT v_is_entries_mode THEN
        IF p_mode = 'stage_entry' AND p_global_stage_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(%L, %L, %L, %L))',
                p_global_stage_id, p_date_start, p_date_end, p_product
            );
        ELSIF p_mode = 'ganho_sdr' THEN
            v_where := v_where || format(
                ' AND c.ganho_sdr = true AND c.ganho_sdr_at >= %L AND c.ganho_sdr_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_mode = 'ganho_planner' THEN
            v_where := v_where || format(
                ' AND c.ganho_planner = true AND c.ganho_planner_at >= %L AND c.ganho_planner_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_mode = 'ganho_total' THEN
            v_where := v_where || format(
                ' AND c.ganho_pos = true AND c.ganho_pos_at >= %L AND c.ganho_pos_at < %L',
                p_date_start, p_date_end
            );
        END IF;
    END IF;

    -- 3. LÓGICA POR SOURCE
    IF v_source = 'stage_entries' THEN
        IF p_drill_stage_id IS NOT NULL AND v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT a.card_id
                    FROM activities a
                    JOIN cards c2 ON c2.id = a.card_id
                    WHERE a.tipo = ''stage_changed''
                      AND (a.metadata->>''new_stage_id'')::UUID = %L
                      AND a.created_at >= %L AND a.created_at < %L
                      AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                    UNION
                    SELECT c3.id
                    FROM cards c3
                    WHERE c3.created_at >= %L AND c3.created_at < %L
                      AND c3.deleted_at IS NULL AND c3.archived_at IS NULL
                      AND COALESCE(
                          (SELECT (a2.metadata->>''old_stage_id'')::UUID
                           FROM activities a2
                           WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                           ORDER BY a2.created_at ASC LIMIT 1),
                          c3.pipeline_stage_id
                      ) = %L
                )',
                p_drill_stage_id,
                p_date_start, p_date_end,
                p_date_start, p_date_end,
                p_drill_stage_id
            );
        ELSIF p_drill_stage_id IS NOT NULL AND NOT v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT a.card_id
                    FROM activities a
                    JOIN cards c2 ON c2.id = a.card_id
                    WHERE a.tipo = ''stage_changed''
                      AND (a.metadata->>''new_stage_id'')::UUID = %L
                      AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                    UNION
                    SELECT c3.id
                    FROM cards c3
                    WHERE c3.deleted_at IS NULL AND c3.archived_at IS NULL
                      AND COALESCE(
                          (SELECT (a2.metadata->>''old_stage_id'')::UUID
                           FROM activities a2
                           WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                           ORDER BY a2.created_at ASC LIMIT 1),
                          c3.pipeline_stage_id
                      ) = %L
                )',
                p_drill_stage_id,
                p_drill_stage_id
            );
        ELSIF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;

    ELSIF v_source = 'closed_deals' THEN
        v_where := v_where || ' AND c.status_comercial = ''ganho''';
        v_where := v_where || ' AND c.data_fechamento IS NOT NULL';

        v_period_start := COALESCE(p_drill_period_start, p_date_start);
        v_period_end   := COALESCE(p_drill_period_end, p_date_end + interval '1 day');

        v_where := v_where || format(
            ' AND c.data_fechamento >= %L AND c.data_fechamento < %L',
            v_period_start, v_period_end
        );

        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND (c.vendas_owner_id = %L OR c.dono_atual_id = %L)',
                p_drill_owner_id, p_drill_owner_id
            );
        END IF;

    ELSIF v_source = 'current_stage' THEN
        v_where := v_where || ' AND c.status_comercial NOT IN (''ganho'', ''perdido'')';
        v_where := v_where || ' AND ps.ativo = true';

        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.pipeline_stage_id = %L', p_drill_stage_id);
        END IF;

        IF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;

    ELSIF v_source = 'lost_deals' THEN
        v_where := v_where || ' AND c.status_comercial = ''perdido''';

        IF p_drill_loss_reason IS NOT NULL THEN
            v_where := v_where || format(' AND COALESCE(mp.nome, ''Sem motivo informado'') = %L', p_drill_loss_reason);
        END IF;

        IF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
        END IF;

    ELSIF v_source = 'macro_funnel' THEN
        IF p_drill_phase IS NOT NULL AND v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT sub.cid FROM (
                        SELECT a.card_id AS cid
                        FROM activities a
                        JOIN cards c2 ON c2.id = a.card_id
                        WHERE a.tipo = ''stage_changed''
                          AND (a.metadata->>''new_stage_id'')::UUID IN (
                              SELECT ps2.id FROM pipeline_stages ps2
                              JOIN pipeline_phases pp2 ON pp2.id = ps2.phase_id
                              WHERE pp2.slug = %L
                          )
                          AND a.created_at >= %L AND a.created_at < %L
                          AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                        UNION ALL
                        SELECT c3.id AS cid
                        FROM cards c3
                        WHERE c3.created_at >= %L AND c3.created_at < %L
                          AND c3.deleted_at IS NULL AND c3.archived_at IS NULL
                          AND COALESCE(
                              (SELECT (a2.metadata->>''old_stage_id'')::UUID
                               FROM activities a2 WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                               ORDER BY a2.created_at ASC LIMIT 1),
                              c3.pipeline_stage_id
                          ) IN (
                              SELECT ps3.id FROM pipeline_stages ps3
                              JOIN pipeline_phases pp3 ON pp3.id = ps3.phase_id
                              WHERE pp3.slug = %L
                          )
                    ) sub
                )',
                p_drill_phase,
                p_date_start, p_date_end,
                p_date_start, p_date_end,
                p_drill_phase
            );
        ELSIF p_drill_phase IS NOT NULL AND NOT v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT sub.cid FROM (
                        SELECT a.card_id AS cid
                        FROM activities a
                        JOIN cards c2 ON c2.id = a.card_id
                        WHERE a.tipo = ''stage_changed''
                          AND (a.metadata->>''new_stage_id'')::UUID IN (
                              SELECT ps2.id FROM pipeline_stages ps2
                              JOIN pipeline_phases pp2 ON pp2.id = ps2.phase_id
                              WHERE pp2.slug = %L
                          )
                          AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                        UNION ALL
                        SELECT c3.id AS cid
                        FROM cards c3
                        WHERE c3.deleted_at IS NULL AND c3.archived_at IS NULL
                          AND COALESCE(
                              (SELECT (a2.metadata->>''old_stage_id'')::UUID
                               FROM activities a2 WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                               ORDER BY a2.created_at ASC LIMIT 1),
                              c3.pipeline_stage_id
                          ) IN (
                              SELECT ps3.id FROM pipeline_stages ps3
                              JOIN pipeline_phases pp3 ON pp3.id = ps3.phase_id
                              WHERE pp3.slug = %L
                          )
                    ) sub
                )',
                p_drill_phase,
                p_drill_phase
            );
        ELSIF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
        END IF;

    ELSE
        -- DEFAULT
        IF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.pipeline_stage_id = %L', p_drill_stage_id);
        END IF;
        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;
        IF p_drill_loss_reason IS NOT NULL THEN
            v_where := v_where || format(' AND mp.nome = %L', p_drill_loss_reason);
        END IF;
        IF p_drill_status IS NOT NULL THEN
            v_where := v_where || format(' AND c.status_comercial = %L', p_drill_status);
        END IF;
        IF p_drill_phase IS NOT NULL AND p_drill_owner_id IS NULL THEN
            v_where := v_where || format(' AND pp.slug = %L', p_drill_phase);
        END IF;
        IF p_drill_period_start IS NOT NULL AND p_drill_period_end IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.data_fechamento >= %L AND c.data_fechamento < %L',
                p_drill_period_start, p_drill_period_end
            );
        END IF;
    END IF;

    -- Sort
    IF p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN
        IF v_source = 'current_stage' THEN
            p_sort_by := 'stage_entered_at';
            p_sort_dir := 'asc';
        ELSIF v_source = 'closed_deals' THEN
            p_sort_by := 'data_fechamento';
            p_sort_dir := 'desc';
        END IF;
    END IF;

    v_order := CASE p_sort_by
        WHEN 'titulo'           THEN 'c.titulo'
        WHEN 'valor_display'    THEN 'COALESCE(c.valor_final, c.valor_estimado)'
        WHEN 'etapa_nome'       THEN 'ps.nome'
        WHEN 'data_fechamento'  THEN 'c.data_fechamento'
        WHEN 'receita'          THEN 'c.receita'
        WHEN 'stage_entered_at' THEN 'COALESCE(c.stage_entered_at, c.updated_at, c.created_at)'
        ELSE 'c.created_at'
    END;

    IF p_sort_dir = 'asc' THEN
        v_order := v_order || ' ASC NULLS LAST';
    ELSE
        v_order := v_order || ' DESC NULLS LAST';
    END IF;

    -- Query principal
    v_query := format(
        'SELECT
            c.id,
            c.titulo,
            c.produto::TEXT AS produto,
            c.status_comercial,
            ps.nome AS etapa_nome,
            pp.slug AS fase,
            pr.nome AS dono_atual_nome,
            COALESCE(c.valor_final, c.valor_estimado, 0)::NUMERIC AS valor_display,
            COALESCE(c.receita, 0)::NUMERIC AS receita,
            c.created_at,
            c.data_fechamento,
            ct.nome AS pessoa_nome,
            ct.telefone AS pessoa_telefone,
            COUNT(*) OVER() AS total_count,
            COALESCE(c.stage_entered_at, c.updated_at) AS stage_entered_at
        FROM cards c
        LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
        LEFT JOIN pipeline_phases pp ON pp.id = ps.phase_id
        LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
        LEFT JOIN contatos ct ON ct.id = c.pessoa_principal_id
        LEFT JOIN motivos_perda mp ON mp.id = c.motivo_perda_id
        WHERE c.deleted_at IS NULL AND c.archived_at IS NULL AND COALESCE(c.card_type, ''standard'') != ''sub_card''
        %s
        ORDER BY %s
        LIMIT %s OFFSET %s',
        v_where, v_order, p_limit, p_offset
    );

    RETURN QUERY EXECUTE v_query;
END;
$$;

-- ── 6.10 analytics_operations_summary ────────────────────────
-- NOTE: sub-card filter ONLY in won_cards CTE (sub_cards and per_planner
-- intentionally query sub-cards for operations metrics)

CREATE OR REPLACE FUNCTION analytics_operations_summary(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
BEGIN
    WITH won_cards AS (
        SELECT c.*
        FROM cards c
        WHERE c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                      p_stage_id, v_start::TIMESTAMPTZ, (v_end + 1)::TIMESTAMPTZ, p_product
                  ))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= v_start::TIMESTAMPTZ AND c.ganho_sdr_at < (v_end + 1)::TIMESTAMPTZ
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= v_start::TIMESTAMPTZ AND c.ganho_planner_at < (v_end + 1)::TIMESTAMPTZ
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= v_start::TIMESTAMPTZ AND c.ganho_pos_at < (v_end + 1)::TIMESTAMPTZ
              ELSE
                  c.created_at >= v_start::TIMESTAMPTZ AND c.created_at < (v_end + 1)::TIMESTAMPTZ
          END
    ),
    kpis AS (
        SELECT
            COUNT(*) AS viagens_realizadas,
            COALESCE(SUM(valor_final), 0) AS valor_total,
            CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(valor_final), 0) / COUNT(*), 2) ELSE 0 END AS ticket_medio
        FROM won_cards
    ),
    sub_cards AS (
        SELECT sc.*
        FROM cards sc
        JOIN won_cards wc ON sc.parent_card_id = wc.id
        WHERE sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
    ),
    sub_stats AS (
        SELECT
            COUNT(*) AS total_sub_cards,
            COUNT(DISTINCT parent_card_id) AS cards_with_changes,
            CASE WHEN COUNT(DISTINCT parent_card_id) > 0
                 THEN ROUND(COUNT(*)::NUMERIC / COUNT(DISTINCT parent_card_id), 2) ELSE 0 END AS changes_per_trip
        FROM sub_cards
    ),
    per_planner AS (
        SELECT p.nome AS planner_nome,
            wc.vendas_owner_id AS planner_id,
            COUNT(DISTINCT wc.id) AS viagens,
            COUNT(sc.id) AS mudancas,
            CASE WHEN COUNT(DISTINCT wc.id) > 0
                 THEN ROUND(COUNT(sc.id)::NUMERIC / COUNT(DISTINCT wc.id), 2) ELSE 0 END AS mudancas_por_viagem,
            COALESCE(SUM(wc.valor_final), 0) AS receita
        FROM won_cards wc
        LEFT JOIN cards sc ON sc.parent_card_id = wc.id AND sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
        LEFT JOIN profiles p ON p.id = wc.vendas_owner_id
        WHERE wc.vendas_owner_id IS NOT NULL
        GROUP BY p.nome, wc.vendas_owner_id ORDER BY viagens DESC
    ),
    timeline AS (
        SELECT TO_CHAR(DATE_TRUNC('week', sc.created_at::TIMESTAMPTZ), 'YYYY-MM-DD') AS week, COUNT(*) AS count
        FROM sub_cards sc GROUP BY 1 ORDER BY 1
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k) FROM kpis k),
        'sub_card_stats', (SELECT row_to_json(s) FROM sub_stats s),
        'per_planner', (SELECT COALESCE(jsonb_agg(row_to_json(pp)), '[]'::jsonb) FROM per_planner pp),
        'timeline', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM timeline t)
    ) INTO result;
    RETURN result;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- GRANTS
-- ══════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION analytics_funnel_live TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_overview_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_summary TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_funnel_by_owner TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_team_performance TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_financial_breakdown TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_violations TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_drill_down_cards TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_operations_summary TO authenticated;
GRANT EXECUTE ON FUNCTION merge_sub_card TO authenticated;
GRANT EXECUTE ON FUNCTION criar_sub_card TO authenticated;
GRANT EXECUTE ON FUNCTION get_sub_cards TO authenticated;
