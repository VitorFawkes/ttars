-- Fase B2: fecha as 6 policies ainda detectadas pelo guardião após Fase B.
-- Decisões tomadas caso a caso:
--   - contact_stats: PER-ORG via contact_id → contatos.org_id
--   - integration_health_alerts: PER-ORG (default Welcome Group onde não tem FK)
--   - ai_extraction_field_config: GLOBAL (prompt config do produto, compartilhado)
--   - integration_health_pulse: GLOBAL (agregado por channel, dashboard platform)
--   - integration_outbox: GLOBAL (fila técnica polimórfica, service_role only)
--   - webhook_logs: GLOBAL (debug logs de plataforma)
-- Tabelas globais ganham COMMENT explícito para instruir futuros agentes.

SET search_path = public;

-- ============================================================
-- contact_stats  (PER-ORG via contact_id → contatos.org_id)
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contact_stats') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contact_stats' AND column_name='org_id') THEN
      ALTER TABLE contact_stats ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE contact_stats cs SET org_id = c.org_id FROM contatos c WHERE cs.contact_id = c.id AND cs.org_id IS NULL;
    UPDATE contact_stats SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE contact_stats ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE contact_stats ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_contact_stats_org_id ON contact_stats(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON contact_stats;
DROP POLICY IF EXISTS contact_stats_org_all ON contact_stats;
DROP POLICY IF EXISTS contact_stats_service_all ON contact_stats;
CREATE POLICY contact_stats_org_all ON contact_stats TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY contact_stats_service_all ON contact_stats TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- integration_health_alerts  (PER-ORG, backfill Welcome Group)
-- Sem FK direta para origem — default é ancorar em Welcome Group
-- (org raiz). Novos alerts já nascem com requesting_org_id() via default.
-- ============================================================
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='integration_health_alerts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_health_alerts' AND column_name='org_id') THEN
      ALTER TABLE integration_health_alerts ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;
    UPDATE integration_health_alerts SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE integration_health_alerts ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE integration_health_alerts ALTER COLUMN org_id SET DEFAULT requesting_org_id();
    CREATE INDEX IF NOT EXISTS idx_integration_health_alerts_org_id ON integration_health_alerts(org_id);
  END IF;
END $mig$;

DROP POLICY IF EXISTS "Authenticated can view health alerts" ON integration_health_alerts;
DROP POLICY IF EXISTS integration_health_alerts_org_all ON integration_health_alerts;
DROP POLICY IF EXISTS integration_health_alerts_service_all ON integration_health_alerts;
CREATE POLICY integration_health_alerts_org_all ON integration_health_alerts TO authenticated USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY integration_health_alerts_service_all ON integration_health_alerts TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- GLOBAIS: remove acesso open de authenticated; mantém service_role.
-- Leitura via UI só através de RPCs service_definer explícitas.
-- ============================================================

-- ai_extraction_field_config: config de extração compartilhada entre orgs.
DROP POLICY IF EXISTS "Authenticated read" ON ai_extraction_field_config;
COMMENT ON TABLE ai_extraction_field_config IS
  'GLOBAL: configuração de campos de extração IA. Compartilhada entre todas as orgs. '
  'Leitura acontece via RPCs SECURITY DEFINER. Agentes: NÃO adicionar org_id.';

-- integration_health_pulse: agregados por channel para dashboard platform.
DROP POLICY IF EXISTS "Authenticated can view pulse" ON integration_health_pulse;
COMMENT ON TABLE integration_health_pulse IS
  'GLOBAL: pulse agregado por canal, consumido por dashboard de platform-admin. '
  'Não é per-org. Agentes: NÃO adicionar org_id. Ler apenas via RPC ou role service_role.';

-- integration_outbox: fila técnica polimórfica.
DROP POLICY IF EXISTS "integration_outbox_authenticated_select" ON integration_outbox;
COMMENT ON TABLE integration_outbox IS
  'GLOBAL: fila técnica de outbound polimórfica (qualquer entity_type). '
  'Acesso apenas via service_role (edge functions). Agentes: NÃO expor para authenticated.';

-- webhook_logs: debug logs de plataforma.
DROP POLICY IF EXISTS "Enable read access for all users" ON webhook_logs;
COMMENT ON TABLE webhook_logs IS
  'GLOBAL: log cru de webhooks recebidos (debug de plataforma). Acesso apenas via service_role. '
  'Agentes: NÃO adicionar org_id; payload pode referenciar qualquer org. Leitura via RPC se necessário.';

-- Reforçar comentários das demais tabelas verdadeiramente globais
COMMENT ON TABLE activity_categories IS
  'GLOBAL: catálogo de categorias de atividade. Compartilhado entre todas as orgs. '
  'Agentes: NÃO adicionar org_id.';
COMMENT ON TABLE integration_field_catalog IS
  'GLOBAL: catálogo de campos padronizados de integração. Compartilhado. '
  'Agentes: NÃO adicionar org_id.';
COMMENT ON TABLE integration_provider_catalog IS
  'GLOBAL: catálogo de providers de integração (ActiveCampaign, Monde, etc). Compartilhado. '
  'Agentes: NÃO adicionar org_id.';
COMMENT ON TABLE integration_health_rules IS
  'GLOBAL: regras de health check padronizadas. Compartilhado. '
  'Agentes: NÃO adicionar org_id.';
COMMENT ON TABLE system_fields IS
  'GLOBAL: definição dos campos de sistema (PK=key impede duplicação cross-org). '
  'Compartilhado entre todas as orgs por desenho. Agentes: NÃO adicionar org_id.';
COMMENT ON TABLE destinations IS
  'Parcialmente global: a tabela tem org_id para destinos customizados por org, mas '
  'também há policy de leitura pública para destinos do catálogo base (org_id da org raiz). '
  'Agentes: manter o esquema atual. Nova entrada sem org_id cai no default requesting_org_id().';
