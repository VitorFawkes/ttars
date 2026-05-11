-- H3-012: Add org_id to all remaining tables for multi-tenancy
-- Tables: 35 total across frontend, business logic, cadence, integration, and config categories
-- Pattern: ADD COLUMN → backfill → NOT NULL → INDEX → RLS policies
-- Each table wrapped in DO block for safety (table may not exist)

DO $$ BEGIN RAISE NOTICE 'H3-012: Starting org_id migration for remaining tables'; END $$;

----------------------------------------------------------------------
-- HELPER: Default org UUID
----------------------------------------------------------------------
-- a0000000-0000-0000-0000-000000000001

----------------------------------------------------------------------
-- 1. contato_meios — contact channels (FK: contato_id → contatos)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE contato_meios ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE contato_meios SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent contatos
  UPDATE contato_meios t SET org_id = c.org_id FROM contatos c WHERE t.contato_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE contato_meios ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'contato_meios does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_contato_meios_org_id ON contato_meios(org_id);

DO $$ BEGIN
  ALTER TABLE contato_meios ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "contato_meios_org_select" ON contato_meios;
  CREATE POLICY "contato_meios_org_select" ON contato_meios FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "contato_meios_org_all" ON contato_meios;
  CREATE POLICY "contato_meios_org_all" ON contato_meios FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "contato_meios_service_all" ON contato_meios;
  CREATE POLICY "contato_meios_service_all" ON contato_meios FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 2. pipeline_card_settings — kanban card display config
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE pipeline_card_settings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE pipeline_card_settings SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE pipeline_card_settings ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'pipeline_card_settings does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_pipeline_card_settings_org_id ON pipeline_card_settings(org_id);

