-- ============================================================
-- INTEGRATION INBOUND TRIGGERS
-- Selective entity creation based on Pipeline + Stage
-- ============================================================

-- 1. Create the triggers table
CREATE TABLE IF NOT EXISTS public.integration_inbound_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
    external_pipeline_id TEXT NOT NULL,
    external_stage_id TEXT NOT NULL,
    action_type TEXT NOT NULL DEFAULT 'create_only' CHECK (action_type IN ('create_only', 'all')),
    entity_types TEXT[] NOT NULL DEFAULT ARRAY['deal', 'contact'],
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Unique constraint: one rule per pipeline+stage combo per integration
    CONSTRAINT unique_trigger_per_pipeline_stage UNIQUE (integration_id, external_pipeline_id, external_stage_id)
);

-- 2. Add comments
COMMENT ON TABLE public.integration_inbound_triggers IS 'Rules for when to create entities from inbound integration events. If no rules exist, all events are processed (backward compat).';
COMMENT ON COLUMN public.integration_inbound_triggers.external_pipeline_id IS 'ActiveCampaign Pipeline ID (e.g., "8" for SDR-Trips)';
COMMENT ON COLUMN public.integration_inbound_triggers.external_stage_id IS 'ActiveCampaign Stage ID (e.g., "43" for 1 Contato)';
COMMENT ON COLUMN public.integration_inbound_triggers.action_type IS 'create_only = only deal_add events, all = any event type';
COMMENT ON COLUMN public.integration_inbound_triggers.entity_types IS 'Which entities to create: deal, contact, or both';

-- 3. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_inbound_triggers_lookup 
ON public.integration_inbound_triggers(integration_id, external_pipeline_id, external_stage_id, is_active);

-- 4. Enable RLS
ALTER TABLE public.integration_inbound_triggers ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (same as other integration tables - authenticated users)
CREATE POLICY "Allow authenticated select" ON public.integration_inbound_triggers
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON public.integration_inbound_triggers
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON public.integration_inbound_triggers
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated delete" ON public.integration_inbound_triggers
    FOR DELETE TO authenticated USING (true);

-- 6. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_inbound_triggers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inbound_triggers_timestamp
    BEFORE UPDATE ON public.integration_inbound_triggers
    FOR EACH ROW
    EXECUTE FUNCTION update_inbound_triggers_timestamp();
