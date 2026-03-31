-- =============================================================================
-- OUTBOUND ACTION TYPE: create_only / update_only / all
--
-- Adiciona campo action_type às regras de outbound para controlar se a regra
-- deve criar deals no AC, apenas atualizar, ou ambos.
-- Espelha o padrão já existente nas regras de inbound.
-- =============================================================================

-- 1. Adicionar coluna action_type à tabela de regras outbound
ALTER TABLE public.integration_outbound_triggers
ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT 'update_only'
  CHECK (action_type IN ('create_only', 'update_only', 'all'));

COMMENT ON COLUMN public.integration_outbound_triggers.action_type IS
  'create_only = apenas criação de deal no AC, update_only = apenas atualização (padrão), all = ambos';

-- 2. Relaxar NOT NULL de external_id na fila outbound (card_created não tem external_id)
ALTER TABLE public.integration_outbound_queue
ALTER COLUMN external_id DROP NOT NULL;

-- 3. Atualizar check_outbound_trigger() para retornar action_type
-- DROP necessário porque o tipo de retorno mudou (adicionou action_type)
DROP FUNCTION IF EXISTS check_outbound_trigger(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION check_outbound_trigger(
    p_integration_id UUID,
    p_pipeline_id UUID,
    p_stage_id UUID,
    p_owner_id UUID,
    p_status TEXT,
    p_event_type TEXT,
    p_field_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    allowed BOOLEAN,
    rule_id UUID,
    rule_name TEXT,
    action_mode TEXT,
    sync_field_mode TEXT,
    sync_fields TEXT[],
    action_type TEXT,
    reason TEXT
) AS $$
DECLARE
    v_trigger RECORD;
    v_has_rules BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.integration_outbound_triggers
        WHERE integration_id = p_integration_id AND is_active = true
    ) INTO v_has_rules;

    -- Sem regras → permitir tudo (legado)
    IF NOT v_has_rules THEN
        RETURN QUERY SELECT
            true::BOOLEAN,
            NULL::UUID,
            NULL::TEXT,
            'allow'::TEXT,
            'all'::TEXT,
            NULL::TEXT[],
            'update_only'::TEXT,
            'No outbound rules configured - allowing all'::TEXT;
        RETURN;
    END IF;

    -- Buscar primeira regra que faz match (por prioridade)
    FOR v_trigger IN
        SELECT t.* FROM public.integration_outbound_triggers t
        WHERE t.integration_id = p_integration_id
          AND t.is_active = true
        ORDER BY t.priority ASC, t.created_at ASC
    LOOP
        -- Match de pipeline
        IF v_trigger.source_pipeline_ids IS NOT NULL AND
           NOT (p_pipeline_id = ANY(v_trigger.source_pipeline_ids)) THEN
            CONTINUE;
        END IF;

        -- Match de estágio
        IF v_trigger.source_stage_ids IS NOT NULL AND
           NOT (p_stage_id = ANY(v_trigger.source_stage_ids)) THEN
            CONTINUE;
        END IF;

        -- Match de owner
        IF v_trigger.source_owner_ids IS NOT NULL AND
           NOT (p_owner_id = ANY(v_trigger.source_owner_ids)) THEN
            CONTINUE;
        END IF;

        -- Match de status
        IF v_trigger.source_status IS NOT NULL AND
           NOT (p_status = ANY(v_trigger.source_status)) THEN
            CONTINUE;
        END IF;

        -- Match de tipo de evento
        IF v_trigger.event_types IS NOT NULL AND
           NOT (p_event_type = ANY(v_trigger.event_types)) THEN
            CONTINUE;
        END IF;

        -- Filtro de campos (para field_update)
        IF p_event_type = 'field_update' AND p_field_name IS NOT NULL THEN
            IF v_trigger.sync_field_mode = 'selected' AND v_trigger.sync_fields IS NOT NULL THEN
                IF NOT (p_field_name = ANY(v_trigger.sync_fields)) THEN
                    RETURN QUERY SELECT
                        false::BOOLEAN,
                        v_trigger.id,
                        v_trigger.name,
                        v_trigger.action_mode,
                        v_trigger.sync_field_mode,
                        v_trigger.sync_fields,
                        COALESCE(v_trigger.action_type, 'update_only')::TEXT,
                        format('Field "%s" not in allowed list for rule "%s"', p_field_name, v_trigger.name)::TEXT;
                    RETURN;
                END IF;
            ELSIF v_trigger.sync_field_mode = 'exclude' AND v_trigger.sync_fields IS NOT NULL THEN
                IF p_field_name = ANY(v_trigger.sync_fields) THEN
                    RETURN QUERY SELECT
                        false::BOOLEAN,
                        v_trigger.id,
                        v_trigger.name,
                        v_trigger.action_mode,
                        v_trigger.sync_field_mode,
                        v_trigger.sync_fields,
                        COALESCE(v_trigger.action_type, 'update_only')::TEXT,
                        format('Field "%s" is excluded by rule "%s"', p_field_name, v_trigger.name)::TEXT;
                    RETURN;
                END IF;
            END IF;
        END IF;

        -- Retornar resultado
        IF v_trigger.action_mode = 'block' THEN
            RETURN QUERY SELECT
                false::BOOLEAN,
                v_trigger.id,
                v_trigger.name,
                v_trigger.action_mode,
                v_trigger.sync_field_mode,
                v_trigger.sync_fields,
                COALESCE(v_trigger.action_type, 'update_only')::TEXT,
                format('Blocked by rule "%s"', v_trigger.name)::TEXT;
            RETURN;
        ELSE
            RETURN QUERY SELECT
                true::BOOLEAN,
                v_trigger.id,
                v_trigger.name,
                v_trigger.action_mode,
                v_trigger.sync_field_mode,
                v_trigger.sync_fields,
                COALESCE(v_trigger.action_type, 'update_only')::TEXT,
                format('Allowed by rule "%s"', v_trigger.name)::TEXT;
            RETURN;
        END IF;
    END LOOP;

    -- Nenhuma regra fez match → bloquear
    RETURN QUERY SELECT
        false::BOOLEAN,
        NULL::UUID,
        NULL::TEXT,
        'block'::TEXT,
        NULL::TEXT,
        NULL::TEXT[],
        'update_only'::TEXT,
        'No matching outbound rule found - blocking by default'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atualizar log_outbound_card_event() para suportar INSERT + action_type
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
    v_is_insert BOOLEAN;
