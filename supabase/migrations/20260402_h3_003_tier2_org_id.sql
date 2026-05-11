-- H3-003: Add org_id to Tier 2 tables (pipeline-dependent, standalone config)
-- Tables: pipeline_stages, contatos, sections, card_tags, system_fields, section_field_config
--
-- ROLLBACK:
-- ALTER TABLE pipeline_stages DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE contatos DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE sections DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE card_tags DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE system_fields DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE section_field_config DROP COLUMN IF EXISTS org_id;

-- =============================================================================
-- PIPELINE_STAGES
-- =============================================================================
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE pipeline_stages SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE pipeline_stages ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org_id ON pipeline_stages(org_id);

-- Composite index for common query: stages by org + pipeline
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org_pipeline
  ON pipeline_stages(org_id, pipeline_id);

-- =============================================================================
-- CONTATOS
-- =============================================================================
ALTER TABLE contatos
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE contatos SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE contatos ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contatos_org_id ON contatos(org_id);

-- Email unico por org (antes era global)
-- unique_email is a CONSTRAINT, not an index — drop constraint first
ALTER TABLE contatos DROP CONSTRAINT IF EXISTS unique_email;
DROP INDEX IF EXISTS unique_email;
CREATE UNIQUE INDEX idx_contatos_org_email_unique
  ON contatos(org_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- CPF unico por org (antes era global)
ALTER TABLE contatos DROP CONSTRAINT IF EXISTS idx_contatos_cpf_normalizado_unique;
DROP INDEX IF EXISTS idx_contatos_cpf_normalizado_unique;
CREATE UNIQUE INDEX idx_contatos_org_cpf_unique
  ON contatos(org_id, cpf_normalizado)
  WHERE cpf_normalizado IS NOT NULL AND deleted_at IS NULL;

-- Telefone normalizado index por org
CREATE INDEX IF NOT EXISTS idx_contatos_org_telefone
  ON contatos(org_id, telefone_normalizado)
  WHERE telefone_normalizado IS NOT NULL;

-- =============================================================================
-- SECTIONS (ja tem coluna 'produto', adicionar org_id)
-- =============================================================================
ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE sections SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE sections ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sections_org_id ON sections(org_id);

-- =============================================================================
-- CARD_TAGS (ja tem coluna 'produto', adicionar org_id)
-- =============================================================================
ALTER TABLE card_tags
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE card_tags SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE card_tags ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_tags_org_id ON card_tags(org_id);

-- =============================================================================
-- SYSTEM_FIELDS
-- Nota: PK continua sendo 'key' para backward compat com FKs existentes.
-- org_id e adicionado para RLS e futuro scoping por org.
-- =============================================================================
ALTER TABLE system_fields
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE system_fields SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE system_fields ALTER COLUMN org_id SET NOT NULL;

-- Index para lookups org-scoped (PK permanece 'key' por ora)
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_fields_org_key
  ON system_fields(org_id, key);

-- =============================================================================
-- SECTION_FIELD_CONFIG
-- =============================================================================
ALTER TABLE section_field_config
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE section_field_config SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE section_field_config ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_section_field_config_org_id ON section_field_config(org_id);
