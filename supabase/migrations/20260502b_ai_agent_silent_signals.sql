-- ============================================================================
-- MIGRATION: ai_agent_silent_signals — sinais que a IA registra sem comentar
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2. Cada linha = sinal
-- observável na conversa (ex: "lead menciona viagem internacional recente",
-- "referência a casamento admirado") que a IA deve DETECTAR e REGISTRAR
-- em campo do CRM silenciosamente — sem comentar com o lead.
--
-- Consumida pelo runPersonaAgent_v2 como bloco <silent_signals> no prompt.
-- No v2.0, a IA só é instruída sobre os sinais (classifica internamente).
-- Execução automática de update_contact/update_card_field ao detectar
-- fica pra v2.1 (quando tool-calling for reintroduzido no persona v2).
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_agent_silent_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  signal_key TEXT NOT NULL,         -- slug: 'viagem_internacional_recente'
  signal_label TEXT NOT NULL,       -- humano: "Viagem internacional recente"
  detection_hint TEXT NOT NULL,     -- "lead cita viagem pra Europa/Caribe/Ásia nos últimos 12 meses"
  crm_field_key TEXT,               -- key de system_fields (ex: 'ww_sdr_perfil_viagem_internacional')
  how_to_use TEXT,                  -- "usa como teto real de orçamento, não confronta"

  enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agent_id, signal_key)
);

CREATE INDEX IF NOT EXISTS ai_agent_silent_signals_agent_idx
  ON ai_agent_silent_signals(agent_id, display_order);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_ai_agent_silent_signals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS ai_silent_signals_set_updated_at ON ai_agent_silent_signals;
CREATE TRIGGER ai_silent_signals_set_updated_at
  BEFORE UPDATE ON ai_agent_silent_signals
  FOR EACH ROW EXECUTE FUNCTION trg_ai_agent_silent_signals_updated_at();

-- RLS (mesmo padrão ai_agent_moments)
ALTER TABLE ai_agent_silent_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_silent_signals_select" ON ai_agent_silent_signals;
CREATE POLICY "ai_silent_signals_select" ON ai_agent_silent_signals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_silent_signals.agent_id AND a.org_id = requesting_org_id()));

DROP POLICY IF EXISTS "ai_silent_signals_insert" ON ai_agent_silent_signals;
CREATE POLICY "ai_silent_signals_insert" ON ai_agent_silent_signals
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_silent_signals.agent_id AND a.org_id = requesting_org_id()));

DROP POLICY IF EXISTS "ai_silent_signals_update" ON ai_agent_silent_signals;
CREATE POLICY "ai_silent_signals_update" ON ai_agent_silent_signals
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_silent_signals.agent_id AND a.org_id = requesting_org_id()));

DROP POLICY IF EXISTS "ai_silent_signals_delete" ON ai_agent_silent_signals;
CREATE POLICY "ai_silent_signals_delete" ON ai_agent_silent_signals
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_silent_signals.agent_id AND a.org_id = requesting_org_id()));

DROP POLICY IF EXISTS "ai_silent_signals_service" ON ai_agent_silent_signals;
CREATE POLICY "ai_silent_signals_service" ON ai_agent_silent_signals
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_agent_silent_signals TO authenticated;
GRANT ALL ON ai_agent_silent_signals TO service_role;

COMMENT ON TABLE ai_agent_silent_signals IS
  'Sinais que a IA registra silenciosamente na conversa (sem comentar com o lead). Consumida pelo bloco <silent_signals> do prompt v2. No v2.0 só instrui a IA; execução automática de update_* tool fica pra v2.1.';
