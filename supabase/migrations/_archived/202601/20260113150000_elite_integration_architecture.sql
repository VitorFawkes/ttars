-- Elite Integration Architecture v3: Phase 2 - Schema Changes
-- Migration: Platform-Agnostic Messaging + Bidirectional Sync

-- =============================================================================
-- PART 1: WHATSAPP PLATFORMS ENHANCEMENTS
-- =============================================================================

-- Add capability flags and instance configuration
ALTER TABLE public.whatsapp_platforms
ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '{
    "has_direct_link": true,
    "requires_instance": false,
    "supports_user_mapping": false
}'::jsonb,
ADD COLUMN IF NOT EXISTS instance_id text,
ADD COLUMN IF NOT EXISTS instance_label text,
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.whatsapp_platforms.capabilities IS 'Platform capability flags: has_direct_link, requires_instance, supports_user_mapping';
COMMENT ON COLUMN public.whatsapp_platforms.instance_id IS 'External instance identifier (e.g., ChatPro instance ID)';
COMMENT ON COLUMN public.whatsapp_platforms.instance_label IS 'Human-readable label for this instance (e.g., SDR, Planner)';

-- =============================================================================
-- PART 2: PHASE-TO-INSTANCE MAPPING TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_phase_instance_map (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    phase_id uuid REFERENCES public.pipeline_phases(id) ON DELETE CASCADE,
    platform_id uuid REFERENCES public.whatsapp_platforms(id) ON DELETE CASCADE,
    priority int DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    UNIQUE(phase_id, platform_id)
);

COMMENT ON TABLE public.whatsapp_phase_instance_map IS 'Maps pipeline phases to WhatsApp platform instances for smart routing';
COMMENT ON COLUMN public.whatsapp_phase_instance_map.priority IS 'Lower number = higher priority (for fallback ordering)';

-- Enable RLS
ALTER TABLE public.whatsapp_phase_instance_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON public.whatsapp_phase_instance_map
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin write" ON public.whatsapp_phase_instance_map
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================================================
-- PART 3: CONVERSATION ID ABSTRACTION
-- =============================================================================

-- Add external conversation ID to whatsapp_conversations
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS external_conversation_id text,
ADD COLUMN IF NOT EXISTS external_conversation_url text;

COMMENT ON COLUMN public.whatsapp_conversations.external_conversation_id IS 'Platform-agnostic conversation ID (replaces chatpro_session_id)';
COMMENT ON COLUMN public.whatsapp_conversations.external_conversation_url IS 'Direct URL to this conversation (if platform supports)';

-- Migrate existing chatpro_session_id data to conversations table
-- Migrate existing chatpro_session_id data to conversations table
INSERT INTO public.whatsapp_conversations (contact_id, instance_id, external_conversation_id, created_at)
SELECT 
    c.id,
    (SELECT id FROM public.whatsapp_platforms WHERE provider = 'chatpro' LIMIT 1),
    c.chatpro_session_id,
    now()
FROM public.contatos c
WHERE c.chatpro_session_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PART 4: OUTBOUND INTEGRATION TABLES
-- =============================================================================

-- Outbound Stage Mapping (Welcome Stage → Active Stage)
CREATE TABLE IF NOT EXISTS public.integration_outbound_stage_map (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
    internal_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    external_stage_id text NOT NULL,
    external_stage_name text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    UNIQUE(integration_id, internal_stage_id)
);

COMMENT ON TABLE public.integration_outbound_stage_map IS 'Maps Welcome stages to external system stages for outbound sync';

-- Enable RLS
ALTER TABLE public.integration_outbound_stage_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON public.integration_outbound_stage_map
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin write" ON public.integration_outbound_stage_map
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Outbound Field Mapping
CREATE TABLE IF NOT EXISTS public.integration_outbound_field_map (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
    internal_field text NOT NULL,
    internal_field_label text,
    external_field_id text NOT NULL,
    external_field_name text,
    sync_on_phases uuid[] DEFAULT '{}',
    sync_always boolean DEFAULT false,
    transform_type text DEFAULT 'direct',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    UNIQUE(integration_id, internal_field)
);

COMMENT ON TABLE public.integration_outbound_field_map IS 'Maps Welcome fields to external fields with phase-aware sync rules';
COMMENT ON COLUMN public.integration_outbound_field_map.sync_on_phases IS 'Only sync when card is in these phases (empty = check visibility)';
COMMENT ON COLUMN public.integration_outbound_field_map.sync_always IS 'If true, sync regardless of phase visibility';

