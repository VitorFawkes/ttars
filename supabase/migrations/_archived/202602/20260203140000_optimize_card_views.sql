-- ============================================================================
-- MIGRATION: Optimization for Card Views (Fix 500 Timeout)
-- Description: Adds composite indexes to speed up subqueries in view_cards_acoes
-- Date: 2026-02-03
-- ============================================================================

BEGIN;

-- 1. Index for 'ultima_interacao' and 'tempo_sem_contato' subqueries
-- Prevents "Index Scan Backward" on the global timeline
CREATE INDEX IF NOT EXISTS idx_activities_card_created_at_desc 
ON activities(card_id, created_at DESC);

-- 2. Index for main view filtering (Product + Archive status)
-- Speeds up: WHERE produto = 'TRIPS' AND archived_at IS NULL
CREATE INDEX IF NOT EXISTS idx_cards_product_archived_filtered 
ON cards(produto, archived_at) 
WHERE deleted_at IS NULL;

-- 3. Analyze tables to update statistics immediately
ANALYZE activities;
ANALYZE cards;

COMMIT;
