-- ============================================================================
-- M0 — Fundação do módulo Sofia/wsdr: org-safety + templating + config v2
-- Módulo wsdr_* : ISOLADO de ai_agents/Patricia/Estela (sem FK p/ aquela engine).
-- 1) wsdr_get_config org-safe (corrige bug: hoje WHERE slug LIMIT 1 ignora org_id)
-- 2) wsdr_agents (registro) + wsdr_phone_line_routing (linha -> agente)
-- 3) config JSONB versionado (v2) com grupos + capabilities (backfill da Sofia)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC org-safe. n8n chama sem JWT, então passa p_org_id explícito.
--    UI (authenticated) pode omitir -> usa requesting_org_id().
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS wsdr_get_config(text);
CREATE OR REPLACE FUNCTION wsdr_get_config(p_slug TEXT, p_org_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT config FROM wsdr_agent_config
  WHERE slug = p_slug
    AND org_id = COALESCE(p_org_id, requesting_org_id())
  LIMIT 1;
$$;
COMMENT ON FUNCTION wsdr_get_config IS 'Config do SDR Weddings por (slug, org). n8n passa p_org_id (sem JWT). Org-safe.';

-- ----------------------------------------------------------------------------
-- 2) Registro de agentes + roteamento por linha de WhatsApp
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wsdr_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_template TEXT NOT NULL DEFAULT 'sdr',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
COMMENT ON TABLE wsdr_agents IS 'Registro de agentes SDR config-driven (Sofia e clones). Isolado de ai_agents.';

ALTER TABLE wsdr_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wsdr_agents_org_all ON wsdr_agents;
CREATE POLICY wsdr_agents_org_all ON wsdr_agents TO authenticated
  USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
DROP POLICY IF EXISTS wsdr_agents_service_all ON wsdr_agents;
CREATE POLICY wsdr_agents_service_all ON wsdr_agents TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS trg_wsdr_agents_touch ON wsdr_agents;
CREATE TRIGGER trg_wsdr_agents_touch BEFORE UPDATE ON wsdr_agents
  FOR EACH ROW EXECUTE FUNCTION wsdr_touch_updated_at();

CREATE TABLE IF NOT EXISTS wsdr_phone_line_routing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  phone_line TEXT NOT NULL,          -- phone_number_id da linha OU sufixo do número
  agent_slug TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone_line),
  -- FK composta inclui org_id -> garante consistência de org (sem cross-org)
  FOREIGN KEY (org_id, agent_slug) REFERENCES wsdr_agents(org_id, slug) ON DELETE CASCADE
);
COMMENT ON TABLE wsdr_phone_line_routing IS 'Mapeia linha de WhatsApp -> agente wsdr (qual config carregar).';

ALTER TABLE wsdr_phone_line_routing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wsdr_routing_org_all ON wsdr_phone_line_routing;
CREATE POLICY wsdr_routing_org_all ON wsdr_phone_line_routing TO authenticated
  USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
DROP POLICY IF EXISTS wsdr_routing_service_all ON wsdr_phone_line_routing;
CREATE POLICY wsdr_routing_service_all ON wsdr_phone_line_routing TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- RPC p/ o webhook resolver o agente de uma linha (sem JWT -> service_role)
CREATE OR REPLACE FUNCTION wsdr_resolve_agent_by_line(p_phone_line TEXT)
RETURNS TABLE (org_id UUID, agent_slug TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.org_id, r.agent_slug
  FROM wsdr_phone_line_routing r
  JOIN wsdr_agents a ON a.org_id = r.org_id AND a.slug = r.agent_slug
  WHERE r.phone_line = p_phone_line AND r.active AND a.active
  LIMIT 1;
$$;
COMMENT ON FUNCTION wsdr_resolve_agent_by_line IS 'Resolve (org,slug) do agente para uma linha de WhatsApp.';

-- Seed: Sofia + sua linha de teste (sufixo do número do Vitor / linha Elopement)
INSERT INTO wsdr_agents (org_id, slug, display_name, role_template, active)
VALUES ('b0000000-0000-0000-0000-000000000002', 'sofia-weddings', 'Sofia', 'sdr', TRUE)
ON CONFLICT (org_id, slug) DO NOTHING;

INSERT INTO wsdr_phone_line_routing (org_id, phone_line, agent_slug, active)
VALUES
  ('b0000000-0000-0000-0000-000000000002', 'fe26b171-81b5-4622-8d77-aa5bf102d781', 'sofia-weddings', TRUE),
  ('b0000000-0000-0000-0000-000000000002', '11964293533', 'sofia-weddings', TRUE)
ON CONFLICT (org_id, phone_line) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3) Config v2: agrupar os 8 campos flat em identity/voice/qualification/
--    boundaries + bloco capabilities (tudo enabled:false). Backfill idempotente.
--    O nó Monta do n8n lê nested COM fallback flat, então não quebra entre apply
--    da migration e redeploy do workflow.
-- ----------------------------------------------------------------------------
UPDATE wsdr_agent_config
SET config = jsonb_build_object(
  'config_version', 2,
  'identity', jsonb_build_object(
    'persona_nome', COALESCE(config->'persona_nome', '"Sofia"'::jsonb),
    'empresa',      COALESCE(config->'empresa', '"Welcome Weddings"'::jsonb),
    'proposta',     COALESCE(config->'proposta', '""'::jsonb)
  ),
  'voice', jsonb_build_object(
    'tom',         COALESCE(config->'tom', '"acolhedor"'::jsonb),
    'formalidade', COALESCE(config->'formalidade', '0.5'::jsonb),
    'abertura',    COALESCE(config->'abertura', '""'::jsonb)
  ),
  'qualification', jsonb_build_object(
    'etapas',           COALESCE(config->'etapas', '[]'::jsonb),
    'faixas_orcamento', COALESCE(config->'faixas_orcamento', '[]'::jsonb),
    'gates',            COALESCE(config->'gates', '{}'::jsonb)
  ),
  'boundaries', jsonb_build_object(
    'curadas', COALESCE(config->'boundaries_curadas', '{}'::jsonb),
    'custom',  COALESCE(config->'fronteiras', '[]'::jsonb)
  ),
  'capabilities', jsonb_build_object(
    'crm_write',  jsonb_build_object('enabled', false, 'writable_fields', '[]'::jsonb, 'protected_fields', '[]'::jsonb, 'stage_move_enabled', false, 'target_stage_id', null),
    'calendar',   jsonb_build_object('enabled', false, 'wedding_planner_profile_id', null, 'windows', '[]'::jsonb, 'slot_duration_minutes', 45, 'skip_weekends', true, 'max_slots', 4, 'search_window_days', 14),
    'knowledge',  jsonb_build_object('enabled', false, 'top_k', 4),
    'followup',   jsonb_build_object('enabled', false, 'default_time', '10:30', 'days', jsonb_build_array(1,3,7)),
    'multimodal', jsonb_build_object('enabled', false, 'audio', true, 'image', true, 'pdf', true),
    'memory',     jsonb_build_object('enabled', false, 'window_messages', 10, 'debounce_ms', 8000, 'bubbles_enabled', true, 'bubble_delay_ms', 1500)
  )
)
WHERE slug = 'sofia-weddings'
  AND COALESCE(config->>'config_version', '1') <> '2';
