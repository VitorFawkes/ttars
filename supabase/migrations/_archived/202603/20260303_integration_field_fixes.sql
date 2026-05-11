-- =============================================================================
-- INTEGRATION FIELD FIXES — 5 correções
--
-- Fix 2: Ativar campos outbound que estavam com is_active=false
-- Fix 3: Trigger com detecção de observacoes para Notes API
-- Fix 4: Campo cidade_origem (system_field + stage_field_config + mappings)
-- Fix 5: Espelhar campos outbound ativos no inbound
-- =============================================================================

-- ═══════════════════════════════════════════════════
-- FIX 2: Ativar campos outbound inativos (só trip info)
-- Campos mkt_*/utm_*/ad_image_url mantidos inativos (atribuição AC, não faz sentido outbound)
-- ═══════════════════════════════════════════════════
UPDATE integration_outbound_field_map
SET is_active = true, updated_at = now()
WHERE internal_field IN ('epoca_viagem', 'pessoas')
AND is_active = false;


-- ═══════════════════════════════════════════════════
-- FIX 3: Recriar trigger com detecção de _observacoes_note
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION log_outbound_card_event()
RETURNS TRIGGER AS $$
DECLARE
    v_integration_id  UUID;
    v_external_id     TEXT;
    v_event_type      TEXT;
    v_payload         JSONB := '{}';
    v_stage_mapping   RECORD;
    v_outbound_enabled BOOLEAN := FALSE;
    v_shadow_mode     BOOLEAN := TRUE;
    v_allowed_events  TEXT;
    v_rule_result     RECORD;
    v_card_status     TEXT;
    v_changed_fields  JSONB := '{}';
    v_filtered_fields JSONB := '{}';
    v_jsonb_key       TEXT;
    v_is_insert       BOOLEAN;
