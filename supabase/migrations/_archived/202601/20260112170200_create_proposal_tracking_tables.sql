-- ============================================
-- PHASE 1.3: Tracking & Selection Tables Migration
-- Tables: proposal_events, proposal_client_selections
-- ============================================

-- ============================================
-- proposal_events table (tracking all client interactions)
-- ============================================
CREATE TABLE IF NOT EXISTS proposal_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    client_ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Common event types:
-- link_opened, section_viewed, item_selected, item_deselected, 
-- option_changed, summary_viewed, accepted, rejected, comment_added

-- ============================================
-- proposal_client_selections table (client's current selections)
-- ============================================
CREATE TABLE IF NOT EXISTS proposal_client_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES proposal_items(id) ON DELETE CASCADE,
    option_id UUID REFERENCES proposal_options(id) ON DELETE SET NULL,
    selected BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(proposal_id, item_id)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_proposal_events_proposal_id ON proposal_events(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_events_created_at ON proposal_events(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_events_type ON proposal_events(event_type);
CREATE INDEX IF NOT EXISTS idx_proposal_client_selections_proposal_id ON proposal_client_selections(proposal_id);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE proposal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_client_selections ENABLE ROW LEVEL SECURITY;

-- proposal_events: Public can INSERT (for tracking), authenticated can SELECT
DROP POLICY IF EXISTS "Anyone can insert proposal events" ON proposal_events;
CREATE POLICY "Anyone can insert proposal events" ON proposal_events
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view proposal events" ON proposal_events;
CREATE POLICY "Authenticated users can view proposal events" ON proposal_events
    FOR SELECT TO authenticated USING (true);

-- proposal_client_selections: Public can UPDATE/INSERT for selections
DROP POLICY IF EXISTS "Anyone can view selections" ON proposal_client_selections;
CREATE POLICY "Anyone can view selections" ON proposal_client_selections
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can insert selections" ON proposal_client_selections;
CREATE POLICY "Anyone can insert selections" ON proposal_client_selections
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update selections" ON proposal_client_selections;
CREATE POLICY "Anyone can update selections" ON proposal_client_selections
    FOR UPDATE TO anon, authenticated USING (true);

-- Trigger for updated_at on selections
DROP TRIGGER IF EXISTS update_proposal_client_selections_updated_at ON proposal_client_selections;
CREATE TRIGGER update_proposal_client_selections_updated_at
    BEFORE UPDATE ON proposal_client_selections
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
