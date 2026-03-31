-- Fix log_outbound_card_event trigger function
-- Bug: references 'active' column but integrations table has 'is_active'
-- Applied 2026-01-21 via MCP to fix AC integration

CREATE OR REPLACE FUNCTION public.log_outbound_card_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_integration_id uuid;
    v_outbound_stage_id text;
    v_outbound_stage_name text;
    v_current_phase_id uuid;
    v_card_ac_pipeline text;
    v_mapping record;
    v_new_jsonb jsonb;
    v_old_jsonb jsonb;
    v_new_value jsonb;
    v_old_value jsonb;
    v_field_key text;
BEGIN
    -- Only process cards synced from external systems (have external_id)
    IF NEW.external_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Prevent infinite loops: skip if triggered by integration
    IF current_setting('app.update_source', true) = 'integration' THEN
        RETURN NEW;
    END IF;
    
    -- Find the integration for this external source
    -- FIX: Changed 'active' to 'is_active' to match actual column name
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
    -- GET THE CARD'S AC PIPELINE (from router config based on stage's pipeline)
    -- ==========================================================================
    SELECT rc.external_pipeline_id INTO v_card_ac_pipeline
    FROM public.integration_router_config rc
    JOIN public.pipeline_stages ps ON ps.pipeline_id = rc.pipeline_id
    WHERE ps.id = NEW.pipeline_stage_id
    LIMIT 1;
    
    -- ==========================================================================
    -- STAGE CHANGE DETECTION
    -- ==========================================================================
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        -- Look up outbound stage mapping
        SELECT external_stage_id, external_stage_name 
        INTO v_outbound_stage_id, v_outbound_stage_name
        FROM public.integration_outbound_stage_map
        WHERE integration_id = v_integration_id
          AND internal_stage_id = NEW.pipeline_stage_id
          AND is_active = true;
        
        IF v_outbound_stage_id IS NOT NULL THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, triggered_by
            ) VALUES (
                NEW.id, v_integration_id, NEW.external_id, 'stage_change',
                jsonb_build_object(
                    'stage', v_outbound_stage_id,
                    'stageName', v_outbound_stage_name,
                    'pipeline', v_card_ac_pipeline
                ),
                'user'
            );
        END IF;
    END IF;
    
    -- ==========================================================================
    -- FIELD CHANGE DETECTION (Dynamic based on mapping)
    -- ==========================================================================
    v_new_jsonb := to_jsonb(NEW);
    v_old_jsonb := to_jsonb(OLD);
    
    FOR v_mapping IN 
        SELECT internal_field, external_field_id, external_field_name
        FROM public.integration_outbound_field_map
        WHERE integration_id = v_integration_id
          AND is_active = true
          AND (external_pipeline_id = v_card_ac_pipeline OR external_pipeline_id IS NULL)
    LOOP
        v_field_key := v_mapping.internal_field;
        
        -- Get new and old values from JSONB
        IF v_field_key LIKE 'metadata.%' THEN
            v_new_value := v_new_jsonb -> 'metadata' -> substring(v_field_key FROM 10);
            v_old_value := v_old_jsonb -> 'metadata' -> substring(v_field_key FROM 10);
        ELSE
            v_new_value := v_new_jsonb -> v_field_key;
            v_old_value := v_old_jsonb -> v_field_key;
        END IF;
        
        -- Check if value changed
        IF v_new_value IS DISTINCT FROM v_old_value THEN
            IF public.should_sync_field(v_integration_id, v_field_key, v_current_phase_id) THEN
                INSERT INTO public.integration_outbound_queue (
                    card_id, integration_id, external_id, event_type, payload, triggered_by
                ) VALUES (
                    NEW.id, v_integration_id, NEW.external_id, 'field_update',
                    jsonb_build_object(
                        v_mapping.external_field_id,
                        CASE 
                            WHEN jsonb_typeof(v_new_value) = 'string' THEN v_new_value #>> '{}'
                            WHEN v_new_value IS NULL THEN ''
                            ELSE v_new_value::text
                        END
                    ),
                    'user'
                );
            END IF;
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.log_outbound_card_event IS 'Fixed 2026-01-21: Changed active to is_active for integrations lookup';
