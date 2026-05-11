-- Elite Integration Architecture v3: Seed Data & Outbound Trigger
-- Migration: ChatPro Platforms + Outbound Card Sync

-- =============================================================================
-- PART 1: SEED CHATPRO PLATFORMS (SDR + Planner)
-- =============================================================================

-- 1. Relax the unique constraint on 'provider' to allow multiple instances
-- We drop the old index/constraint and create a new composite one
DROP INDEX IF EXISTS public.idx_whatsapp_platforms_provider;
ALTER TABLE public.whatsapp_platforms DROP CONSTRAINT IF EXISTS whatsapp_platforms_provider_key;

-- Create new composite unique constraint (provider + instance_label)
-- This allows multiple 'chatpro' rows as long as they have different labels (SDR, Planner)
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_platforms_provider_label 
ON public.whatsapp_platforms(provider, COALESCE(instance_label, ''));

-- First, update existing ChatPro platform to be SDR instance
UPDATE public.whatsapp_platforms
SET 
    instance_label = 'SDR',
    capabilities = '{
        "has_direct_link": true,
        "requires_instance": true,
        "supports_user_mapping": false
    }'::jsonb,
    dashboard_url_template = 'https://app.chatpro.com.br/chat/{conversation_id}'
WHERE provider = 'chatpro' AND (instance_label IS NULL OR instance_label = '');

-- Insert ChatPro Planner instance if not exists
INSERT INTO public.whatsapp_platforms (
    name, 
    provider, 
    instance_label,
    dashboard_url_template,
    capabilities,
    is_active
)
SELECT 
    'ChatPro (Planner)',
    'chatpro',
    'Planner',
    'https://app.chatpro.com.br/chat/{conversation_id}',
    '{
        "has_direct_link": true,
        "requires_instance": true,
        "supports_user_mapping": false
    }'::jsonb,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.whatsapp_platforms 
    WHERE provider = 'chatpro' AND instance_label = 'Planner'
);

-- Insert Echo platform (static dashboard, no instances)
INSERT INTO public.whatsapp_platforms (
    name,
    provider,
    instance_label,
    dashboard_url_template,
    capabilities,
    is_active
)
SELECT
    'Echo',
    'echo',
    NULL,
    'https://echo-wpp.vercel.app/dashboard',
    '{
        "has_direct_link": false,
        "requires_instance": false,
        "supports_user_mapping": false
    }'::jsonb,
    false  -- Inactive until configured
WHERE NOT EXISTS (
    SELECT 1 FROM public.whatsapp_platforms WHERE provider = 'echo'
);

-- =============================================================================
-- PART 2: SEED PHASE-TO-INSTANCE MAPPINGS
-- =============================================================================

-- Map SDR phase to SDR instance
INSERT INTO public.whatsapp_phase_instance_map (phase_id, platform_id, priority, is_active)
SELECT 
    pp.id,
    wp.id,
    1,
    true
FROM public.pipeline_phases pp
CROSS JOIN public.whatsapp_platforms wp
WHERE pp.slug = 'sdr' 
  AND wp.provider = 'chatpro' 
  AND wp.instance_label = 'SDR'
ON CONFLICT (phase_id, platform_id) DO NOTHING;

-- Map Planner phase to Planner instance
INSERT INTO public.whatsapp_phase_instance_map (phase_id, platform_id, priority, is_active)
SELECT 
    pp.id,
    wp.id,
    1,
    true
FROM public.pipeline_phases pp
CROSS JOIN public.whatsapp_platforms wp
WHERE pp.slug = 'planner' 
  AND wp.provider = 'chatpro' 
  AND wp.instance_label = 'Planner'
ON CONFLICT (phase_id, platform_id) DO NOTHING;

-- Map Pós-Vendas phase to Planner instance
INSERT INTO public.whatsapp_phase_instance_map (phase_id, platform_id, priority, is_active)
SELECT 
    pp.id,
    wp.id,
    1,
    true
FROM public.pipeline_phases pp
CROSS JOIN public.whatsapp_platforms wp
WHERE pp.slug IN ('pos-vendas', 'pos_vendas', 'posvendas')
  AND wp.provider = 'chatpro' 
  AND wp.instance_label = 'Planner'
ON CONFLICT (phase_id, platform_id) DO NOTHING;

