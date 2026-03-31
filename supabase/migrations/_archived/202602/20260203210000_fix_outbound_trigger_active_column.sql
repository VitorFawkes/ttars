-- =============================================================================
-- FIX: Corrigir coluna 'active' para 'is_active' no trigger log_outbound_card_event
-- Bug: A migration 20260203200000 usou 'active' mas a coluna correta é 'is_active'
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_outbound_card_event()
RETURNS TRIGGER AS $$
DECLARE
    v_integration_id uuid;
    v_outbound_stage_id text;
    v_outbound_stage_name text;
    v_current_phase_id uuid;
    v_sync_enabled boolean;
    v_shadow_mode boolean;
    v_allowed_events text[];
    v_event_status text;
    v_ac_field_id text;
    v_orcamento_value jsonb;
BEGIN
    -- Only process cards synced from external systems (have external_id)
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Prevent infinite loops: skip if triggered by integration
    IF current_setting('app.update_source', true) = 'integration' THEN
        RETURN NEW;
    END IF;

    -- =========================================================================
    -- CHECK GLOBAL SETTINGS
    -- =========================================================================
    v_sync_enabled := COALESCE(public.get_outbound_setting('OUTBOUND_SYNC_ENABLED'), 'false') = 'true';
    v_shadow_mode := COALESCE(public.get_outbound_setting('OUTBOUND_SHADOW_MODE'), 'true') = 'true';

    -- If sync is disabled globally, exit early
    IF NOT v_sync_enabled THEN
        RETURN NEW;
    END IF;

    -- Get allowed event types
    v_allowed_events := string_to_array(
        COALESCE(public.get_outbound_setting('OUTBOUND_ALLOWED_EVENTS'), 'stage_change,won,lost,field_update'),
        ','
    );

    -- Determine event status based on shadow mode
    v_event_status := CASE WHEN v_shadow_mode THEN 'shadow' ELSE 'pending' END;

    -- =========================================================================
    -- FIND INTEGRATION (FIXED: is_active instead of active)
    -- =========================================================================
    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE (provider = NEW.external_source OR name ILIKE '%' || NEW.external_source || '%')
      AND is_active = true
    LIMIT 1;

    IF v_integration_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get current phase for field sync decisions
    SELECT ps.phase_id INTO v_current_phase_id
    FROM public.pipeline_stages ps
    WHERE ps.id = NEW.pipeline_stage_id;

    -- ==========================================================================
    -- STAGE CHANGE DETECTION
    -- ==========================================================================
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id
       AND 'stage_change' = ANY(v_allowed_events) THEN
        -- Look up outbound stage mapping
        SELECT osm.external_stage_id, osm.external_stage_name
        INTO v_outbound_stage_id, v_outbound_stage_name
        FROM public.integration_outbound_stage_map osm
        WHERE osm.integration_id = v_integration_id
          AND osm.internal_stage_id = NEW.pipeline_stage_id
          AND osm.is_active = true;

        IF v_outbound_stage_id IS NOT NULL THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, status, triggered_by
            ) VALUES (
                NEW.id,
                v_integration_id,
                NEW.external_id,
                'stage_change',
                jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'target_external_stage_id', v_outbound_stage_id,
                    'target_external_stage_name', v_outbound_stage_name,
                    'shadow_mode', v_shadow_mode
                ),
                v_event_status,
                'user'
            );
        END IF;
    END IF;

    -- ==========================================================================
    -- WON/LOST DETECTION (via status_comercial)
    -- ==========================================================================
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial THEN
        IF NEW.status_comercial = 'ganho' AND 'won' = ANY(v_allowed_events) THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, status, triggered_by
            ) VALUES (
                NEW.id,
                v_integration_id,
                NEW.external_id,
                'won',
                jsonb_build_object(
                    'status', 'won',
                    'valor_final', NEW.valor_final,
                    'shadow_mode', v_shadow_mode
                ),
                v_event_status,
                'user'
            );
        ELSIF NEW.status_comercial = 'perdido' AND 'lost' = ANY(v_allowed_events) THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, status, triggered_by
            ) VALUES (
                NEW.id,
                v_integration_id,
                NEW.external_id,
                'lost',
                jsonb_build_object(
                    'status', 'lost',
                    'reason', NEW.motivo_perda_id,
                    'shadow_mode', v_shadow_mode
                ),
                v_event_status,
                'user'
            );
        END IF;
    END IF;

    -- ==========================================================================
    -- FIELD CHANGE DETECTION (for mapped fields)
    -- ==========================================================================
    IF 'field_update' = ANY(v_allowed_events) THEN

        -- Valor Estimado
        IF OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado THEN
            IF public.should_sync_field(v_integration_id, 'valor_estimado', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'valor_estimado');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.valor_estimado, 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Valor Final
        IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
            IF public.should_sync_field(v_integration_id, 'valor_final', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'valor_final');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.valor_final, 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Data Viagem Início
        IF OLD.data_viagem_inicio IS DISTINCT FROM NEW.data_viagem_inicio THEN
            IF public.should_sync_field(v_integration_id, 'data_viagem_inicio', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'data_viagem_inicio');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.data_viagem_inicio, 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Data Viagem Fim
        IF OLD.data_viagem_fim IS DISTINCT FROM NEW.data_viagem_fim THEN
            IF public.should_sync_field(v_integration_id, 'data_viagem_fim', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'data_viagem_fim');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.data_viagem_fim, 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Orçamento (produto_data -> 'orcamento')
        IF (OLD.produto_data -> 'orcamento') IS DISTINCT FROM (NEW.produto_data -> 'orcamento') THEN
            IF public.should_sync_field(v_integration_id, 'orcamento', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'orcamento');
                IF v_ac_field_id IS NOT NULL THEN
                    v_orcamento_value := NEW.produto_data -> 'orcamento';
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(
                            v_ac_field_id,
                            COALESCE(
                                v_orcamento_value -> 'total_calculado',
                                v_orcamento_value -> 'valor',
                                v_orcamento_value
                            ),
                            'shadow_mode', v_shadow_mode
                        ),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Destinos (produto_data -> 'destinos')
        IF (OLD.produto_data -> 'destinos') IS DISTINCT FROM (NEW.produto_data -> 'destinos') THEN
            IF public.should_sync_field(v_integration_id, 'destinos', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'destinos');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.produto_data ->> 'destinos', 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

        -- Pax (produto_data -> 'pax')
        IF (OLD.produto_data -> 'pax') IS DISTINCT FROM (NEW.produto_data -> 'pax') THEN
            IF public.should_sync_field(v_integration_id, 'pax', v_current_phase_id) THEN
                v_ac_field_id := public.get_outbound_external_field_id(v_integration_id, 'pax');
                IF v_ac_field_id IS NOT NULL THEN
                    INSERT INTO public.integration_outbound_queue (
                        card_id, integration_id, external_id, event_type, payload, status, triggered_by
                    ) VALUES (
                        NEW.id, v_integration_id, NEW.external_id, 'field_update',
                        jsonb_build_object(v_ac_field_id, NEW.produto_data ->> 'pax', 'shadow_mode', v_shadow_mode),
                        v_event_status,
                        'user'
                    );
                END IF;
            END IF;
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_outbound_card_event IS
'Logs card changes to outbound queue. FIXED: Uses is_active instead of active for integrations table.';
