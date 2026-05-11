-- Create proposal_status enum if not exists
DO $$ BEGIN
    CREATE TYPE proposal_status AS ENUM ('draft', 'sent', 'viewed', 'in_progress', 'accepted', 'rejected', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Alter existing proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS active_version_id UUID;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_version_id UUID;

-- Handle status column migration
-- First, ensure existing values are compatible (they seem to be: draft, sent)
-- Then alter type
DO $$ BEGIN
    ALTER TABLE proposals ALTER COLUMN status TYPE proposal_status USING status::proposal_status;
    ALTER TABLE proposals ALTER COLUMN status SET DEFAULT 'draft';
EXCEPTION
    WHEN OTHERS THEN null; -- Ignore if already converted or incompatible (should be compatible)
END $$;

-- Create proposal_versions table
CREATE TABLE IF NOT EXISTS proposal_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID NOT NULL REFERENCES profiles(id),
    change_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add FKs
DO $$ BEGIN
    ALTER TABLE proposals 
    ADD CONSTRAINT fk_proposals_active_version 
    FOREIGN KEY (active_version_id) 
    REFERENCES proposal_versions(id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE proposals
    ADD CONSTRAINT fk_proposals_accepted_version
    FOREIGN KEY (accepted_version_id)
    REFERENCES proposal_versions(id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposals_card_id ON proposals(card_id);
CREATE INDEX IF NOT EXISTS idx_proposals_public_token ON proposals(public_token);
CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal_id ON proposal_versions(proposal_id);

-- RLS Policies
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_versions ENABLE ROW LEVEL SECURITY;

-- Proposals Policies
DROP POLICY IF EXISTS "Users can view proposals" ON proposals;
CREATE POLICY "Users can view proposals" ON proposals
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert proposals" ON proposals;
CREATE POLICY "Users can insert proposals" ON proposals
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update proposals" ON proposals;
CREATE POLICY "Users can update proposals" ON proposals
    FOR UPDATE TO authenticated USING (true);

-- Proposal Versions Policies
DROP POLICY IF EXISTS "Users can view proposal versions" ON proposal_versions;
CREATE POLICY "Users can view proposal versions" ON proposal_versions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert proposal versions" ON proposal_versions;
CREATE POLICY "Users can insert proposal versions" ON proposal_versions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_proposals_updated_at ON proposals;
CREATE TRIGGER update_proposals_updated_at
    BEFORE UPDATE ON proposals
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
