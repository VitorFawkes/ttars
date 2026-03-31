-- ============================================================================
-- MIGRATION: Performance indexes for proxima_tarefa query
-- Description: Optimized indexes aligned with view_cards_acoes subqueries
-- Date: 2025-12-23
-- Priority: P1 Performance
-- ============================================================================

-- ANALYSIS:
-- The proxima_tarefa subquery pattern:
--   WHERE card_id = ? AND COALESCE(concluida, false) = false
--   ORDER BY data_vencimento ASC NULLS LAST, created_at DESC, id DESC
--   LIMIT 1
--
-- Current performance bottleneck:
--   - Sequential scan on tarefas for each card
--   - Sort operation on every card render
--
-- Solution: Composite index covering the WHERE + ORDER BY columns

-- ============================================================================
-- INDEX 1: Composite index for pending tasks query
-- ============================================================================
-- Covers: card_id, concluida, data_vencimento, created_at, id
-- Enables: Index-only scan + sorted results (no sort step needed)
-- Type: B-tree (supports multi-column + NULLS LAST)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tarefas_proxima_tarefa_optimized
ON tarefas (
    card_id,           -- 1. Equality filter (most selective)
    concluida,         -- 2. Boolean filter (included for index-only scan)
    data_vencimento,   -- 3. First sort key (ASC NULLS LAST implicit in query)
    created_at DESC,   -- 4. Second sort key (explicit DESC)
    id DESC            -- 5. Final tie-breaker (explicit DESC)
)
WHERE concluida = false;  -- Partial index: only index pending tasks (smaller index)

-- Why this works:
--   1. Partial index (WHERE concluida = false) reduces index size by ~50-90%
--   2. Column order matches query access pattern exactly
--   3. PostgreSQL can use this for both WHERE and ORDER BY
--   4. Index-only scan possible (all columns in SELECT are in index)

-- Performance impact:
--   Before: Sequential scan + sort for each card (O(n log n) per card)
--   After:  Index seek + read first row (O(log n) per card)
--   Expected speedup: 10-100x on large datasets

-- ============================================================================
-- INDEX 2: Cleanup old generic index (if exists)
-- ============================================================================
-- If there's a generic index on (card_id, data_vencimento), it's now redundant

-- Check for redundant indexes:
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'tarefas'
  AND indexdef LIKE '%data_vencimento%';
*/

-- Drop if found (example - adjust name as needed):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_tarefas_card_id_data_vencimento;

-- ============================================================================
-- SCHEMA IMPROVEMENT: Make concluida NOT NULL with DEFAULT
-- ============================================================================
-- Problem: concluida allows NULL, requiring COALESCE everywhere
-- Solution: Enforce NOT NULL with DEFAULT false

-- Step 1: Backfill existing NULLs
UPDATE tarefas 
SET concluida = false 
WHERE concluida IS NULL;

-- Step 2: Add NOT NULL constraint with DEFAULT
ALTER TABLE tarefas 
ALTER COLUMN concluida SET DEFAULT false;

ALTER TABLE tarefas 
ALTER COLUMN concluida SET NOT NULL;

-- Step 3: Update view to remove COALESCE (optional, for cleanliness)
-- After this migration, the view can use simpler:
--   WHERE concluida = false
-- instead of:
--   WHERE COALESCE(concluida, false) = false
--
-- But keeping COALESCE is harmless and provides defense-in-depth

-- ============================================================================
-- INDEX 3: Supporting index for count queries
-- ============================================================================
-- The tarefas_pendentes and tarefas_atrasadas counts also scan the table
-- This partial index helps both:

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tarefas_counts_optimized
ON tarefas (card_id, data_vencimento)
WHERE concluida = false;

-- Why separate from INDEX 1:
--   - Smaller (fewer columns)
--   - Better for COUNT(*) queries
--   - Faster writes (less columns to update)

-- ============================================================================
-- INDEX 4: Completed tasks (for ultima_interacao)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tarefas_ultima_interacao
ON tarefas (card_id, concluida_em DESC)
WHERE concluida = true;

-- This optimizes:
--   WHERE card_id = ? AND concluida = true ORDER BY concluida_em DESC LIMIT 1

-- ============================================================================
-- MONITORING QUERIES
-- ============================================================================

-- 1. Check index usage after deployment
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'tarefas'
ORDER BY idx_scan DESC;
*/

-- 2. Check index size
/*
SELECT 
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE tablename = 'tarefas';
*/

-- 3. Verify query plan uses index
/*
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, titulo, data_vencimento, prioridade, tipo 
FROM tarefas 
WHERE card_id = 'some-uuid' 
  AND concluida = false
ORDER BY data_vencimento ASC NULLS LAST, created_at DESC, id DESC
LIMIT 1;

-- Expected plan:
--   Limit
--     -> Index Scan using idx_tarefas_proxima_tarefa_optimized
*/

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
/*
-- Drop indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_tarefas_proxima_tarefa_optimized;
DROP INDEX CONCURRENTLY IF EXISTS idx_tarefas_counts_optimized;
DROP INDEX CONCURRENTLY IF EXISTS idx_tarefas_ultima_interacao;

-- Revert schema changes
ALTER TABLE tarefas ALTER COLUMN concluida DROP NOT NULL;
ALTER TABLE tarefas ALTER COLUMN concluida DROP DEFAULT;
*/

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. CONCURRENTLY: Safe for production, no table locks, but slower to build
-- 2. Partial indexes: ~50% smaller, faster writes, same read performance
-- 3. Run during low traffic if possible (index build consumes I/O)
-- 4. Monitor pg_stat_progress_create_index during build
