-- HIGH-1: Trigger dinâmico que monitora TODOS os campos mapeados no outbound
-- Substitui a versão anterior que só monitorava valor_estimado, valor_final,
-- data_viagem_inicio, data_viagem_fim.
--
-- Estratégia:
--   1. Colunas diretas: compara OLD vs NEW individualmente
--   2. JSONB (marketing_data, produto_data, briefing_inicial): detecta diff de keys
--   3. Agrupa TODAS as mudanças em um único evento field_update (eficiente)
--   4. Campos fora de cards (telefone, proxima_tarefa) ficam de fora — precisam de triggers próprios
--
-- O dispatch (integration-dispatch) é quem traduz os nomes CRM → AC field IDs
-- usando integration_outbound_field_map. O trigger apenas detecta e enfileira.

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

    -- ══════════════════════════════════════════
    -- 4. FIELD UPDATES (expanded: all mapped columns)
    -- Agrupa todas as mudanças em um único evento
    -- ══════════════════════════════════════════
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

        -- JSONB: marketing_data (destinos, motivo, o_que_e_importante, pax, etc.)
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

-- Nota: O trigger trg_card_outbound_sync já existe e aponta para esta função.
-- Não é necessário recriar o trigger, apenas a função.
-- Verificação:
--   SELECT tgname, tgtype FROM pg_trigger WHERE tgrelid = 'cards'::regclass AND tgname = 'trg_card_outbound_sync';
