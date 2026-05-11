-- Tabela de logs por turno da execução do agente IA (Estela inicialmente, e futuros).
-- 1 linha por turn/attempt. Grava prompt completo, raw_response, validator_verdict,
-- slot_in_focus, prompt_builder_version, discovery_config_hash, tool_calls.
-- PII scrubbing aplicado pre-INSERT pelo edge function (telefone, email, CPF).
-- TTL automático de 30 dias via cron (próxima migration).

CREATE TABLE IF NOT EXISTS ai_agent_turn_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id         UUID NOT NULL REFERENCES ai_conversation_turns(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES ai_agents(id),
  org_id          UUID NOT NULL REFERENCES organizations(id) DEFAULT requesting_org_id(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id),

  attempt_number    INTEGER NOT NULL DEFAULT 1,
  prompt_system     TEXT,
  prompt_user       TEXT,
  raw_response      TEXT,
  final_messages    TEXT[],
  model_used        TEXT,
  temperature_used  NUMERIC(3,2),
  max_tokens_used   INTEGER,
  tool_calls        JSONB NOT NULL DEFAULT '[]'::jsonb,
  validator_verdict JSONB,
  slot_in_focus     TEXT,
  duration_ms       INTEGER,
  prompt_builder_version TEXT,
  discovery_config_hash  TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_turn_logs_turn ON ai_agent_turn_logs(turn_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_turn_logs_agent_created ON ai_agent_turn_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_turn_logs_conversation ON ai_agent_turn_logs(conversation_id, created_at DESC);

ALTER TABLE ai_agent_turn_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_agent_turn_logs_org_select ON ai_agent_turn_logs;
CREATE POLICY ai_agent_turn_logs_org_select ON ai_agent_turn_logs
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

DROP POLICY IF EXISTS ai_agent_turn_logs_service_all ON ai_agent_turn_logs;
CREATE POLICY ai_agent_turn_logs_service_all ON ai_agent_turn_logs
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE ai_agent_turn_logs IS
  'Log por turno da execução de agentes IA. PII scrubbed pre-INSERT (telefone, email, CPF). TTL 30 dias via cron. Visível pela org da conversa via RLS. 1 linha por attempt (REGEN gera 2 linhas).';