-- Enable RLS
ALTER TABLE public.integration_outbound_field_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON public.integration_outbound_field_map
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin write" ON public.integration_outbound_field_map
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================================================
-- PART 5: OUTBOUND EVENT QUEUE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.integration_outbound_queue (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    card_id uuid REFERENCES public.cards(id) ON DELETE CASCADE,
    integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
    external_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'sent', 'failed', 'blocked'
    )),
    processing_log text,
    attempts int DEFAULT 0,
    max_attempts int DEFAULT 3,
    next_retry_at timestamptz,
    triggered_by text DEFAULT 'user',
    created_at timestamptz DEFAULT now(),
    processed_at timestamptz
);

COMMENT ON TABLE public.integration_outbound_queue IS 'Queue for outbound events to external systems (e.g., ActiveCampaign)';
COMMENT ON COLUMN public.integration_outbound_queue.triggered_by IS 'Source of this event: user, integration, system';

CREATE INDEX IF NOT EXISTS idx_outbound_queue_pending 
    ON public.integration_outbound_queue(status, created_at) 
    WHERE status IN ('pending', 'processing');

-- Enable RLS
ALTER TABLE public.integration_outbound_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON public.integration_outbound_queue
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow system write" ON public.integration_outbound_queue
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- PART 6: FIELD CATALOG (for UI dropdowns)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.integration_field_catalog (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
    direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    field_key text NOT NULL,
    field_name text NOT NULL,
    field_type text DEFAULT 'text',
    is_required boolean DEFAULT false,
    source text DEFAULT 'detected',
    created_at timestamptz DEFAULT now(),
    
    UNIQUE(integration_id, direction, field_key)
);

COMMENT ON TABLE public.integration_field_catalog IS 'Catalog of available fields for mapping (both internal and external)';

-- Enable RLS
ALTER TABLE public.integration_field_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON public.integration_field_catalog
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin write" ON public.integration_field_catalog
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================================================
-- PART 7: SEED DEFAULT FIELD CATALOG FOR WELCOME CRM
-- =============================================================================

INSERT INTO public.integration_field_catalog (integration_id, direction, field_key, field_name, field_type, is_required, source)
SELECT 
    i.id,
    'outbound',
    f.field_key,
    f.field_name,
    f.field_type,
    f.is_required,
    'system'
FROM public.integrations i,
(VALUES 
    ('titulo', 'Título do Card', 'text', false),
    ('valor_estimado', 'Valor Estimado', 'currency', false),
    ('valor_final', 'Valor Final', 'currency', false),
    ('data_viagem_inicio', 'Data Início Viagem', 'date', false),
    ('data_viagem_fim', 'Data Fim Viagem', 'date', false),
    ('origem', 'Origem do Lead', 'text', false),
    ('prioridade', 'Prioridade', 'select', false),
    ('status_comercial', 'Status Comercial', 'select', true),
    ('pipeline_stage_id', 'Etapa Atual', 'stage', true),
    ('pessoa_principal.nome', 'Nome do Contato', 'text', false),
    ('pessoa_principal.email', 'Email do Contato', 'email', false),
    ('pessoa_principal.telefone', 'Telefone do Contato', 'phone', false),
    ('taxa_status', 'Status da Taxa', 'select', false),
    ('taxa_valor', 'Valor da Taxa', 'currency', false)
) AS f(field_key, field_name, field_type, is_required)
WHERE i.provider = 'activecampaign' OR i.name ILIKE '%active%'
ON CONFLICT (integration_id, direction, field_key) DO NOTHING;

-- =============================================================================
-- PART 8: HELPER FUNCTION - Should Sync Field
-- =============================================================================

CREATE OR REPLACE FUNCTION public.should_sync_field(
    p_integration_id uuid,
    p_internal_field text,
    p_current_phase_id uuid
) RETURNS boolean AS $$
DECLARE
    v_map record;
BEGIN
    SELECT * INTO v_map
    FROM public.integration_outbound_field_map
    WHERE integration_id = p_integration_id
      AND internal_field = p_internal_field
      AND is_active = true;
    
    IF NOT FOUND THEN RETURN false; END IF;
    
    -- Always sync if configured
    IF v_map.sync_always THEN RETURN true; END IF;
    
    -- Check if current phase is in sync list
    IF p_current_phase_id = ANY(v_map.sync_on_phases) THEN RETURN true; END IF;
    
    -- Default: check visibility in pipeline_card_settings
    RETURN EXISTS (
        SELECT 1 FROM public.pipeline_card_settings pcs
        WHERE pcs.phase_id = p_current_phase_id
          AND (pcs.campos_visiveis IS NULL OR pcs.campos_visiveis ? p_internal_field)
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.should_sync_field IS 'Determines if a field should sync based on mapping config and phase visibility';
