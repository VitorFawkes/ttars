-- =============================================================================
-- FIX OUTBOUND SYNC — 3 correções
--
-- BUG 1: Trigger duplicado reintroduzido por 20260225_outbound_action_type.sql
--   A migration criou tr_log_outbound_card_event sem dropar o trigger original
--   trg_card_outbound_sync. Resultado: cada evento era enfileirado 2x.
--   Evidência: 8 grupos de stage_change/lost duplicados a partir de 26/02.
--
-- BUG 2: sync_field_mode completamente ignorado para field_update
--   O trigger chamava check_outbound_trigger(..., NULL) — passando NULL como
--   p_field_name, o bloco de filtragem (p_field_name IS NOT NULL) nunca executava.
--   Além disso, o resultado v_rule_result.sync_field_mode/sync_fields nunca era
--   usado para filtrar v_changed_fields antes de enfileirar.
--   Fix: filtrar v_changed_fields por sync_field_mode após receber a regra.
--
-- BUG 3: Limpeza de eventos duplicados já na fila
--   Remove a segunda cópia de cada par duplicado (mantém menor id).
-- =============================================================================

-- 1. Dropar trigger duplicado (manter apenas trg_card_outbound_sync)
-- Wrapped em DO: staging pode não ter a tabela cards
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cards'
    ) THEN
        EXECUTE 'DROP TRIGGER IF EXISTS tr_log_outbound_card_event ON public.cards';
    END IF;
END $$;

-- 2. Limpar duplicatas e resetar card_created stuck
-- Wrapped em DO: staging pode não ter integration_outbound_queue
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'integration_outbound_queue'
    ) THEN
        DELETE FROM public.integration_outbound_queue a
        USING public.integration_outbound_queue b
        WHERE a.card_id   = b.card_id
          AND a.event_type = b.event_type
          AND a.created_at = b.created_at
          AND a.id > b.id;
    END IF;
END $$;

-- 3. Recriar função com sync_field_mode funcionando
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
    v_filtered_fields JSONB := '{}';   -- novo: usado para filtrar sync_field_mode=selected
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
        -- Cards vindos da integração já têm external_id → ignorar
        IF NEW.external_id IS NOT NULL THEN
            RETURN NEW;
        END IF;
        -- Precisa de pipeline/stage para match de regras
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

    -- Guard 2: Só cards sincronizados (com external_id)
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Guard 3: Buscar integração pelo provider/name
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
                -- Bloqueado pela regra, mas continua para verificar outros eventos
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

        -- JSONB: marketing_data (destinos, motivo, pax, orcamento, etc.)
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

                -- FIX BUG 2: Filtrar campos pelo sync_field_mode retornado pela regra
                IF v_rule_result.sync_field_mode = 'selected' AND v_rule_result.sync_fields IS NOT NULL THEN
                    -- Manter apenas campos permitidos
                    v_filtered_fields := '{}';
                    FOR v_jsonb_key IN SELECT jsonb_object_keys(v_changed_fields) LOOP
                        IF v_jsonb_key = ANY(v_rule_result.sync_fields) THEN
                            v_filtered_fields := v_filtered_fields
                                || jsonb_build_object(v_jsonb_key, v_changed_fields->v_jsonb_key);
                        END IF;
                    END LOOP;
                    v_changed_fields := v_filtered_fields;

                ELSIF v_rule_result.sync_field_mode = 'exclude' AND v_rule_result.sync_fields IS NOT NULL THEN
                    -- Remover campos excluídos
                    FOR v_jsonb_key IN SELECT unnest(v_rule_result.sync_fields) LOOP
                        v_changed_fields := v_changed_fields - v_jsonb_key;
                    END LOOP;
                END IF;
                -- sync_field_mode = 'all': não filtra, usa v_changed_fields completo

                -- Só enfileirar se ainda restam campos após o filtro
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

-- 4. Resetar card_created que falharam por "Unknown event type" (dispatcher antigo)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'integration_outbound_queue'
    ) THEN
        UPDATE public.integration_outbound_queue
        SET status        = 'pending',
            attempts      = 0,
            next_retry_at = NULL,
            processing_log = 'Reset para retry: handler card_created adicionado ao dispatcher'
        WHERE event_type = 'card_created'
          AND status IN ('failed', 'pending');
    END IF;
END $$;

COMMENT ON FUNCTION log_outbound_card_event IS
'Trigger que monitora INSERT/UPDATE em cards e enfileira eventos outbound.
INSERT → card_created (cards novos sem external_id, para criação no AC).
UPDATE → stage_change, won, lost, field_update (cards com external_id).
Verificações: action_type (create_only/update_only/all) + sync_field_mode (all/selected/exclude).
Fix 2026-03-02: corrige BUG trigger duplicado + BUG sync_field_mode ignorado.';
