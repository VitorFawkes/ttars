-- H3-005: Add org_id to card-child tables
-- Tables: tarefas, reunioes, proposals, arquivos, activities, historico_fases,
--         mensagens, cards_contatos, card_financial_items, card_team_members,
--         future_opportunities, notifications, text_blocks, card_creation_rules
--
-- Backfill org_id from parent card where applicable.
--
-- ROLLBACK:
-- ALTER TABLE tarefas DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE reunioes DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE proposals DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE arquivos DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE activities DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE historico_fases DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE mensagens DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE cards_contatos DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE card_financial_items DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE card_team_members DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE future_opportunities DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE notifications DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE text_blocks DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE card_creation_rules DROP COLUMN IF EXISTS org_id;

-- Helper: add org_id column, backfill from cards, set NOT NULL, create index
-- We repeat the pattern for each table since PL/pgSQL loops can't do DDL in Supabase migrations.

-- =============================================================================
-- TAREFAS
-- =============================================================================
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE tarefas t
SET org_id = c.org_id
FROM cards c
WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE tarefas SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE tarefas ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_org_id ON tarefas(org_id);

-- =============================================================================
-- REUNIOES
-- =============================================================================
ALTER TABLE reunioes
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE reunioes r
SET org_id = c.org_id
FROM cards c
WHERE r.card_id = c.id AND r.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE reunioes SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE reunioes ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reunioes_org_id ON reunioes(org_id);

-- =============================================================================
-- PROPOSALS
-- =============================================================================
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE proposals p
SET org_id = c.org_id
FROM cards c
WHERE p.card_id = c.id AND p.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE proposals SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE proposals ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_org_id ON proposals(org_id);

-- =============================================================================
-- ARQUIVOS (corrigindo RLS USING(true) mais adiante na migration de RLS)
-- =============================================================================
ALTER TABLE arquivos
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE arquivos a
SET org_id = c.org_id
FROM cards c
WHERE a.card_id = c.id AND a.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE arquivos SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE arquivos ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arquivos_org_id ON arquivos(org_id);

-- =============================================================================
-- ACTIVITIES
-- =============================================================================
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE activities a
SET org_id = c.org_id
FROM cards c
WHERE a.card_id = c.id AND a.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE activities SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE activities ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_org_id ON activities(org_id);

-- =============================================================================
-- HISTORICO_FASES
-- =============================================================================
ALTER TABLE historico_fases
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE historico_fases h
SET org_id = c.org_id
FROM cards c
WHERE h.card_id = c.id AND h.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE historico_fases SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE historico_fases ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_historico_fases_org_id ON historico_fases(org_id);

-- =============================================================================
-- MENSAGENS
-- =============================================================================
ALTER TABLE mensagens
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE mensagens m
SET org_id = c.org_id
FROM cards c
WHERE m.card_id = c.id AND m.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE mensagens SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE mensagens ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mensagens_org_id ON mensagens(org_id);

-- =============================================================================
-- CARDS_CONTATOS (junction table)
-- =============================================================================
ALTER TABLE cards_contatos
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE cards_contatos cc
SET org_id = c.org_id
FROM cards c
WHERE cc.card_id = c.id AND cc.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE cards_contatos SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE cards_contatos ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_contatos_org_id ON cards_contatos(org_id);

-- =============================================================================
-- CARD_FINANCIAL_ITEMS
-- =============================================================================
ALTER TABLE card_financial_items
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE card_financial_items cfi
SET org_id = c.org_id
FROM cards c
WHERE cfi.card_id = c.id AND cfi.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE card_financial_items SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE card_financial_items ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_financial_items_org_id ON card_financial_items(org_id);

-- =============================================================================
-- CARD_TEAM_MEMBERS
-- =============================================================================
ALTER TABLE card_team_members
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE card_team_members ctm
SET org_id = c.org_id
FROM cards c
WHERE ctm.card_id = c.id AND ctm.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE card_team_members SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE card_team_members ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_team_members_org_id ON card_team_members(org_id);

-- =============================================================================
-- FUTURE_OPPORTUNITIES
-- =============================================================================
ALTER TABLE future_opportunities
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE future_opportunities fo
SET org_id = c.org_id
FROM cards c
WHERE fo.source_card_id = c.id AND fo.org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE future_opportunities SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE future_opportunities ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_future_opportunities_org_id ON future_opportunities(org_id);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE notifications SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE notifications ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON notifications(org_id);

-- =============================================================================
-- TEXT_BLOCKS
-- =============================================================================
ALTER TABLE text_blocks
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE text_blocks SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE text_blocks ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_text_blocks_org_id ON text_blocks(org_id);

-- =============================================================================
-- CARD_CREATION_RULES
-- =============================================================================
ALTER TABLE card_creation_rules
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

UPDATE card_creation_rules SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE card_creation_rules ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_creation_rules_org_id ON card_creation_rules(org_id);
