-- Fase B do plano de isolamento por workspace
-- Adiciona org_id às tabelas que vazavam (policy USING(true)) e NÃO tinham
-- coluna org_id. Backfill via FK com pai que já tem org_id.
-- Depois: cria policies *_org_all/*_service_all e remove as USING(true) antigas.
--
-- Para cada tabela: ADD COLUMN nullable → backfill → NOT NULL → DEFAULT → policies.

SET search_path = public;

-- ============================================================
-- 0. Fix trigger pré-existente que quebra UPDATEs em stage_fields_settings
-- Função tinha search_path='' mas usava audit_logs sem qualificar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_stage_fields_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID;
  v_record_id UUID;
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  v_actor := COALESCE(
    auth.uid(),
    CASE WHEN TG_OP = 'DELETE' THEN OLD.updated_by ELSE NEW.updated_by END
  );
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id; v_old_data := to_jsonb(OLD); v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id; v_old_data := NULL; v_new_data := to_jsonb(NEW);
  ELSE
    v_record_id := NEW.id; v_old_data := to_jsonb(OLD); v_new_data := to_jsonb(NEW);
  END IF;
  INSERT INTO public.audit_logs (table_name, action, record_id, old_data, new_data, changed_by)
  VALUES ('stage_fields_settings', TG_OP, v_record_id, v_old_data, v_new_data, v_actor);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 1. financial_item_passengers  (via card_id → cards.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_item_passengers') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='financial_item_passengers' AND column_name='org_id') THEN
      ALTER TABLE financial_item_passengers ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE financial_item_passengers f SET org_id = c.org_id FROM cards c WHERE f.card_id = c.id AND f.org_id IS NULL;
    UPDATE financial_item_passengers SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE financial_item_passengers ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE financial_item_passengers ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_financial_item_passengers_org_id ON financial_item_passengers(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "fip_select" ON financial_item_passengers;
DROP POLICY IF EXISTS financial_item_passengers_org_all ON financial_item_passengers;
DROP POLICY IF EXISTS financial_item_passengers_service_all ON financial_item_passengers;
CREATE POLICY financial_item_passengers_org_all ON financial_item_passengers TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY financial_item_passengers_service_all ON financial_item_passengers TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. sub_card_sync_log  (via sub_card_id → cards.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sub_card_sync_log') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sub_card_sync_log' AND column_name='org_id') THEN
      ALTER TABLE sub_card_sync_log ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE sub_card_sync_log s SET org_id = c.org_id FROM cards c WHERE s.sub_card_id = c.id AND s.org_id IS NULL;
    UPDATE sub_card_sync_log s SET org_id = c.org_id FROM cards c WHERE s.parent_card_id = c.id AND s.org_id IS NULL;
    UPDATE sub_card_sync_log SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE sub_card_sync_log ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE sub_card_sync_log ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_sub_card_sync_log_org_id ON sub_card_sync_log(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "sub_card_sync_log_select_authenticated" ON sub_card_sync_log;
DROP POLICY IF EXISTS sub_card_sync_log_org_all ON sub_card_sync_log;
DROP POLICY IF EXISTS sub_card_sync_log_service_all ON sub_card_sync_log;
CREATE POLICY sub_card_sync_log_org_all ON sub_card_sync_log TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY sub_card_sync_log_service_all ON sub_card_sync_log TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 3. monde_import_log_items  (via card_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='monde_import_log_items') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='monde_import_log_items' AND column_name='org_id') THEN
      ALTER TABLE monde_import_log_items ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE monde_import_log_items m SET org_id = c.org_id FROM cards c WHERE m.card_id = c.id AND m.org_id IS NULL;
    UPDATE monde_import_log_items SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE monde_import_log_items ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE monde_import_log_items ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_monde_import_log_items_org_id ON monde_import_log_items(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "authenticated_read_monde_log_items" ON monde_import_log_items;
DROP POLICY IF EXISTS monde_import_log_items_org_all ON monde_import_log_items;
DROP POLICY IF EXISTS monde_import_log_items_service_all ON monde_import_log_items;
CREATE POLICY monde_import_log_items_org_all ON monde_import_log_items TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY monde_import_log_items_service_all ON monde_import_log_items TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. pos_venda_import_log_items  (via card_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pos_venda_import_log_items') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_venda_import_log_items' AND column_name='org_id') THEN
      ALTER TABLE pos_venda_import_log_items ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE pos_venda_import_log_items p SET org_id = c.org_id FROM cards c WHERE p.card_id = c.id AND p.org_id IS NULL;
    UPDATE pos_venda_import_log_items SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE pos_venda_import_log_items ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE pos_venda_import_log_items ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_pos_venda_import_log_items_org_id ON pos_venda_import_log_items(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "pos_venda_import_log_items_all" ON pos_venda_import_log_items;
DROP POLICY IF EXISTS pos_venda_import_log_items_org_all ON pos_venda_import_log_items;
DROP POLICY IF EXISTS pos_venda_import_log_items_service_all ON pos_venda_import_log_items;
CREATE POLICY pos_venda_import_log_items_org_all ON pos_venda_import_log_items TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY pos_venda_import_log_items_service_all ON pos_venda_import_log_items TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5. pos_venda_import_logs  (via created_by → profiles.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pos_venda_import_logs') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_venda_import_logs' AND column_name='org_id') THEN
      ALTER TABLE pos_venda_import_logs ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE pos_venda_import_logs l SET org_id = p.org_id FROM profiles p WHERE l.created_by = p.id AND l.org_id IS NULL;
    UPDATE pos_venda_import_logs SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE pos_venda_import_logs ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE pos_venda_import_logs ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_pos_venda_import_logs_org_id ON pos_venda_import_logs(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "pos_venda_import_logs_all" ON pos_venda_import_logs;
DROP POLICY IF EXISTS pos_venda_import_logs_org_all ON pos_venda_import_logs;
DROP POLICY IF EXISTS pos_venda_import_logs_service_all ON pos_venda_import_logs;
CREATE POLICY pos_venda_import_logs_org_all ON pos_venda_import_logs TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY pos_venda_import_logs_service_all ON pos_venda_import_logs TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 6. team_members  (via team_id → teams.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='team_members') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='team_members' AND column_name='org_id') THEN
      ALTER TABLE team_members ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE team_members tm SET org_id = t.org_id FROM teams t WHERE tm.team_id = t.id AND tm.org_id IS NULL;
    UPDATE team_members SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE team_members ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE team_members ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_team_members_org_id ON team_members(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Read access for authenticated users" ON team_members;
DROP POLICY IF EXISTS team_members_org_all ON team_members;
DROP POLICY IF EXISTS team_members_service_all ON team_members;
CREATE POLICY team_members_org_all ON team_members TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY team_members_service_all ON team_members TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 7. stage_fields_settings  (via stage_id → pipeline_stages.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stage_fields_settings') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stage_fields_settings' AND column_name='org_id') THEN
      ALTER TABLE stage_fields_settings ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE stage_fields_settings sfs SET org_id = ps.org_id FROM pipeline_stages ps WHERE sfs.stage_id = ps.id AND sfs.org_id IS NULL;
    UPDATE stage_fields_settings SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE stage_fields_settings ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE stage_fields_settings ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_stage_fields_settings_org_id ON stage_fields_settings(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "stage_fields_settings_select_all" ON stage_fields_settings;
DROP POLICY IF EXISTS "Authenticated can manage stage_fields_settings" ON stage_fields_settings;
DROP POLICY IF EXISTS stage_fields_settings_org_all ON stage_fields_settings;
DROP POLICY IF EXISTS stage_fields_settings_service_all ON stage_fields_settings;
CREATE POLICY stage_fields_settings_org_all ON stage_fields_settings TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY stage_fields_settings_service_all ON stage_fields_settings TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 8. proposal_options  (via item_id → proposal_items.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='proposal_options') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='proposal_options' AND column_name='org_id') THEN
      ALTER TABLE proposal_options ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE proposal_options po SET org_id = pi.org_id FROM proposal_items pi WHERE po.item_id = pi.id AND po.org_id IS NULL;
    UPDATE proposal_options SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE proposal_options ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE proposal_options ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_proposal_options_org_id ON proposal_options(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Users can view proposal options" ON proposal_options;
DROP POLICY IF EXISTS proposal_options_org_all ON proposal_options;
DROP POLICY IF EXISTS proposal_options_service_all ON proposal_options;
CREATE POLICY proposal_options_org_all ON proposal_options TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY proposal_options_service_all ON proposal_options TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 9. proposal_client_selections (via proposal_id → proposals.org_id)
-- Acesso público via link mantido através de EXISTS com public_token.
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='proposal_client_selections') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='proposal_client_selections' AND column_name='org_id') THEN
      ALTER TABLE proposal_client_selections ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE proposal_client_selections pcs SET org_id = p.org_id FROM proposals p WHERE pcs.proposal_id = p.id AND pcs.org_id IS NULL;
    UPDATE proposal_client_selections SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE proposal_client_selections ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE proposal_client_selections ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_proposal_client_selections_org_id ON proposal_client_selections(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Anyone can view selections" ON proposal_client_selections;
DROP POLICY IF EXISTS proposal_client_selections_org_all ON proposal_client_selections;
DROP POLICY IF EXISTS proposal_client_selections_service_all ON proposal_client_selections;
DROP POLICY IF EXISTS proposal_client_selections_public_token ON proposal_client_selections;
CREATE POLICY proposal_client_selections_org_all ON proposal_client_selections TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY proposal_client_selections_service_all ON proposal_client_selections TO service_role USING (true) WITH CHECK (true);
CREATE POLICY proposal_client_selections_public_token ON proposal_client_selections FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_client_selections.proposal_id AND p.public_token IS NOT NULL));

-- ============================================================
-- 10. whatsapp_platforms (via created_by → profiles.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_platforms') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_platforms' AND column_name='org_id') THEN
      ALTER TABLE whatsapp_platforms ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE whatsapp_platforms wp SET org_id = p.org_id FROM profiles p WHERE wp.created_by = p.id AND wp.org_id IS NULL;
    UPDATE whatsapp_platforms SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE whatsapp_platforms ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE whatsapp_platforms ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_whatsapp_platforms_org_id ON whatsapp_platforms(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Authenticated users can view whatsapp_platforms" ON whatsapp_platforms;
DROP POLICY IF EXISTS whatsapp_platforms_org_all ON whatsapp_platforms;
DROP POLICY IF EXISTS whatsapp_platforms_service_all ON whatsapp_platforms;
CREATE POLICY whatsapp_platforms_org_all ON whatsapp_platforms TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY whatsapp_platforms_service_all ON whatsapp_platforms TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 11. whatsapp_custom_fields (via platform_id → whatsapp_platforms.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_custom_fields') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_custom_fields' AND column_name='org_id') THEN
      ALTER TABLE whatsapp_custom_fields ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE whatsapp_custom_fields wcf SET org_id = wp.org_id FROM whatsapp_platforms wp WHERE wcf.platform_id = wp.id AND wcf.org_id IS NULL;
    UPDATE whatsapp_custom_fields SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE whatsapp_custom_fields ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE whatsapp_custom_fields ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_whatsapp_custom_fields_org_id ON whatsapp_custom_fields(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Authenticated users can manage whatsapp_custom_fields" ON whatsapp_custom_fields;
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_custom_fields" ON whatsapp_custom_fields;
DROP POLICY IF EXISTS whatsapp_custom_fields_org_all ON whatsapp_custom_fields;
DROP POLICY IF EXISTS whatsapp_custom_fields_service_all ON whatsapp_custom_fields;
CREATE POLICY whatsapp_custom_fields_org_all ON whatsapp_custom_fields TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY whatsapp_custom_fields_service_all ON whatsapp_custom_fields TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 12. whatsapp_field_mappings (via platform_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_field_mappings') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_field_mappings' AND column_name='org_id') THEN
      ALTER TABLE whatsapp_field_mappings ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE whatsapp_field_mappings wfm SET org_id = wp.org_id FROM whatsapp_platforms wp WHERE wfm.platform_id = wp.id AND wfm.org_id IS NULL;
    UPDATE whatsapp_field_mappings SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE whatsapp_field_mappings ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE whatsapp_field_mappings ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_whatsapp_field_mappings_org_id ON whatsapp_field_mappings(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Authenticated users can manage whatsapp_field_mappings" ON whatsapp_field_mappings;
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_field_mappings" ON whatsapp_field_mappings;
DROP POLICY IF EXISTS whatsapp_field_mappings_org_all ON whatsapp_field_mappings;
DROP POLICY IF EXISTS whatsapp_field_mappings_service_all ON whatsapp_field_mappings;
CREATE POLICY whatsapp_field_mappings_org_all ON whatsapp_field_mappings TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY whatsapp_field_mappings_service_all ON whatsapp_field_mappings TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 13. whatsapp_linha_config (via platform_id → whatsapp_platforms, fallback pipeline_id → pipelines)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_linha_config') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_linha_config' AND column_name='org_id') THEN
      ALTER TABLE whatsapp_linha_config ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE whatsapp_linha_config wlc SET org_id = wp.org_id FROM whatsapp_platforms wp WHERE wlc.platform_id = wp.id AND wlc.org_id IS NULL;
    UPDATE whatsapp_linha_config wlc SET org_id = pip.org_id FROM pipelines pip WHERE wlc.pipeline_id = pip.id AND wlc.org_id IS NULL;
    UPDATE whatsapp_linha_config SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE whatsapp_linha_config ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE whatsapp_linha_config ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_whatsapp_linha_config_org_id ON whatsapp_linha_config(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "whatsapp_linha_config_select" ON whatsapp_linha_config;
DROP POLICY IF EXISTS whatsapp_linha_config_org_all ON whatsapp_linha_config;
DROP POLICY IF EXISTS whatsapp_linha_config_org_select ON whatsapp_linha_config;
DROP POLICY IF EXISTS whatsapp_linha_config_service_all_new ON whatsapp_linha_config;
CREATE POLICY whatsapp_linha_config_org_all ON whatsapp_linha_config TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY whatsapp_linha_config_service_all_new ON whatsapp_linha_config TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 14. whatsapp_phase_instance_map (via phase_id → pipeline_phases → pipelines.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_phase_instance_map') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_phase_instance_map' AND column_name='org_id') THEN
      ALTER TABLE whatsapp_phase_instance_map ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE whatsapp_phase_instance_map wpm SET org_id = wp.org_id FROM whatsapp_platforms wp WHERE wpm.platform_id = wp.id AND wpm.org_id IS NULL;
    UPDATE whatsapp_phase_instance_map SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE whatsapp_phase_instance_map ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE whatsapp_phase_instance_map ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_whatsapp_phase_instance_map_org_id ON whatsapp_phase_instance_map(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Allow authenticated read" ON whatsapp_phase_instance_map;
DROP POLICY IF EXISTS whatsapp_phase_instance_map_org_all ON whatsapp_phase_instance_map;
DROP POLICY IF EXISTS whatsapp_phase_instance_map_service_all ON whatsapp_phase_instance_map;
CREATE POLICY whatsapp_phase_instance_map_org_all ON whatsapp_phase_instance_map TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY whatsapp_phase_instance_map_service_all ON whatsapp_phase_instance_map TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 15. integration_outbound_field_map (via integration_id → integrations.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='integration_outbound_field_map') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_outbound_field_map' AND column_name='org_id') THEN
      ALTER TABLE integration_outbound_field_map ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE integration_outbound_field_map m SET org_id = i.org_id FROM integrations i WHERE m.integration_id = i.id AND m.org_id IS NULL;
    UPDATE integration_outbound_field_map SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE integration_outbound_field_map ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE integration_outbound_field_map ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_integration_outbound_field_map_org_id ON integration_outbound_field_map(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Allow authenticated read" ON integration_outbound_field_map;
DROP POLICY IF EXISTS integration_outbound_field_map_org_all ON integration_outbound_field_map;
DROP POLICY IF EXISTS integration_outbound_field_map_service_all ON integration_outbound_field_map;
CREATE POLICY integration_outbound_field_map_org_all ON integration_outbound_field_map TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY integration_outbound_field_map_service_all ON integration_outbound_field_map TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 16. integration_outbound_stage_map (via integration_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='integration_outbound_stage_map') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_outbound_stage_map' AND column_name='org_id') THEN
      ALTER TABLE integration_outbound_stage_map ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE integration_outbound_stage_map m SET org_id = i.org_id FROM integrations i WHERE m.integration_id = i.id AND m.org_id IS NULL;
    UPDATE integration_outbound_stage_map SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE integration_outbound_stage_map ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE integration_outbound_stage_map ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_integration_outbound_stage_map_org_id ON integration_outbound_stage_map(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Allow authenticated read" ON integration_outbound_stage_map;
DROP POLICY IF EXISTS integration_outbound_stage_map_org_all ON integration_outbound_stage_map;
DROP POLICY IF EXISTS integration_outbound_stage_map_service_all ON integration_outbound_stage_map;
CREATE POLICY integration_outbound_stage_map_org_all ON integration_outbound_stage_map TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY integration_outbound_stage_map_service_all ON integration_outbound_stage_map TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 17. integration_task_sync_config (via integration_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='integration_task_sync_config') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_task_sync_config' AND column_name='org_id') THEN
      ALTER TABLE integration_task_sync_config ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE integration_task_sync_config c SET org_id = i.org_id FROM integrations i WHERE c.integration_id = i.id AND c.org_id IS NULL;
    UPDATE integration_task_sync_config SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE integration_task_sync_config ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE integration_task_sync_config ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_integration_task_sync_config_org_id ON integration_task_sync_config(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "task_sync_config_select" ON integration_task_sync_config;
DROP POLICY IF EXISTS integration_task_sync_config_org_all ON integration_task_sync_config;
DROP POLICY IF EXISTS integration_task_sync_config_service_all ON integration_task_sync_config;
CREATE POLICY integration_task_sync_config_org_all ON integration_task_sync_config TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY integration_task_sync_config_service_all ON integration_task_sync_config TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 18. integration_task_type_map (via integration_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='integration_task_type_map') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_task_type_map' AND column_name='org_id') THEN
      ALTER TABLE integration_task_type_map ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE integration_task_type_map m SET org_id = i.org_id FROM integrations i WHERE m.integration_id = i.id AND m.org_id IS NULL;
    UPDATE integration_task_type_map SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE integration_task_type_map ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE integration_task_type_map ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_integration_task_type_map_org_id ON integration_task_type_map(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "task_type_map_select" ON integration_task_type_map;
DROP POLICY IF EXISTS integration_task_type_map_org_all ON integration_task_type_map;
DROP POLICY IF EXISTS integration_task_type_map_service_all ON integration_task_type_map;
CREATE POLICY integration_task_type_map_org_all ON integration_task_type_map TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY integration_task_type_map_service_all ON integration_task_type_map TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 19. integration_conflict_log (via integration_id; fallback card_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='integration_conflict_log') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_conflict_log' AND column_name='org_id') THEN
      ALTER TABLE integration_conflict_log ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE integration_conflict_log l SET org_id = i.org_id FROM integrations i WHERE l.integration_id = i.id AND l.org_id IS NULL;
    UPDATE integration_conflict_log l SET org_id = c.org_id FROM cards c WHERE l.card_id = c.id AND l.org_id IS NULL;
    UPDATE integration_conflict_log SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE integration_conflict_log ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE integration_conflict_log ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_integration_conflict_log_org_id ON integration_conflict_log(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Authenticated users can view conflict logs" ON integration_conflict_log;
DROP POLICY IF EXISTS integration_conflict_log_org_all ON integration_conflict_log;
DROP POLICY IF EXISTS integration_conflict_log_service_all ON integration_conflict_log;
CREATE POLICY integration_conflict_log_org_all ON integration_conflict_log TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY integration_conflict_log_service_all ON integration_conflict_log TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 20. monde_people_queue (via contato_id → contatos.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='monde_people_queue') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='monde_people_queue' AND column_name='org_id') THEN
      ALTER TABLE monde_people_queue ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE monde_people_queue q SET org_id = c.org_id FROM contatos c WHERE q.contato_id = c.id AND q.org_id IS NULL;
    UPDATE monde_people_queue SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE monde_people_queue ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE monde_people_queue ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_monde_people_queue_org_id ON monde_people_queue(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Service role full access on monde_people_queue" ON monde_people_queue;
DROP POLICY IF EXISTS monde_people_queue_org_all ON monde_people_queue;
DROP POLICY IF EXISTS monde_people_queue_service_all ON monde_people_queue;
CREATE POLICY monde_people_queue_org_all ON monde_people_queue TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY monde_people_queue_service_all ON monde_people_queue TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 21. card_auto_creation_rules (via target_pipeline_id → pipelines.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='card_auto_creation_rules') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='card_auto_creation_rules' AND column_name='org_id') THEN
      ALTER TABLE card_auto_creation_rules ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE card_auto_creation_rules r SET org_id = pip.org_id FROM pipelines pip WHERE r.target_pipeline_id = pip.id AND r.org_id IS NULL;
    UPDATE card_auto_creation_rules r SET org_id = p.org_id FROM profiles p WHERE r.created_by = p.id AND r.org_id IS NULL;
    UPDATE card_auto_creation_rules SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE card_auto_creation_rules ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE card_auto_creation_rules ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_card_auto_creation_rules_org_id ON card_auto_creation_rules(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Authenticated users can manage rules" ON card_auto_creation_rules;
DROP POLICY IF EXISTS "Authenticated users can view rules" ON card_auto_creation_rules;
DROP POLICY IF EXISTS card_auto_creation_rules_org_all ON card_auto_creation_rules;
DROP POLICY IF EXISTS card_auto_creation_rules_service_all ON card_auto_creation_rules;
CREATE POLICY card_auto_creation_rules_org_all ON card_auto_creation_rules TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY card_auto_creation_rules_service_all ON card_auto_creation_rules TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Catálogos globais: manter read-open mas documentar
-- ============================================================
COMMENT ON TABLE activity_categories IS 'GLOBAL: catálogo compartilhado entre todas as orgs (sem org_id)';
COMMENT ON TABLE integration_field_catalog IS 'GLOBAL: catálogo de campos padronizados';
COMMENT ON TABLE integration_provider_catalog IS 'GLOBAL: catálogo de providers de integração';
COMMENT ON TABLE integration_health_rules IS 'GLOBAL: regras de health check padronizadas';
