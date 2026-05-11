-- Migration: Create proposal_client_selections table
-- Safe to run multiple times (uses IF NOT EXISTS)
-- This table stores client selections when they accept a proposal

-- 1. Create table only if it doesn't exist
CREATE TABLE IF NOT EXISTS proposal_client_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL,
    version_id UUID,
    item_id UUID NOT NULL,
    selected_option_id UUID,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add unique constraint only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'proposal_client_selections_proposal_item_unique'
    ) THEN
        ALTER TABLE proposal_client_selections 
        ADD CONSTRAINT proposal_client_selections_proposal_item_unique 
        UNIQUE (proposal_id, item_id);
    END IF;
END $$;

-- 3. Add foreign keys only if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'proposal_client_selections_proposal_id_fkey'
    ) THEN
        ALTER TABLE proposal_client_selections 
        ADD CONSTRAINT proposal_client_selections_proposal_id_fkey 
        FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table proposals does not exist, skipping FK';
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'proposal_client_selections_version_id_fkey'
    ) THEN
        ALTER TABLE proposal_client_selections 
        ADD CONSTRAINT proposal_client_selections_version_id_fkey 
        FOREIGN KEY (version_id) REFERENCES proposal_versions(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table proposal_versions does not exist, skipping FK';
END $$;

-- 4. Add columns to proposals table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'proposals' AND column_name = 'accepted_at'
    ) THEN
        ALTER TABLE proposals ADD COLUMN accepted_at TIMESTAMPTZ;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'proposals' AND column_name = 'accepted_total'
    ) THEN
        ALTER TABLE proposals ADD COLUMN accepted_total DECIMAL(12,2);
    END IF;
END $$;

-- 5. Enable RLS
ALTER TABLE proposal_client_selections ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies (drop first if exists to avoid duplicates)
DROP POLICY IF EXISTS "Allow public insert" ON proposal_client_selections;
CREATE POLICY "Allow public insert" ON proposal_client_selections
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read" ON proposal_client_selections;
CREATE POLICY "Allow authenticated read" ON proposal_client_selections
    FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated update" ON proposal_client_selections;
CREATE POLICY "Allow authenticated update" ON proposal_client_selections
    FOR UPDATE
    USING (auth.role() = 'authenticated');

-- 7. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_proposal_client_selections_proposal 
    ON proposal_client_selections(proposal_id);

-- 8. Create updated_at trigger if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_proposal_client_selections_updated_at ON proposal_client_selections;
CREATE TRIGGER update_proposal_client_selections_updated_at
    BEFORE UPDATE ON proposal_client_selections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Done!
-- This migration is safe to run multiple times.
