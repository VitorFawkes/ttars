-- ============================================================================
-- MIGRATION: Fix view_cards_acoes Timeout
-- Problem: Missing composite index on activities table causes timeout
-- Root cause: Migration 20260202400000 changed ultima_interacao to use activities
--             but activities only has separate indexes, not composite
-- Solution: Create composite index (card_id, created_at DESC)
-- Date: 2026-02-03
-- ============================================================================

-- Create composite index for efficient subquery:
-- WHERE card_id = X ORDER BY created_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_activities_card_created_desc
ON activities(card_id, created_at DESC);

-- Update statistics
ANALYZE activities;
