-- ============================================
-- PHASE 7.1: Content Library Migration
-- Tables: proposal_library with fuzzy search
-- ============================================

-- Enable required extensions for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Immutable unaccent wrapper for generated columns
CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text AS
$func$
SELECT public.unaccent('public.unaccent', $1)  -- schema-qualify function and dictionary
$func$  LANGUAGE sql IMMUTABLE;

-- ============================================
-- proposal_library table
-- ============================================
CREATE TABLE IF NOT EXISTS proposal_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Classification
    category TEXT NOT NULL CHECK (category IN ('hotel', 'experience', 'transfer', 'flight', 'service', 'text_block', 'custom')),
    
    -- Identification
    name TEXT NOT NULL,
    name_search TEXT GENERATED ALWAYS AS (
        lower(f_unaccent(regexp_replace(name, '[^a-zA-Z0-9\s]', '', 'g')))
    ) STORED, -- Normalized for search
    
    -- Content
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- content structure: { 
    --   description: string, 
    --   images: string[], 
    --   highlights: string[],
    --   specs: { key: value }
    -- }
    
    -- Pricing
    base_price DECIMAL(12, 2) DEFAULT 0,
    currency TEXT DEFAULT 'BRL',
    
    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    supplier TEXT, -- 'Fasano', 'Belmond', etc
    destination TEXT, -- 'Rio de Janeiro', 'Toscana'
    
    -- Ownership
    created_by UUID NOT NULL REFERENCES profiles(id),
    is_shared BOOLEAN NOT NULL DEFAULT true,
    
    -- Statistics
    usage_count INT NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Indexes for fuzzy search
-- ============================================

-- Trigram index for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_library_name_trgm 
ON proposal_library USING gin(name gin_trgm_ops);

-- Normalized name for exact-ish matching
CREATE INDEX IF NOT EXISTS idx_library_name_search 
ON proposal_library(name_search);

-- Category index
CREATE INDEX IF NOT EXISTS idx_library_category 
ON proposal_library(category);

-- Destination index
CREATE INDEX IF NOT EXISTS idx_library_destination 
ON proposal_library(destination);

-- Supplier index
CREATE INDEX IF NOT EXISTS idx_library_supplier 
ON proposal_library(supplier);

-- Tags GIN index
CREATE INDEX IF NOT EXISTS idx_library_tags 
ON proposal_library USING gin(tags);

-- Owner index
CREATE INDEX IF NOT EXISTS idx_library_created_by 
ON proposal_library(created_by);

-- ============================================
-- Fuzzy Search Function
-- ============================================
CREATE OR REPLACE FUNCTION search_proposal_library(
    search_term TEXT,
    category_filter TEXT DEFAULT NULL,
    destination_filter TEXT DEFAULT NULL,
    limit_count INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    category TEXT,
    name TEXT,
    content JSONB,
    base_price DECIMAL,
    currency TEXT,
    tags TEXT[],
    supplier TEXT,
    destination TEXT,
    created_by UUID,
    is_shared BOOLEAN,
    usage_count INT,
    created_at TIMESTAMPTZ,
    similarity_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.category,
        l.name,
        l.content,
        l.base_price,
        l.currency,
        l.tags,
        l.supplier,
        l.destination,
        l.created_by,
        l.is_shared,
        l.usage_count,
        l.created_at,
        GREATEST(
            similarity(l.name, search_term),
            similarity(l.name_search, lower(unaccent(search_term)))
        ) AS similarity_score
    FROM proposal_library l
    WHERE 
        -- Must be shared OR owned by current user
        (l.is_shared = true OR l.created_by = auth.uid())
        -- Category filter
        AND (category_filter IS NULL OR l.category = category_filter)
        -- Destination filter
        AND (destination_filter IS NULL OR l.destination ILIKE '%' || destination_filter || '%')
        -- Search matching (fuzzy)
        AND (
            search_term IS NULL 
            OR search_term = ''
            OR l.name ILIKE '%' || search_term || '%'
            OR l.name_search ILIKE '%' || lower(unaccent(search_term)) || '%'
            OR similarity(l.name, search_term) > 0.2
            OR similarity(l.name_search, lower(unaccent(search_term))) > 0.2
        )
    ORDER BY 
        CASE WHEN search_term IS NOT NULL AND search_term != '' 
             THEN GREATEST(
                similarity(l.name, search_term),
                similarity(l.name_search, lower(unaccent(search_term)))
             )
             ELSE 0
        END DESC,
        l.usage_count DESC,
        l.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Increment usage count function
-- ============================================
CREATE OR REPLACE FUNCTION increment_library_usage(library_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE proposal_library 
    SET usage_count = usage_count + 1
    WHERE id = library_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE proposal_library ENABLE ROW LEVEL SECURITY;

-- Select: shared items OR own items
DROP POLICY IF EXISTS "Users can view shared or own library items" ON proposal_library;
CREATE POLICY "Users can view shared or own library items" ON proposal_library
    FOR SELECT TO authenticated 
    USING (is_shared = true OR created_by = auth.uid());

-- Insert: anyone authenticated
DROP POLICY IF EXISTS "Users can insert library items" ON proposal_library;
CREATE POLICY "Users can insert library items" ON proposal_library
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = created_by);

-- Update: only owner
DROP POLICY IF EXISTS "Users can update own library items" ON proposal_library;
CREATE POLICY "Users can update own library items" ON proposal_library
    FOR UPDATE TO authenticated 
    USING (created_by = auth.uid());

-- Delete: only owner
DROP POLICY IF EXISTS "Users can delete own library items" ON proposal_library;
CREATE POLICY "Users can delete own library items" ON proposal_library
    FOR DELETE TO authenticated 
    USING (created_by = auth.uid());

-- ============================================
-- Trigger for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_proposal_library_updated_at ON proposal_library;
CREATE TRIGGER update_proposal_library_updated_at
    BEFORE UPDATE ON proposal_library
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
