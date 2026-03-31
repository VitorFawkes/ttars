-- ============================================
-- PHASE 1.2: Content Tables Migration
-- Tables: proposal_sections, proposal_items, proposal_options
-- ============================================

-- Create section_type enum
DO $$ BEGIN
    CREATE TYPE proposal_section_type AS ENUM (
        'cover', 'itinerary', 'flights', 'hotels', 'experiences', 
        'transfers', 'services', 'terms', 'summary', 'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create item_type enum
DO $$ BEGIN
    CREATE TYPE proposal_item_type AS ENUM (
        'hotel', 'flight', 'transfer', 'experience', 
        'service', 'insurance', 'fee', 'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- proposal_sections table
-- ============================================
CREATE TABLE IF NOT EXISTS proposal_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES proposal_versions(id) ON DELETE CASCADE,
    section_type proposal_section_type NOT NULL,
    title TEXT NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    config JSONB DEFAULT '{}'::jsonb,
    visible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- proposal_items table
-- ============================================
CREATE TABLE IF NOT EXISTS proposal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES proposal_sections(id) ON DELETE CASCADE,
    item_type proposal_item_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    rich_content JSONB DEFAULT '{}'::jsonb,
    base_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ordem INTEGER NOT NULL DEFAULT 0,
    is_optional BOOLEAN NOT NULL DEFAULT false,
    is_default_selected BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- proposal_options table (alternatives for an item)
-- ============================================
CREATE TABLE IF NOT EXISTS proposal_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES proposal_items(id) ON DELETE CASCADE,
    option_label TEXT NOT NULL,
    description TEXT,
    price_delta DECIMAL(12, 2) NOT NULL DEFAULT 0,
    details JSONB DEFAULT '{}'::jsonb,
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_proposal_sections_version_id ON proposal_sections(version_id);
CREATE INDEX IF NOT EXISTS idx_proposal_sections_ordem ON proposal_sections(version_id, ordem);
CREATE INDEX IF NOT EXISTS idx_proposal_items_section_id ON proposal_items(section_id);
CREATE INDEX IF NOT EXISTS idx_proposal_items_ordem ON proposal_items(section_id, ordem);
CREATE INDEX IF NOT EXISTS idx_proposal_options_item_id ON proposal_options(item_id);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_options ENABLE ROW LEVEL SECURITY;

-- proposal_sections policies
DROP POLICY IF EXISTS "Users can view proposal sections" ON proposal_sections;
CREATE POLICY "Users can view proposal sections" ON proposal_sections
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert proposal sections" ON proposal_sections;
CREATE POLICY "Users can insert proposal sections" ON proposal_sections
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update proposal sections" ON proposal_sections;
CREATE POLICY "Users can update proposal sections" ON proposal_sections
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete proposal sections" ON proposal_sections;
CREATE POLICY "Users can delete proposal sections" ON proposal_sections
    FOR DELETE TO authenticated USING (true);

-- proposal_items policies
DROP POLICY IF EXISTS "Users can view proposal items" ON proposal_items;
CREATE POLICY "Users can view proposal items" ON proposal_items
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert proposal items" ON proposal_items;
CREATE POLICY "Users can insert proposal items" ON proposal_items
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update proposal items" ON proposal_items;
CREATE POLICY "Users can update proposal items" ON proposal_items
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete proposal items" ON proposal_items;
CREATE POLICY "Users can delete proposal items" ON proposal_items
    FOR DELETE TO authenticated USING (true);

-- proposal_options policies
DROP POLICY IF EXISTS "Users can view proposal options" ON proposal_options;
CREATE POLICY "Users can view proposal options" ON proposal_options
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert proposal options" ON proposal_options;
CREATE POLICY "Users can insert proposal options" ON proposal_options
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update proposal options" ON proposal_options;
CREATE POLICY "Users can update proposal options" ON proposal_options
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can delete proposal options" ON proposal_options;
CREATE POLICY "Users can delete proposal options" ON proposal_options
    FOR DELETE TO authenticated USING (true);
