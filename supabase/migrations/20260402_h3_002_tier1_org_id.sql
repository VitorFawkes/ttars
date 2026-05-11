-- H3-002: Add org_id to Tier 1 tables (foundational, no card dependency)
-- Tables: departments, teams, pipeline_phases, pipelines, motivos_perda, invitations, roles
--
-- ROLLBACK:
-- ALTER TABLE departments DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE teams DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE pipeline_phases DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE pipelines DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE motivos_perda DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE motivos_perda DROP COLUMN IF EXISTS produto;
-- ALTER TABLE invitations DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE roles DROP COLUMN IF EXISTS org_id;

-- =============================================================================
-- DEPARTMENTS
-- =============================================================================
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE departments SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE departments ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_departments_org_id ON departments(org_id);

-- Unique constraint: name e slug devem ser unicos POR org
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_name_key;
ALTER TABLE departments ADD CONSTRAINT departments_org_name_key UNIQUE(org_id, name);
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_slug_key;
ALTER TABLE departments ADD CONSTRAINT departments_org_slug_key UNIQUE(org_id, slug);

-- =============================================================================
-- TEAMS
-- =============================================================================
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE teams SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE teams ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_teams_org_id ON teams(org_id);

-- =============================================================================
-- PIPELINE_PHASES
-- =============================================================================
ALTER TABLE pipeline_phases
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE pipeline_phases SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE pipeline_phases ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_phases_org_id ON pipeline_phases(org_id);

-- slug unico por org (antes era global)
ALTER TABLE pipeline_phases DROP CONSTRAINT IF EXISTS pipeline_phases_slug_key;
ALTER TABLE pipeline_phases ADD CONSTRAINT pipeline_phases_org_slug_key UNIQUE(org_id, slug);

-- =============================================================================
-- PIPELINES
-- =============================================================================
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE pipelines SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE pipelines ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipelines_org_id ON pipelines(org_id);

-- produto unico por org (antes era global: 1 pipeline por produto no mundo todo)
ALTER TABLE pipelines DROP CONSTRAINT IF EXISTS pipelines_produto_key;
ALTER TABLE pipelines ADD CONSTRAINT pipelines_org_produto_key UNIQUE(org_id, produto);

-- =============================================================================
-- MOTIVOS_PERDA (+ coluna produto para scoping per-product)
-- =============================================================================
ALTER TABLE motivos_perda
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE motivos_perda SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE motivos_perda ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_motivos_perda_org_id ON motivos_perda(org_id);

-- Coluna produto: NULL = todos os produtos da org
ALTER TABLE motivos_perda
  ADD COLUMN IF NOT EXISTS produto TEXT DEFAULT NULL;

-- =============================================================================
-- INVITATIONS
-- =============================================================================
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE invitations SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE invitations ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON invitations(org_id);

-- =============================================================================
-- ROLES
-- =============================================================================
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE roles SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE roles ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_org_id ON roles(org_id);
