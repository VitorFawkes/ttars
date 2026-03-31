-- =============================================================================
-- OUTBOUND SYNC CONTROLS
-- Adiciona controles de admin para sincronização CRM → ActiveCampaign
-- =============================================================================

-- =============================================================================
-- PART 1: SETTINGS DE CONTROLE GLOBAL
-- =============================================================================

-- Toggle global para habilitar/desabilitar sincronização de saída
INSERT INTO public.integration_settings (key, value, description)
VALUES ('OUTBOUND_SYNC_ENABLED', 'false', 'Habilita sincronização de mudanças do CRM para o ActiveCampaign')
ON CONFLICT (key) DO NOTHING;

-- Shadow Mode para outbound (testa sem enviar para AC)
INSERT INTO public.integration_settings (key, value, description)
VALUES ('OUTBOUND_SHADOW_MODE', 'true', 'Quando ativo, registra eventos na fila mas NÃO envia para o ActiveCampaign')
ON CONFLICT (key) DO NOTHING;

-- Tipos de eventos permitidos para outbound
INSERT INTO public.integration_settings (key, value, description)
VALUES ('OUTBOUND_ALLOWED_EVENTS', 'stage_change,won,lost,field_update', 'Tipos de eventos que serão sincronizados (CSV)')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- PART 2: FUNÇÃO HELPER PARA VERIFICAR SETTINGS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_outbound_setting(p_key text)
RETURNS text AS $$
DECLARE
    v_value text;
BEGIN
    SELECT value INTO v_value
    FROM public.integration_settings
    WHERE key = p_key;

    RETURN COALESCE(v_value, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_outbound_setting IS 'Retorna valor de um setting de integração outbound';

-- =============================================================================
-- PART 3: ATUALIZAR TRIGGER DE OUTBOUND COM CONTROLES
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
    -- FIND INTEGRATION
    -- =========================================================================
    SELECT id INTO v_integration_id
    FROM public.integrations
    WHERE (provider = NEW.external_source OR name ILIKE '%' || NEW.external_source || '%')
      AND active = true
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
                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload, status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, NEW.external_id, 'field_update',
                    jsonb_build_object('valor_estimado', NEW.valor_estimado, 'shadow_mode', v_shadow_mode),
                    v_event_status,
                    'user'
                );
            END IF;
        END IF;

        -- Valor Final
        IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
            IF public.should_sync_field(v_integration_id, 'valor_final', v_current_phase_id) THEN
                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload, status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, NEW.external_id, 'field_update',
                    jsonb_build_object('valor_final', NEW.valor_final, 'shadow_mode', v_shadow_mode),
                    v_event_status,
                    'user'
                );
            END IF;
        END IF;

        -- Data Viagem Início
        IF OLD.data_viagem_inicio IS DISTINCT FROM NEW.data_viagem_inicio THEN
            IF public.should_sync_field(v_integration_id, 'data_viagem_inicio', v_current_phase_id) THEN
                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload, status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, NEW.external_id, 'field_update',
                    jsonb_build_object('data_viagem_inicio', NEW.data_viagem_inicio, 'shadow_mode', v_shadow_mode),
                    v_event_status,
                    'user'
                );
            END IF;
        END IF;

        -- Data Viagem Fim
        IF OLD.data_viagem_fim IS DISTINCT FROM NEW.data_viagem_fim THEN
            IF public.should_sync_field(v_integration_id, 'data_viagem_fim', v_current_phase_id) THEN
                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload, status, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, NEW.external_id, 'field_update',
                    jsonb_build_object('data_viagem_fim', NEW.data_viagem_fim, 'shadow_mode', v_shadow_mode),
                    v_event_status,
                    'user'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_outbound_card_event IS 'Logs card changes to outbound queue with admin controls (toggle, shadow mode, allowed events)';

-- =============================================================================
-- PART 4: ADICIONAR COLUNA shadow NA FILA (se não existir)
-- =============================================================================

-- Adicionar status 'shadow' como válido
ALTER TABLE public.integration_outbound_queue
DROP CONSTRAINT IF EXISTS integration_outbound_queue_status_check;

ALTER TABLE public.integration_outbound_queue
ADD CONSTRAINT integration_outbound_queue_status_check
CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'blocked', 'shadow'));

-- =============================================================================
-- PART 5: INDEX PARA PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_outbound_queue_status_created
ON public.integration_outbound_queue(status, created_at)
WHERE status IN ('pending', 'shadow');

-- =============================================================================
-- COMENTÁRIOS
-- =============================================================================

COMMENT ON TABLE public.integration_outbound_queue IS
'Fila de eventos para sincronização CRM → ActiveCampaign.
Status shadow = evento registrado mas não será enviado (modo teste).
Controlado por: OUTBOUND_SYNC_ENABLED, OUTBOUND_SHADOW_MODE, OUTBOUND_ALLOWED_EVENTS';
