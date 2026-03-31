-- =====================================================
-- FIX: Trigger log_outbound_card_event referencia coluna inexistente
-- A coluna cards.responsavel_id NÃO EXISTE - o correto é cards.dono_atual_id
-- Este bug impede qualquer UPDATE em cards com external_id
-- =====================================================

CREATE OR REPLACE FUNCTION log_outbound_card_event()
RETURNS TRIGGER AS $$
DECLARE
    v_integration_id UUID;
    v_external_id TEXT;
    v_event_type TEXT;
    v_payload JSONB := '{}';
    v_stage_mapping RECORD;
    v_field_changed BOOLEAN := FALSE;
    v_field_name TEXT;
    v_outbound_enabled BOOLEAN := FALSE;
    v_shadow_mode BOOLEAN := TRUE;
    v_allowed_events TEXT;
    v_rule_result RECORD;
    v_card_status TEXT;
BEGIN
    -- Verificar se é uma atualização originada da integração (evita loop infinito)
    IF current_setting('app.update_source', TRUE) = 'integration' THEN
        RETURN NEW;
    END IF;

    -- Só processar cards que têm external_id (foram sincronizados de fora)
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar integração pelo external_source do card
    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE provider = NEW.external_source OR name = NEW.external_source
    LIMIT 1;

    IF v_integration_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_external_id := NEW.external_id;

    -- Buscar configurações globais de outbound
    SELECT COALESCE(value, 'false')::boolean INTO v_outbound_enabled
    FROM public.integration_settings WHERE key = 'OUTBOUND_SYNC_ENABLED';

    SELECT COALESCE(value, 'true')::boolean INTO v_shadow_mode
    FROM public.integration_settings WHERE key = 'OUTBOUND_SHADOW_MODE';

    SELECT COALESCE(value, 'stage_change,won,lost,field_update') INTO v_allowed_events
    FROM public.integration_settings WHERE key = 'OUTBOUND_ALLOWED_EVENTS';

    -- Se outbound desabilitado, não fazer nada
    IF NOT v_outbound_enabled THEN
        RETURN NEW;
    END IF;

    -- Determinar status do card para verificação de regras
    v_card_status := COALESCE(NEW.status_comercial, 'ativo');

    -- 1. Detectar mudança de estágio
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        -- Buscar mapeamento de estágio
        SELECT * INTO v_stage_mapping
        FROM public.integration_outbound_stage_map
        WHERE integration_id = v_integration_id
          AND internal_stage_id = NEW.pipeline_stage_id
          AND is_active = true
        LIMIT 1;

        IF v_stage_mapping IS NOT NULL AND v_allowed_events LIKE '%stage_change%' THEN
            v_event_type := 'stage_change';

            -- Verificar regras de outbound
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.dono_atual_id,
                v_card_status,
                v_event_type,
                NULL
            );

            IF v_rule_result.allowed THEN
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
                    status, triggered_by, matched_trigger_id
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END,
                    'system',
                    v_rule_result.rule_id
                );
            ELSE
                -- Evento bloqueado - registrar para histórico
                v_payload := jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'blocked_reason', v_rule_result.reason,
                    'shadow_mode', v_shadow_mode
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id, processing_log
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    'blocked',
                    'system',
                    v_rule_result.rule_id,
                    v_rule_result.reason
                );
            END IF;
        END IF;
    END IF;

    -- 2. Detectar status_comercial = ganho
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial AND NEW.status_comercial = 'ganho' THEN
        IF v_allowed_events LIKE '%won%' THEN
            v_event_type := 'won';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.dono_atual_id,
                v_card_status,
                v_event_type,
                NULL
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    'status', 'won',
                    'valor_final', NEW.valor_final,
                    'shadow_mode', v_shadow_mode,
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
            ELSE
                v_payload := jsonb_build_object(
                    'status', 'won',
                    'valor_final', NEW.valor_final,
                    'blocked_reason', v_rule_result.reason,
                    'shadow_mode', v_shadow_mode
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id, processing_log
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    'blocked',
                    'system',
                    v_rule_result.rule_id,
                    v_rule_result.reason
                );
            END IF;
        END IF;
    END IF;

    -- 3. Detectar status_comercial = perdido
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial AND NEW.status_comercial = 'perdido' THEN
        IF v_allowed_events LIKE '%lost%' THEN
            v_event_type := 'lost';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.dono_atual_id,
                v_card_status,
                v_event_type,
                NULL
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    'status', 'lost',
                    'motivo_perda', NEW.motivo_perda_id,
                    'shadow_mode', v_shadow_mode,
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
            ELSE
                v_payload := jsonb_build_object(
                    'status', 'lost',
                    'motivo_perda', NEW.motivo_perda_id,
                    'blocked_reason', v_rule_result.reason,
                    'shadow_mode', v_shadow_mode
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id, processing_log
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, v_event_type, v_payload,
                    'blocked',
                    'system',
                    v_rule_result.rule_id,
                    v_rule_result.reason
                );
            END IF;
        END IF;
    END IF;

    -- 4. Detectar mudanças em campos mapeados
    IF v_allowed_events LIKE '%field_update%' THEN
        -- valor_estimado
        IF OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado THEN
            v_field_name := 'valor_estimado';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.dono_atual_id,
                v_card_status,
                'field_update',
                v_field_name
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    v_field_name, NEW.valor_estimado,
                    'shadow_mode', v_shadow_mode,
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
            ELSE
                v_payload := jsonb_build_object(
                    v_field_name, NEW.valor_estimado,
                    'blocked_reason', v_rule_result.reason,
                    'shadow_mode', v_shadow_mode
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id, processing_log
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    'blocked',
                    'system',
                    v_rule_result.rule_id,
                    v_rule_result.reason
                );
            END IF;
        END IF;

        -- valor_final
        IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
            v_field_name := 'valor_final';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.dono_atual_id,
                v_card_status,
                'field_update',
                v_field_name
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    v_field_name, NEW.valor_final,
                    'shadow_mode', v_shadow_mode,
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
            ELSE
                v_payload := jsonb_build_object(
                    v_field_name, NEW.valor_final,
                    'blocked_reason', v_rule_result.reason,
                    'shadow_mode', v_shadow_mode
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id, processing_log
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    'blocked',
                    'system',
                    v_rule_result.rule_id,
                    v_rule_result.reason
                );
            END IF;
        END IF;

        -- data_viagem_inicio
        IF OLD.data_viagem_inicio IS DISTINCT FROM NEW.data_viagem_inicio THEN
            v_field_name := 'data_viagem_inicio';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.dono_atual_id,
                v_card_status,
                'field_update',
                v_field_name
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    v_field_name, NEW.data_viagem_inicio,
                    'shadow_mode', v_shadow_mode,
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
            ELSE
                v_payload := jsonb_build_object(
                    v_field_name, NEW.data_viagem_inicio,
                    'blocked_reason', v_rule_result.reason,
                    'shadow_mode', v_shadow_mode
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id, processing_log
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    'blocked',
                    'system',
                    v_rule_result.rule_id,
                    v_rule_result.reason
                );
            END IF;
        END IF;

        -- data_viagem_fim
        IF OLD.data_viagem_fim IS DISTINCT FROM NEW.data_viagem_fim THEN
            v_field_name := 'data_viagem_fim';

            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id,
                NEW.pipeline_id,
                NEW.pipeline_stage_id,
                NEW.dono_atual_id,
                v_card_status,
                'field_update',
                v_field_name
            );

            IF v_rule_result.allowed THEN
                v_payload := jsonb_build_object(
                    v_field_name, NEW.data_viagem_fim,
                    'shadow_mode', v_shadow_mode,
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
            ELSE
                v_payload := jsonb_build_object(
                    v_field_name, NEW.data_viagem_fim,
                    'blocked_reason', v_rule_result.reason,
                    'shadow_mode', v_shadow_mode
                );

                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload,
                    status, triggered_by, matched_trigger_id, processing_log
                ) VALUES (
                    NEW.id, v_integration_id, v_external_id, 'field_update', v_payload,
                    'blocked',
                    'system',
                    v_rule_result.rule_id,
                    v_rule_result.reason
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