DO $$ BEGIN
  ALTER TABLE pipeline_card_settings ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "pipeline_card_settings_org_select" ON pipeline_card_settings;
  CREATE POLICY "pipeline_card_settings_org_select" ON pipeline_card_settings FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "pipeline_card_settings_org_all" ON pipeline_card_settings;
  CREATE POLICY "pipeline_card_settings_org_all" ON pipeline_card_settings FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "pipeline_card_settings_service_all" ON pipeline_card_settings;
  CREATE POLICY "pipeline_card_settings_service_all" ON pipeline_card_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 3. card_owner_history — ownership tracking (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE card_owner_history ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE card_owner_history SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards
  UPDATE card_owner_history t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE card_owner_history ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'card_owner_history does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_card_owner_history_org_id ON card_owner_history(org_id);

DO $$ BEGIN
  ALTER TABLE card_owner_history ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "card_owner_history_org_select" ON card_owner_history;
  CREATE POLICY "card_owner_history_org_select" ON card_owner_history FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "card_owner_history_org_all" ON card_owner_history;
  CREATE POLICY "card_owner_history_org_all" ON card_owner_history FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "card_owner_history_service_all" ON card_owner_history;
  CREATE POLICY "card_owner_history_service_all" ON card_owner_history FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 4. product_requirements — product requirements per card (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE product_requirements ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE product_requirements SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards (if card_id exists)
  UPDATE product_requirements t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE product_requirements ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'product_requirements does not exist, skipping';
         WHEN undefined_column THEN RAISE NOTICE 'product_requirements.card_id does not exist, skipping backfill'; END $$;
CREATE INDEX IF NOT EXISTS idx_product_requirements_org_id ON product_requirements(org_id);

DO $$ BEGIN
  ALTER TABLE product_requirements ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "product_requirements_org_select" ON product_requirements;
  CREATE POLICY "product_requirements_org_select" ON product_requirements FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "product_requirements_org_all" ON product_requirements;
  CREATE POLICY "product_requirements_org_all" ON product_requirements FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "product_requirements_service_all" ON product_requirements;
  CREATE POLICY "product_requirements_service_all" ON product_requirements FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 5. proposal_events — proposal audit events (FK: proposal_id → proposals)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE proposal_events ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE proposal_events SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from proposals → cards
  UPDATE proposal_events t SET org_id = c.org_id
    FROM proposals p JOIN cards c ON p.card_id = c.id
    WHERE t.proposal_id = p.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE proposal_events ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'proposal_events does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_proposal_events_org_id ON proposal_events(org_id);

DO $$ BEGIN
  ALTER TABLE proposal_events ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "proposal_events_org_select" ON proposal_events;
  CREATE POLICY "proposal_events_org_select" ON proposal_events FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "proposal_events_org_all" ON proposal_events;
  CREATE POLICY "proposal_events_org_all" ON proposal_events FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "proposal_events_service_all" ON proposal_events;
  CREATE POLICY "proposal_events_service_all" ON proposal_events FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 6. proposal_versions — proposal versions (FK: proposal_id → proposals)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE proposal_versions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE proposal_versions SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from proposals → cards
  UPDATE proposal_versions t SET org_id = c.org_id
    FROM proposals p JOIN cards c ON p.card_id = c.id
    WHERE t.proposal_id = p.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE proposal_versions ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'proposal_versions does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_proposal_versions_org_id ON proposal_versions(org_id);

DO $$ BEGIN
  ALTER TABLE proposal_versions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "proposal_versions_org_select" ON proposal_versions;
  CREATE POLICY "proposal_versions_org_select" ON proposal_versions FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "proposal_versions_org_all" ON proposal_versions;
  CREATE POLICY "proposal_versions_org_all" ON proposal_versions FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "proposal_versions_service_all" ON proposal_versions;
  CREATE POLICY "proposal_versions_service_all" ON proposal_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 7. proposal_sections — proposal sections (FK: version_id → proposal_versions)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE proposal_sections ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE proposal_sections SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from proposal_versions → proposals → cards
  UPDATE proposal_sections t SET org_id = c.org_id
    FROM proposal_versions v
    JOIN proposals p ON v.proposal_id = p.id
    JOIN cards c ON p.card_id = c.id
    WHERE t.version_id = v.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE proposal_sections ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'proposal_sections does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_proposal_sections_org_id ON proposal_sections(org_id);

DO $$ BEGIN
  ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "proposal_sections_org_select" ON proposal_sections;
  CREATE POLICY "proposal_sections_org_select" ON proposal_sections FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "proposal_sections_org_all" ON proposal_sections;
  CREATE POLICY "proposal_sections_org_all" ON proposal_sections FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "proposal_sections_service_all" ON proposal_sections;
  CREATE POLICY "proposal_sections_service_all" ON proposal_sections FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 8. proposal_items — proposal items (FK: section_id → proposal_sections)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE proposal_items SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from proposal_sections → proposal_versions → proposals → cards
  UPDATE proposal_items t SET org_id = c.org_id
    FROM proposal_sections s
    JOIN proposal_versions v ON s.version_id = v.id
    JOIN proposals p ON v.proposal_id = p.id
    JOIN cards c ON p.card_id = c.id
    WHERE t.section_id = s.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE proposal_items ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'proposal_items does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_proposal_items_org_id ON proposal_items(org_id);

DO $$ BEGIN
  ALTER TABLE proposal_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "proposal_items_org_select" ON proposal_items;
  CREATE POLICY "proposal_items_org_select" ON proposal_items FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "proposal_items_org_all" ON proposal_items;
  CREATE POLICY "proposal_items_org_all" ON proposal_items FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "proposal_items_service_all" ON proposal_items;
  CREATE POLICY "proposal_items_service_all" ON proposal_items FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 9. stage_field_config — field config per stage (admin studio)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE stage_field_config ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE stage_field_config SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE stage_field_config ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'stage_field_config does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_stage_field_config_org_id ON stage_field_config(org_id);

DO $$ BEGIN
  ALTER TABLE stage_field_config ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "stage_field_config_org_select" ON stage_field_config;
  CREATE POLICY "stage_field_config_org_select" ON stage_field_config FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "stage_field_config_org_all" ON stage_field_config;
  CREATE POLICY "stage_field_config_org_all" ON stage_field_config FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "stage_field_config_service_all" ON stage_field_config;
  CREATE POLICY "stage_field_config_service_all" ON stage_field_config FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 10. stage_section_config — section config per stage
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE stage_section_config ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE stage_section_config SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE stage_section_config ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'stage_section_config does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_stage_section_config_org_id ON stage_section_config(org_id);

DO $$ BEGIN
  ALTER TABLE stage_section_config ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "stage_section_config_org_select" ON stage_section_config;
  CREATE POLICY "stage_section_config_org_select" ON stage_section_config FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "stage_section_config_org_all" ON stage_section_config;
  CREATE POLICY "stage_section_config_org_all" ON stage_section_config FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "stage_section_config_service_all" ON stage_section_config;
  CREATE POLICY "stage_section_config_service_all" ON stage_section_config FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 11. card_tag_assignments — card-tag junction (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE card_tag_assignments ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE card_tag_assignments SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards
  UPDATE card_tag_assignments t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE card_tag_assignments ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'card_tag_assignments does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_card_tag_assignments_org_id ON card_tag_assignments(org_id);

DO $$ BEGIN
  ALTER TABLE card_tag_assignments ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "card_tag_assignments_org_select" ON card_tag_assignments;
  CREATE POLICY "card_tag_assignments_org_select" ON card_tag_assignments FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "card_tag_assignments_org_all" ON card_tag_assignments;
  CREATE POLICY "card_tag_assignments_org_all" ON card_tag_assignments FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "card_tag_assignments_service_all" ON card_tag_assignments;
  CREATE POLICY "card_tag_assignments_service_all" ON card_tag_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 12. automation_rules — automation rules
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE automation_rules SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE automation_rules ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'automation_rules does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_automation_rules_org_id ON automation_rules(org_id);

DO $$ BEGIN
  ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "automation_rules_org_select" ON automation_rules;
  CREATE POLICY "automation_rules_org_select" ON automation_rules FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "automation_rules_org_all" ON automation_rules;
  CREATE POLICY "automation_rules_org_all" ON automation_rules FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "automation_rules_service_all" ON automation_rules;
  CREATE POLICY "automation_rules_service_all" ON automation_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 13. automation_log — automation audit (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE automation_log ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE automation_log SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards (if card_id exists)
  BEGIN
    UPDATE automation_log t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  ALTER TABLE automation_log ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'automation_log does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_automation_log_org_id ON automation_log(org_id);

DO $$ BEGIN
  ALTER TABLE automation_log ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "automation_log_org_select" ON automation_log;
  CREATE POLICY "automation_log_org_select" ON automation_log FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "automation_log_org_all" ON automation_log;
  CREATE POLICY "automation_log_org_all" ON automation_log FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "automation_log_service_all" ON automation_log;
  CREATE POLICY "automation_log_service_all" ON automation_log FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 14. phase_visibility_rules — phase visibility config
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE phase_visibility_rules ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE phase_visibility_rules SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE phase_visibility_rules ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'phase_visibility_rules does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_phase_visibility_rules_org_id ON phase_visibility_rules(org_id);

DO $$ BEGIN
  ALTER TABLE phase_visibility_rules ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "phase_visibility_rules_org_select" ON phase_visibility_rules;
  CREATE POLICY "phase_visibility_rules_org_select" ON phase_visibility_rules FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "phase_visibility_rules_org_all" ON phase_visibility_rules;
  CREATE POLICY "phase_visibility_rules_org_all" ON phase_visibility_rules FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "phase_visibility_rules_service_all" ON phase_visibility_rules;
  CREATE POLICY "phase_visibility_rules_service_all" ON phase_visibility_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 15. stage_transitions — stage transition rules
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE stage_transitions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE stage_transitions SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE stage_transitions ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'stage_transitions does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_stage_transitions_org_id ON stage_transitions(org_id);

DO $$ BEGIN
  ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "stage_transitions_org_select" ON stage_transitions;
  CREATE POLICY "stage_transitions_org_select" ON stage_transitions FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "stage_transitions_org_all" ON stage_transitions;
  CREATE POLICY "stage_transitions_org_all" ON stage_transitions FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "stage_transitions_service_all" ON stage_transitions;
  CREATE POLICY "stage_transitions_service_all" ON stage_transitions FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 16. card_document_requirements — document requirements (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE card_document_requirements ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE card_document_requirements SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards
  UPDATE card_document_requirements t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE card_document_requirements ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'card_document_requirements does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_card_document_requirements_org_id ON card_document_requirements(org_id);

DO $$ BEGIN
  ALTER TABLE card_document_requirements ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "card_document_requirements_org_select" ON card_document_requirements;
  CREATE POLICY "card_document_requirements_org_select" ON card_document_requirements FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "card_document_requirements_org_all" ON card_document_requirements;
  CREATE POLICY "card_document_requirements_org_all" ON card_document_requirements FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "card_document_requirements_service_all" ON card_document_requirements;
  CREATE POLICY "card_document_requirements_service_all" ON card_document_requirements FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 17. whatsapp_messages — WhatsApp messages (FK: card_id → cards, nullable)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE whatsapp_messages SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards where card_id is not null
  UPDATE whatsapp_messages t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.card_id IS NOT NULL AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  -- Also backfill from contatos via contact_id
  UPDATE whatsapp_messages t SET org_id = ct.org_id FROM contatos ct WHERE t.contact_id = ct.id AND t.contact_id IS NOT NULL AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE whatsapp_messages ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'whatsapp_messages does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org_id ON whatsapp_messages(org_id);

DO $$ BEGIN
  ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "whatsapp_messages_org_select" ON whatsapp_messages;
  CREATE POLICY "whatsapp_messages_org_select" ON whatsapp_messages FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "whatsapp_messages_org_all" ON whatsapp_messages;
  CREATE POLICY "whatsapp_messages_org_all" ON whatsapp_messages FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "whatsapp_messages_service_all" ON whatsapp_messages;
  CREATE POLICY "whatsapp_messages_service_all" ON whatsapp_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 18. whatsapp_conversations — WhatsApp conversations (FK: contact_id → contatos)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE whatsapp_conversations SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from contatos
  UPDATE whatsapp_conversations t SET org_id = ct.org_id FROM contatos ct WHERE t.contact_id = ct.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE whatsapp_conversations ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'whatsapp_conversations does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_org_id ON whatsapp_conversations(org_id);

DO $$ BEGIN
  ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "whatsapp_conversations_org_select" ON whatsapp_conversations;
  CREATE POLICY "whatsapp_conversations_org_select" ON whatsapp_conversations FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "whatsapp_conversations_org_all" ON whatsapp_conversations;
  CREATE POLICY "whatsapp_conversations_org_all" ON whatsapp_conversations FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "whatsapp_conversations_service_all" ON whatsapp_conversations;
  CREATE POLICY "whatsapp_conversations_service_all" ON whatsapp_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 19. whatsapp_raw_events — raw WhatsApp events (FK: card_id → cards, nullable)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE whatsapp_raw_events ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE whatsapp_raw_events SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards where card_id is not null
  UPDATE whatsapp_raw_events t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.card_id IS NOT NULL AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  -- Also backfill from contatos via contact_id
  UPDATE whatsapp_raw_events t SET org_id = ct.org_id FROM contatos ct WHERE t.contact_id = ct.id AND t.contact_id IS NOT NULL AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE whatsapp_raw_events ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'whatsapp_raw_events does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_whatsapp_raw_events_org_id ON whatsapp_raw_events(org_id);

DO $$ BEGIN
  ALTER TABLE whatsapp_raw_events ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "whatsapp_raw_events_org_select" ON whatsapp_raw_events;
  CREATE POLICY "whatsapp_raw_events_org_select" ON whatsapp_raw_events FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "whatsapp_raw_events_org_all" ON whatsapp_raw_events;
  CREATE POLICY "whatsapp_raw_events_org_all" ON whatsapp_raw_events FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "whatsapp_raw_events_service_all" ON whatsapp_raw_events;
  CREATE POLICY "whatsapp_raw_events_service_all" ON whatsapp_raw_events FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 20. whatsapp_groups — WhatsApp group data
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE whatsapp_groups SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE whatsapp_groups ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'whatsapp_groups does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_org_id ON whatsapp_groups(org_id);

DO $$ BEGIN
  ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "whatsapp_groups_org_select" ON whatsapp_groups;
  CREATE POLICY "whatsapp_groups_org_select" ON whatsapp_groups FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "whatsapp_groups_org_all" ON whatsapp_groups;
  CREATE POLICY "whatsapp_groups_org_all" ON whatsapp_groups FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "whatsapp_groups_service_all" ON whatsapp_groups;
  CREATE POLICY "whatsapp_groups_service_all" ON whatsapp_groups FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 21. cadence_templates — cadence templates
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE cadence_templates ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE cadence_templates SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE cadence_templates ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'cadence_templates does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_cadence_templates_org_id ON cadence_templates(org_id);

DO $$ BEGIN
  ALTER TABLE cadence_templates ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "cadence_templates_org_select" ON cadence_templates;
  CREATE POLICY "cadence_templates_org_select" ON cadence_templates FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_templates_org_all" ON cadence_templates;
  CREATE POLICY "cadence_templates_org_all" ON cadence_templates FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_templates_service_all" ON cadence_templates;
  CREATE POLICY "cadence_templates_service_all" ON cadence_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 22. cadence_steps — cadence steps
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE cadence_steps ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE cadence_steps SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE cadence_steps ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'cadence_steps does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_cadence_steps_org_id ON cadence_steps(org_id);

DO $$ BEGIN
  ALTER TABLE cadence_steps ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "cadence_steps_org_select" ON cadence_steps;
  CREATE POLICY "cadence_steps_org_select" ON cadence_steps FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_steps_org_all" ON cadence_steps;
  CREATE POLICY "cadence_steps_org_all" ON cadence_steps FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_steps_service_all" ON cadence_steps;
  CREATE POLICY "cadence_steps_service_all" ON cadence_steps FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 23. cadence_instances — cadence instances (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE cadence_instances ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE cadence_instances SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards
  UPDATE cadence_instances t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE cadence_instances ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'cadence_instances does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_cadence_instances_org_id ON cadence_instances(org_id);

DO $$ BEGIN
  ALTER TABLE cadence_instances ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "cadence_instances_org_select" ON cadence_instances;
  CREATE POLICY "cadence_instances_org_select" ON cadence_instances FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_instances_org_all" ON cadence_instances;
  CREATE POLICY "cadence_instances_org_all" ON cadence_instances FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_instances_service_all" ON cadence_instances;
  CREATE POLICY "cadence_instances_service_all" ON cadence_instances FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 24. cadence_event_log — cadence events (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE cadence_event_log ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE cadence_event_log SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards
  UPDATE cadence_event_log t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE cadence_event_log ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'cadence_event_log does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_cadence_event_log_org_id ON cadence_event_log(org_id);

DO $$ BEGIN
  ALTER TABLE cadence_event_log ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "cadence_event_log_org_select" ON cadence_event_log;
  CREATE POLICY "cadence_event_log_org_select" ON cadence_event_log FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_event_log_org_all" ON cadence_event_log;
  CREATE POLICY "cadence_event_log_org_all" ON cadence_event_log FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_event_log_service_all" ON cadence_event_log;
  CREATE POLICY "cadence_event_log_service_all" ON cadence_event_log FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 25. cadence_entry_queue — cadence queue (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE cadence_entry_queue ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE cadence_entry_queue SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards
  UPDATE cadence_entry_queue t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE cadence_entry_queue ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'cadence_entry_queue does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_cadence_entry_queue_org_id ON cadence_entry_queue(org_id);

DO $$ BEGIN
  ALTER TABLE cadence_entry_queue ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "cadence_entry_queue_org_select" ON cadence_entry_queue;
  CREATE POLICY "cadence_entry_queue_org_select" ON cadence_entry_queue FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_entry_queue_org_all" ON cadence_entry_queue;
  CREATE POLICY "cadence_entry_queue_org_all" ON cadence_entry_queue FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "cadence_entry_queue_service_all" ON cadence_entry_queue;
  CREATE POLICY "cadence_entry_queue_service_all" ON cadence_entry_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 26. integration_stage_map — stage mapping
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE integration_stage_map ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE integration_stage_map SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE integration_stage_map ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'integration_stage_map does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_integration_stage_map_org_id ON integration_stage_map(org_id);

DO $$ BEGIN
  ALTER TABLE integration_stage_map ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "integration_stage_map_org_select" ON integration_stage_map;
  CREATE POLICY "integration_stage_map_org_select" ON integration_stage_map FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_stage_map_org_all" ON integration_stage_map;
  CREATE POLICY "integration_stage_map_org_all" ON integration_stage_map FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_stage_map_service_all" ON integration_stage_map;
  CREATE POLICY "integration_stage_map_service_all" ON integration_stage_map FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 27. integration_field_map — field mapping
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE integration_field_map ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE integration_field_map SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE integration_field_map ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'integration_field_map does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_integration_field_map_org_id ON integration_field_map(org_id);

DO $$ BEGIN
  ALTER TABLE integration_field_map ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "integration_field_map_org_select" ON integration_field_map;
  CREATE POLICY "integration_field_map_org_select" ON integration_field_map FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_field_map_org_all" ON integration_field_map;
  CREATE POLICY "integration_field_map_org_all" ON integration_field_map FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_field_map_service_all" ON integration_field_map;
  CREATE POLICY "integration_field_map_service_all" ON integration_field_map FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 28. integration_inbound_triggers — inbound triggers
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE integration_inbound_triggers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE integration_inbound_triggers SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE integration_inbound_triggers ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'integration_inbound_triggers does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_integration_inbound_triggers_org_id ON integration_inbound_triggers(org_id);

DO $$ BEGIN
  ALTER TABLE integration_inbound_triggers ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "integration_inbound_triggers_org_select" ON integration_inbound_triggers;
  CREATE POLICY "integration_inbound_triggers_org_select" ON integration_inbound_triggers FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_inbound_triggers_org_all" ON integration_inbound_triggers;
  CREATE POLICY "integration_inbound_triggers_org_all" ON integration_inbound_triggers FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_inbound_triggers_service_all" ON integration_inbound_triggers;
  CREATE POLICY "integration_inbound_triggers_service_all" ON integration_inbound_triggers FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 29. integration_outbound_triggers — outbound triggers
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE integration_outbound_triggers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE integration_outbound_triggers SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE integration_outbound_triggers ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'integration_outbound_triggers does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_integration_outbound_triggers_org_id ON integration_outbound_triggers(org_id);

DO $$ BEGIN
  ALTER TABLE integration_outbound_triggers ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "integration_outbound_triggers_org_select" ON integration_outbound_triggers;
  CREATE POLICY "integration_outbound_triggers_org_select" ON integration_outbound_triggers FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_outbound_triggers_org_all" ON integration_outbound_triggers;
  CREATE POLICY "integration_outbound_triggers_org_all" ON integration_outbound_triggers FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_outbound_triggers_service_all" ON integration_outbound_triggers;
  CREATE POLICY "integration_outbound_triggers_service_all" ON integration_outbound_triggers FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 30. integration_outbound_queue — outbound queue (FK: card_id → cards)
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE integration_outbound_queue ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE integration_outbound_queue SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  -- Backfill from parent cards
  UPDATE integration_outbound_queue t SET org_id = c.org_id FROM cards c WHERE t.card_id = c.id AND t.org_id = 'a0000000-0000-0000-0000-000000000001';
  ALTER TABLE integration_outbound_queue ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'integration_outbound_queue does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_integration_outbound_queue_org_id ON integration_outbound_queue(org_id);

DO $$ BEGIN
  ALTER TABLE integration_outbound_queue ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "integration_outbound_queue_org_select" ON integration_outbound_queue;
  CREATE POLICY "integration_outbound_queue_org_select" ON integration_outbound_queue FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_outbound_queue_org_all" ON integration_outbound_queue;
  CREATE POLICY "integration_outbound_queue_org_all" ON integration_outbound_queue FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "integration_outbound_queue_service_all" ON integration_outbound_queue;
  CREATE POLICY "integration_outbound_queue_service_all" ON integration_outbound_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 31. api_keys — CRITICAL for multi-tenancy
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE api_keys SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE api_keys ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'api_keys does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id);

DO $$ BEGIN
  ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "api_keys_org_select" ON api_keys;
  CREATE POLICY "api_keys_org_select" ON api_keys FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "api_keys_org_all" ON api_keys;
  CREATE POLICY "api_keys_org_all" ON api_keys FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "api_keys_service_all" ON api_keys;
  CREATE POLICY "api_keys_service_all" ON api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 32. notification_type_config — notification config
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE notification_type_config ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE notification_type_config SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE notification_type_config ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'notification_type_config does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_notification_type_config_org_id ON notification_type_config(org_id);

DO $$ BEGIN
  ALTER TABLE notification_type_config ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "notification_type_config_org_select" ON notification_type_config;
  CREATE POLICY "notification_type_config_org_select" ON notification_type_config FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "notification_type_config_org_all" ON notification_type_config;
  CREATE POLICY "notification_type_config_org_all" ON notification_type_config FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "notification_type_config_service_all" ON notification_type_config;
  CREATE POLICY "notification_type_config_service_all" ON notification_type_config FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 33. push_notification_preferences — push preferences
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE push_notification_preferences ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE push_notification_preferences SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE push_notification_preferences ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'push_notification_preferences does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_push_notification_preferences_org_id ON push_notification_preferences(org_id);

DO $$ BEGIN
  ALTER TABLE push_notification_preferences ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "push_notification_preferences_org_select" ON push_notification_preferences;
  CREATE POLICY "push_notification_preferences_org_select" ON push_notification_preferences FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "push_notification_preferences_org_all" ON push_notification_preferences;
  CREATE POLICY "push_notification_preferences_org_all" ON push_notification_preferences FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "push_notification_preferences_service_all" ON push_notification_preferences;
  CREATE POLICY "push_notification_preferences_service_all" ON push_notification_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 34. push_subscriptions — push subscriptions
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE push_subscriptions SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE push_subscriptions ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'push_subscriptions does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_org_id ON push_subscriptions(org_id);

DO $$ BEGIN
  ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "push_subscriptions_org_select" ON push_subscriptions;
  CREATE POLICY "push_subscriptions_org_select" ON push_subscriptions FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "push_subscriptions_org_all" ON push_subscriptions;
  CREATE POLICY "push_subscriptions_org_all" ON push_subscriptions FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "push_subscriptions_service_all" ON push_subscriptions;
  CREATE POLICY "push_subscriptions_service_all" ON push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- 35. destinations — travel destinations
----------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE destinations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001';
  UPDATE destinations SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  ALTER TABLE destinations ALTER COLUMN org_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'destinations does not exist, skipping'; END $$;
CREATE INDEX IF NOT EXISTS idx_destinations_org_id ON destinations(org_id);

DO $$ BEGIN
  ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "destinations_org_select" ON destinations;
  CREATE POLICY "destinations_org_select" ON destinations FOR SELECT TO authenticated USING (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "destinations_org_all" ON destinations;
  CREATE POLICY "destinations_org_all" ON destinations FOR ALL TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  DROP POLICY IF EXISTS "destinations_service_all" ON destinations;
  CREATE POLICY "destinations_service_all" ON destinations FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

----------------------------------------------------------------------
-- DONE
----------------------------------------------------------------------
DO $$ BEGIN RAISE NOTICE 'H3-012: Completed org_id migration for 35 remaining tables'; END $$;
