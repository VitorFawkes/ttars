-- H3-004: Add org_id to cards (the core entity)
-- This is the most critical migration — cards has 30+ triggers and is the center of the system.
--
-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_cards_org_id;
-- DROP INDEX IF EXISTS idx_cards_org_produto;
-- DROP INDEX IF EXISTS idx_cards_org_pipeline_stage;
-- DROP INDEX IF EXISTS idx_cards_org_status;
-- ALTER TABLE cards DROP COLUMN IF EXISTS org_id;

-- =============================================================================
-- CARDS — Add org_id
-- =============================================================================

-- Step 1: Add column (instant in PG12+, no table rewrite due to DEFAULT)
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

-- Step 2: Backfill all existing rows
UPDATE cards SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- Step 3: Set NOT NULL
ALTER TABLE cards ALTER COLUMN org_id SET NOT NULL;

-- Step 4: Indexes for RLS performance and common query patterns
CREATE INDEX IF NOT EXISTS idx_cards_org_id
  ON cards(org_id);

CREATE INDEX IF NOT EXISTS idx_cards_org_produto
  ON cards(org_id, produto);

CREATE INDEX IF NOT EXISTS idx_cards_org_pipeline_stage
  ON cards(org_id, pipeline_stage_id);

CREATE INDEX IF NOT EXISTS idx_cards_org_status
  ON cards(org_id, status_comercial)
  WHERE deleted_at IS NULL;

-- Composite index para o filtro mais comum: org + produto + ativo + nao deletado
CREATE INDEX IF NOT EXISTS idx_cards_org_produto_active
  ON cards(org_id, produto, pipeline_stage_id)
  WHERE deleted_at IS NULL AND status_comercial = 'aberto';