BEGIN
    -- Guard 1: Evitar loop (integration-process seta esta variável)
    IF current_setting('app.update_source', TRUE) = 'integration' THEN
        RETURN NEW;
    END IF;

    v_is_insert := (TG_OP = 'INSERT');

    -- ══════════════════════════════════════════
    -- CAMINHO INSERT: card_created
    -- ══════════════════════════════════════════
    IF v_is_insert THEN
        IF NEW.external_id IS NOT NULL THEN
            RETURN NEW;
        END IF;
        IF NEW.pipeline_id IS NULL OR NEW.pipeline_stage_id IS NULL THEN
            RETURN NEW;
        END IF;

        FOR v_integration_id IN
            SELECT id FROM public.integrations WHERE is_active = true
        LOOP
            SELECT COALESCE(value, 'false')::boolean INTO v_outbound_enabled
            FROM public.integration_settings WHERE key = 'OUTBOUND_SYNC_ENABLED';
            IF NOT v_outbound_enabled THEN CONTINUE; END IF;

            SELECT COALESCE(value, 'true')::boolean INTO v_shadow_mode
            FROM public.integration_settings WHERE key = 'OUTBOUND_SHADOW_MODE';

            v_card_status := COALESCE(NEW.status_comercial, 'ativo');

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, 'card_created', NULL
            );

            IF COALESCE(v_rule_result.allowed, false)
               AND COALESCE(v_rule_result.action_type, 'update_only') IN ('create_only', 'all') THEN

                SELECT * INTO v_stage_mapping
                FROM public.integration_outbound_stage_map
                WHERE integration_id = v_integration_id
                  AND internal_stage_id = NEW.pipeline_stage_id
                  AND is_active = true
                LIMIT 1;

                v_payload := jsonb_build_object(
                    'titulo',                  NEW.titulo,
                    'valor_estimado',          NEW.valor_estimado,
                    'pipeline_id',             NEW.pipeline_id,
                    'pipeline_stage_id',       NEW.pipeline_stage_id,
                    'dono_atual_id',           NEW.dono_atual_id,
                    'target_external_stage_id',   COALESCE(v_stage_mapping.external_stage_id, ''),
                    'target_external_stage_name', COALESCE(v_stage_mapping.external_stage_name, ''),
                    'shadow_mode',             v_shadow_mode,
                    'matched_rule',            v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id
                ) VALUES (
                    NEW.id, v_integration_id, NULL,
                    'card_created', v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system',
                    v_rule_result.rule_id
                );
            END IF;
        END LOOP;

        RETURN NEW;
    END IF;

    -- ══════════════════════════════════════════
    -- CAMINHO UPDATE
    -- ══════════════════════════════════════════

    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE provider = NEW.external_source OR name = NEW.external_source
    LIMIT 1;

    IF v_integration_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_external_id := NEW.external_id;

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

    -- ══════════════════════════════════════════
    -- 1. STAGE CHANGE
    -- ══════════════════════════════════════════
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        IF v_allowed_events LIKE '%stage_change%' THEN
            v_event_type := 'stage_change';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, v_event_type, NULL
            );

            IF NOT COALESCE(v_rule_result.allowed, true) THEN
                NULL;
            ELSIF COALESCE(v_rule_result.action_type, 'update_only') IN ('update_only', 'all') THEN
                SELECT * INTO v_stage_mapping
                FROM public.integration_outbound_stage_map
                WHERE integration_id = v_integration_id
                  AND internal_stage_id = NEW.pipeline_stage_id
                  AND is_active = true
                LIMIT 1;

                IF v_stage_mapping IS NOT NULL THEN
                    v_payload := jsonb_build_object(
                        'old_stage_id',              OLD.pipeline_stage_id,
                        'new_stage_id',              NEW.pipeline_stage_id,
                        'target_external_stage_id',   v_stage_mapping.external_stage_id,
                        'target_external_stage_name', v_stage_mapping.external_stage_name,
                        'shadow_mode',               v_shadow_mode,
                        'matched_rule',              v_rule_result.rule_name
                    );

                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload,
                        status, triggered_by, matched_trigger_id
                    ) VALUES (
                        NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                        CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                        'system',
                        v_rule_result.rule_id
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    -- ══════════════════════════════════════════
    -- 2. WON
    -- ══════════════════════════════════════════
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial AND NEW.status_comercial = 'ganho' THEN
        IF v_allowed_events LIKE '%won%' THEN
            v_event_type := 'won';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, v_event_type, NULL
            );

            IF NOT COALESCE(v_rule_result.allowed, true) THEN
                NULL;
            ELSIF COALESCE(v_rule_result.action_type, 'update_only') IN ('update_only', 'all') THEN
                v_payload := jsonb_build_object(
                    'status',       'won',
                    'valor_final',  NEW.valor_final,
                    'shadow_mode',  v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system',
                    v_rule_result.rule_id
                );
            END IF;
        END IF;
    END IF;

    -- ══════════════════════════════════════════
    -- 3. LOST
    -- ══════════════════════════════════════════
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial AND NEW.status_comercial = 'perdido' THEN
        IF v_allowed_events LIKE '%lost%' THEN
            v_event_type := 'lost';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, v_event_type, NULL
            );

            IF NOT COALESCE(v_rule_result.allowed, true) THEN
                NULL;
            ELSIF COALESCE(v_rule_result.action_type, 'update_only') IN ('update_only', 'all') THEN
                v_payload := jsonb_build_object(
                    'status',       'lost',
                    'motivo_perda', NEW.motivo_perda_id,
                    'shadow_mode',  v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system',
                    v_rule_result.rule_id
                );
            END IF;
        END IF;
    END IF;

    -- ══════════════════════════════════════════
    -- 4. FIELD UPDATES
    -- ══════════════════════════════════════════
    IF v_allowed_events LIKE '%field_update%' THEN

        -- Colunas diretas
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

        -- ══════════════════════════════════════════
        -- NOVO: Observações → _observacoes_note (para AC Notes API)
        -- Quando qualquer sub-objeto de observações muda, compila TUDO para a nota
        -- ══════════════════════════════════════════
        IF (COALESCE(OLD.produto_data->'observacoes_criticas', '{}'::jsonb)::text
              IS DISTINCT FROM
            COALESCE(NEW.produto_data->'observacoes_criticas', '{}'::jsonb)::text)
           OR
           (COALESCE(OLD.briefing_inicial->'observacoes', '{}'::jsonb)::text
              IS DISTINCT FROM
            COALESCE(NEW.briefing_inicial->'observacoes', '{}'::jsonb)::text)
           OR
           (COALESCE(OLD.produto_data->'observacoes_pos_venda', '{}'::jsonb)::text
              IS DISTINCT FROM
            COALESCE(NEW.produto_data->'observacoes_pos_venda', '{}'::jsonb)::text)
        THEN
            v_changed_fields := v_changed_fields || jsonb_build_object(
                '_observacoes_note', jsonb_build_object(
                    'sdr', COALESCE(NEW.briefing_inicial->'observacoes', '{}'::jsonb),
                    'planner', COALESCE(NEW.produto_data->'observacoes_criticas', '{}'::jsonb),
                    'pos_venda', COALESCE(NEW.produto_data->'observacoes_pos_venda', '{}'::jsonb)
                )
            );
        END IF;

        -- Enfileirar se houve mudanças
        IF v_changed_fields != '{}'::jsonb THEN
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, 'field_update', NULL
            );

            IF COALESCE(v_rule_result.allowed, true)
               AND COALESCE(v_rule_result.action_type, 'update_only') IN ('update_only', 'all') THEN

                -- Filtrar campos pelo sync_field_mode retornado pela regra
                IF v_rule_result.sync_field_mode = 'selected' AND v_rule_result.sync_fields IS NOT NULL THEN
                    v_filtered_fields := '{}';
                    FOR v_jsonb_key IN SELECT jsonb_object_keys(v_changed_fields) LOOP
                        -- Sempre permitir _observacoes_note (metadado interno)
                        IF v_jsonb_key = '_observacoes_note' OR v_jsonb_key = ANY(v_rule_result.sync_fields) THEN
                            v_filtered_fields := v_filtered_fields
                                || jsonb_build_object(v_jsonb_key, v_changed_fields->v_jsonb_key);
                        END IF;
                    END LOOP;
                    v_changed_fields := v_filtered_fields;

                ELSIF v_rule_result.sync_field_mode = 'exclude' AND v_rule_result.sync_fields IS NOT NULL THEN
                    FOR v_jsonb_key IN SELECT unnest(v_rule_result.sync_fields) LOOP
                        v_changed_fields := v_changed_fields - v_jsonb_key;
                    END LOOP;
                END IF;

                IF v_changed_fields != '{}'::jsonb THEN
                    v_payload := v_changed_fields || jsonb_build_object(
                        'shadow_mode',  v_shadow_mode,
                        'matched_rule', v_rule_result.rule_name
                    );

                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload,
                        status, triggered_by, matched_trigger_id
                    ) VALUES (
                        NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                        CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                        'system',
                        v_rule_result.rule_id
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION log_outbound_card_event IS
'Trigger que monitora INSERT/UPDATE em cards e enfileira eventos outbound.
INSERT → card_created (cards novos sem external_id).
UPDATE → stage_change, won, lost, field_update (cards com external_id).
Inclui _observacoes_note para sync de observações via AC Notes API.
Fix 2026-03-03: adiciona detecção de observações para Notes + permite _observacoes_note em sync_field_mode=selected.';


-- ═══════════════════════════════════════════════════
-- FIX 4: Campo "Cidade Origem"
-- ═══════════════════════════════════════════════════

-- 4a. system_fields
INSERT INTO system_fields (key, label, type, section, section_id, is_system, active, order_index)
VALUES (
    'cidade_origem', 'Cidade Origem', 'text', 'trip_info',
    (SELECT id FROM sections WHERE key = 'trip_info' LIMIT 1),
    true, true, 15
)
ON CONFLICT (key) DO NOTHING;

-- 4b. stage_field_config — visível em todos os stages do pipeline TRIPS
INSERT INTO stage_field_config (stage_id, field_key, is_visible, is_required, "order")
SELECT ps.id, 'cidade_origem', true, false, 15
FROM pipeline_stages ps
WHERE ps.pipeline_id = 'c8022522-bfba-4527-b940-7e9e5da1e1a8'
ON CONFLICT (stage_id, field_key) DO NOTHING;

-- 4c. Outbound mapping: CRM cidade_origem → AC field 143
INSERT INTO integration_outbound_field_map
    (integration_id, internal_field, internal_field_label, external_field_id,
     external_field_name, sync_always, is_active, section)
VALUES
    ('a2141b92-561f-4514-92b4-9412a068d236', 'cidade_origem',
     'Cidade Origem', '143', 'Qual a cidade do lead (para saber o aeroporto)',
     true, true, 'trip_info')
ON CONFLICT (integration_id, internal_field) DO NOTHING;

-- 4d. Inbound mapping: AC field 143 → CRM cidade_origem (produto_data)
-- Nota: AC 143 já tem inbound para briefing_inicial.cidade_lead (mantido)
INSERT INTO integration_field_map
    (source, entity_type, external_field_id, local_field_key, direction,
     integration_id, section, sync_always, is_active, storage_location)
VALUES
    ('active_campaign', 'deal', '143', 'cidade_origem', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info',
     true, true, 'produto_data')
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════
-- FIX 5: Espelhar campos outbound ativos no inbound
-- ═══════════════════════════════════════════════════
INSERT INTO integration_field_map
    (source, entity_type, external_field_id, local_field_key, direction,
     integration_id, section, sync_always, is_active, storage_location)
VALUES
    -- taxa_planejamento → AC 302
    ('active_campaign', 'deal', '302', 'taxa_planejamento', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info',
     true, true, 'produto_data'),
    -- servico_contratado → AC 147
    ('active_campaign', 'deal', '147', 'servico_contratado', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info',
     true, true, 'produto_data'),
    -- quantidade_viajantes → AC 151
    ('active_campaign', 'deal', '151', 'quantidade_viajantes', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info',
     true, true, 'produto_data'),
    -- duracao_viagem → AC 150
    ('active_campaign', 'deal', '150', 'duracao_viagem', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info',
     true, true, 'produto_data'),
    -- data_viagem_inicio → AC 149
    ('active_campaign', 'deal', '149', 'data_viagem_inicio', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info',
     true, true, 'column'),
    -- proxima_tarefa → AC 280
    ('active_campaign', 'deal', '280', 'proxima_tarefa', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'system',
     false, true, 'produto_data'),
    -- ultima_interacao → AC 284
    ('active_campaign', 'deal', '284', 'ultima_interacao', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'system',
     false, true, 'produto_data')
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════
-- Verificação final
-- ═══════════════════════════════════════════════════
DO $$
DECLARE
    v_active_count INTEGER;
    v_cidade_exists BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_active_count
    FROM integration_outbound_field_map WHERE is_active = true;

    SELECT EXISTS(SELECT 1 FROM system_fields WHERE key = 'cidade_origem' AND active = true)
    INTO v_cidade_exists;

    RAISE NOTICE 'Integration field fixes applied: % active outbound mappings, cidade_origem=%',
        v_active_count, v_cidade_exists;
END $$;