BEGIN
    -- Guard 1: Evitar loop infinito
    IF current_setting('app.update_source', TRUE) = 'integration' THEN
        RETURN NEW;
    END IF;

    v_is_insert := (TG_OP = 'INSERT');

    -- ══════════════════════════════════════════
    -- CAMINHO INSERT: card_created
    -- ══════════════════════════════════════════
    IF v_is_insert THEN
        -- Card criado pela integração já tem external_id, ignorar
        IF NEW.external_id IS NOT NULL THEN
            RETURN NEW;
        END IF;

        -- Precisa ter pipeline/stage para fazer match com regras
        IF NEW.pipeline_id IS NULL OR NEW.pipeline_stage_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Buscar qualquer integração ativa
        FOR v_integration_id IN
            SELECT id FROM public.integrations WHERE is_active = true
        LOOP
            -- Verificar configurações globais
            SELECT COALESCE(value, 'false')::boolean INTO v_outbound_enabled
            FROM public.integration_settings WHERE key = 'OUTBOUND_SYNC_ENABLED';

            IF NOT v_outbound_enabled THEN
                CONTINUE;
            END IF;

            SELECT COALESCE(value, 'true')::boolean INTO v_shadow_mode
            FROM public.integration_settings WHERE key = 'OUTBOUND_SHADOW_MODE';

            v_card_status := COALESCE(NEW.status_comercial, 'ativo');

            -- Verificar regras de outbound para card_created
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, 'card_created', NULL
            );

            -- Regra precisa permitir E ter action_type create_only ou all
            IF COALESCE(v_rule_result.allowed, false)
               AND COALESCE(v_rule_result.action_type, 'update_only') IN ('create_only', 'all') THEN

                -- Buscar stage mapping para saber o destino no AC
                SELECT * INTO v_stage_mapping
                FROM public.integration_outbound_stage_map
                WHERE integration_id = v_integration_id
                  AND internal_stage_id = NEW.pipeline_stage_id
                  AND is_active = true
                LIMIT 1;

                v_payload := jsonb_build_object(
                    'titulo', NEW.titulo,
                    'valor_estimado', NEW.valor_estimado,
                    'pipeline_id', NEW.pipeline_id,
                    'pipeline_stage_id', NEW.pipeline_stage_id,
                    'dono_atual_id', NEW.dono_atual_id,
                    'target_external_stage_id', COALESCE(v_stage_mapping.external_stage_id, ''),
                    'target_external_stage_name', COALESCE(v_stage_mapping.external_stage_name, ''),
                    'shadow_mode', v_shadow_mode,
                    'matched_rule', v_rule_result.rule_name
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
    -- CAMINHO UPDATE (lógica existente)
    -- ══════════════════════════════════════════

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
                -- bloqueado, mas continua para outros eventos
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
            END IF;
        END IF;
    END IF;

    -- ══════════════════════════════════════════
    -- 4. FIELD UPDATES
    -- ══════════════════════════════════════════
    IF v_allowed_events LIKE '%field_update%' THEN

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

        -- Enfileirar se houve mudanças
        IF v_changed_fields != '{}'::jsonb THEN
            SELECT * INTO v_rule_result
            FROM check_outbound_trigger(
                v_integration_id, NEW.pipeline_id, NEW.pipeline_stage_id,
                NEW.dono_atual_id, v_card_status, 'field_update', NULL
            );

            IF COALESCE(v_rule_result.allowed, true)
               AND COALESCE(v_rule_result.action_type, 'update_only') IN ('update_only', 'all') THEN
                v_payload := v_changed_fields || jsonb_build_object(
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
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION log_outbound_card_event IS
'Trigger que monitora INSERT e UPDATE em cards e enfileira eventos outbound.
INSERT: card_created (cards novos sem external_id, para criação no AC).
UPDATE: stage_change, won, lost, field_update (cards com external_id).
Verifica action_type da regra: create_only, update_only ou all.';

-- 5. Recriar trigger para INSERT OR UPDATE
DROP TRIGGER IF EXISTS tr_log_outbound_card_event ON public.cards;
CREATE TRIGGER tr_log_outbound_card_event
    AFTER INSERT OR UPDATE ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION log_outbound_card_event();