-- =============================================================================
-- PART 3: OUTBOUND CARD SYNC TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_outbound_card_event()
RETURNS TRIGGER AS $$
DECLARE
    v_integration_id uuid;
    v_outbound_stage_id text;
    v_outbound_stage_name text;
    v_current_phase_id uuid;
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
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        -- Look up outbound stage mapping
        SELECT osm.external_stage_id, osm.external_stage_name 
        INTO v_outbound_stage_id, v_outbound_stage_name
        FROM public.integration_outbound_stage_map osm
        WHERE osm.integration_id = v_integration_id
          AND osm.internal_stage_id = NEW.pipeline_stage_id
          AND osm.is_active = true;
        
        IF v_outbound_stage_id IS NOT NULL THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, triggered_by
            ) VALUES (
                NEW.id,
                v_integration_id,
                NEW.external_id,
                'stage_change',
                jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'target_external_stage_id', v_outbound_stage_id,
                    'target_external_stage_name', v_outbound_stage_name
                ),
                'user'
            );
        END IF;
    END IF;
    
    -- ==========================================================================
    -- WON/LOST DETECTION (via status_comercial)
    -- ==========================================================================
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial THEN
        IF NEW.status_comercial = 'ganho' THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, triggered_by
            ) VALUES (
                NEW.id, 
                v_integration_id, 
                NEW.external_id, 
                'won',
                jsonb_build_object(
                    'status', 'won',
                    'valor_final', NEW.valor_final
                ),
                'user'
            );
        ELSIF NEW.status_comercial = 'perdido' THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, triggered_by
            ) VALUES (
                NEW.id, 
                v_integration_id, 
                NEW.external_id, 
                'lost',
                jsonb_build_object(
                    'status', 'lost', 
                    'reason', NEW.motivo_perda_id
                ),
                'user'
            );
        END IF;
    END IF;
    
    -- ==========================================================================
    -- FIELD CHANGE DETECTION (for mapped fields)
    -- ==========================================================================
    -- Note: For simplicity, we detect a few key fields explicitly.
    -- A more sophisticated implementation would iterate over integration_outbound_field_map.
    
    -- Valor Estimado
    IF OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado THEN
        IF public.should_sync_field(v_integration_id, 'valor_estimado', v_current_phase_id) THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, triggered_by
            ) VALUES (
                NEW.id, v_integration_id, NEW.external_id, 'field_update',
                jsonb_build_object('valor_estimado', NEW.valor_estimado),
                'user'
            );
        END IF;
    END IF;
    
    -- Valor Final
    IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
        IF public.should_sync_field(v_integration_id, 'valor_final', v_current_phase_id) THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, triggered_by
            ) VALUES (
                NEW.id, v_integration_id, NEW.external_id, 'field_update',
                jsonb_build_object('valor_final', NEW.valor_final),
                'user'
            );
        END IF;
    END IF;
    
    -- Data Viagem Início
    IF OLD.data_viagem_inicio IS DISTINCT FROM NEW.data_viagem_inicio THEN
        IF public.should_sync_field(v_integration_id, 'data_viagem_inicio', v_current_phase_id) THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, triggered_by
            ) VALUES (
                NEW.id, v_integration_id, NEW.external_id, 'field_update',
                jsonb_build_object('data_viagem_inicio', NEW.data_viagem_inicio),
                'user'
            );
        END IF;
    END IF;
    
    -- Data Viagem Fim
    IF OLD.data_viagem_fim IS DISTINCT FROM NEW.data_viagem_fim THEN
        IF public.should_sync_field(v_integration_id, 'data_viagem_fim', v_current_phase_id) THEN
            INSERT INTO public.integration_outbound_queue (
                card_id, integration_id, external_id, event_type, payload, triggered_by
            ) VALUES (
                NEW.id, v_integration_id, NEW.external_id, 'field_update',
                jsonb_build_object('data_viagem_fim', NEW.data_viagem_fim),
                'user'
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS trg_card_outbound_sync ON public.cards;

-- Create the trigger
CREATE TRIGGER trg_card_outbound_sync
    AFTER UPDATE ON public.cards
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION public.log_outbound_card_event();

COMMENT ON FUNCTION public.log_outbound_card_event IS 'Logs card changes to outbound queue for sync to external systems';
