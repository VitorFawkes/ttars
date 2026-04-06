-- H3-022: Corrigir índices UNIQUE globais que deveriam ser org-scoped
--
-- Problema: várias tabelas org-scoped têm UNIQUE indexes em colunas (slug, sku, etc)
-- sem incluir org_id, impedindo que múltiplas orgs tenham os mesmos valores.
--
-- Tabelas afetadas (auditadas via pg_indexes):
--   1. pipeline_phases.slug — DROP (já existe pipeline_phases_org_slug_key)
--   2. card_tags (name, produto) — incluir org_id
--   3. document_types.slug — incluir org_id
--   4. inventory_products.sku — incluir org_id
--   5. pipeline_stages.milestone_key — incluir org_id
--
-- Resultado: cada org pode ter seus próprios slugs/skus sem colidir com outras orgs.

-- =============================================================================
-- 1. pipeline_phases.slug — drop constraint/índice global redundante
-- =============================================================================
ALTER TABLE pipeline_phases DROP CONSTRAINT IF EXISTS pipeline_phases_slug_key;
DROP INDEX IF EXISTS pipeline_phases_slug_key;
-- pipeline_phases_org_slug_key (org_id, slug) já existe — não precisa criar

-- =============================================================================
-- 2. card_tags (name, produto) → (org_id, name, produto)
-- =============================================================================
ALTER TABLE card_tags DROP CONSTRAINT IF EXISTS card_tags_name_produto_unique;
DROP INDEX IF EXISTS card_tags_name_produto_unique;
CREATE UNIQUE INDEX IF NOT EXISTS card_tags_org_name_produto_unique
    ON card_tags(org_id, name, produto);

-- =============================================================================
-- 3. document_types.slug → (org_id, slug)
-- =============================================================================
ALTER TABLE document_types DROP CONSTRAINT IF EXISTS document_types_slug_key;
DROP INDEX IF EXISTS document_types_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS document_types_org_slug_key
    ON document_types(org_id, slug);

-- =============================================================================
-- 4. inventory_products.sku → (org_id, sku) — apenas onde sku não é null
-- =============================================================================
ALTER TABLE inventory_products DROP CONSTRAINT IF EXISTS idx_inventory_products_sku;
DROP INDEX IF EXISTS idx_inventory_products_sku;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_products_org_sku
    ON inventory_products(org_id, sku)
    WHERE sku IS NOT NULL;

-- =============================================================================
-- 5. pipeline_stages.milestone_key → (org_id, pipeline_id, milestone_key)
-- =============================================================================
ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS idx_pipeline_stages_milestone_key_unique;
DROP INDEX IF EXISTS idx_pipeline_stages_milestone_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_org_milestone_key_unique
    ON pipeline_stages(org_id, pipeline_id, milestone_key)
    WHERE milestone_key IS NOT NULL AND ativo = true;
