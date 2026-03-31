-- Migration: Add locked_fields column to cards table
-- Purpose: Allow users to lock individual fields from automatic updates via integrations (n8n/ActiveCampaign)

-- Add the locked_fields column
ALTER TABLE cards
ADD COLUMN IF NOT EXISTS locked_fields JSONB DEFAULT '{}'::jsonb;

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_cards_locked_fields
ON cards USING gin(locked_fields);

-- Add documentation comment
COMMENT ON COLUMN cards.locked_fields IS
'JSONB storing field lock states for integration updates.
Keys are field_keys (e.g., "destinos", "orcamento", "epoca_viagem"),
values are booleans (true = locked, field ignores automatic updates from integrations).
Example: {"destinos": true, "orcamento": false}
Fields not present in the object are considered unlocked (default behavior).';
