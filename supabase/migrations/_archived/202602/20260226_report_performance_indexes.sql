-- ============================================
-- Performance indexes for Report Query Engine
-- Fixes missing indexes on cards table that cause
-- full table scans on date-range and owner filters
-- ============================================

-- Date range filtering (every report uses this)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_created_at
    ON cards(created_at) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_data_fechamento
    ON cards(data_fechamento) WHERE deleted_at IS NULL AND data_fechamento IS NOT NULL;

-- Status filtering (win/loss reports)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_status_comercial
    ON cards(status_comercial) WHERE deleted_at IS NULL;

-- Stage distribution reports
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_pipeline_stage
    ON cards(pipeline_stage_id) WHERE deleted_at IS NULL;

-- Per-consultant reports
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_dono_atual
    ON cards(dono_atual_id) WHERE deleted_at IS NULL;

-- Most common filter combo: produto + data criação
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_produto_created
    ON cards(produto, created_at) WHERE deleted_at IS NULL AND archived_at IS NULL;

-- Financial reports: won cards by close date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_won_fechamento
    ON cards(data_fechamento) WHERE deleted_at IS NULL AND status_comercial = 'ganho';
