-- ============================================================================
-- MIGRATION: ai_agent_few_shot_examples — exemplos lead→agente pro prompt v2
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2. Cada linha = par
-- (mensagem do lead, resposta ideal da IA). Entra no bloco <examples>
-- do prompt v2 pra calibrar a IA por contraste, não por regra.
--
-- Opcionalmente associado a um momento específico (related_moment_key)
-- ou a um sinal silencioso (related_signal_key). No v2.0 todos os exemplos
-- habilitados entram no prompt (sem filtro por momento atual — decisão
-- pós-benchmark, v2.1 pode filtrar pra economizar tokens).
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_agent_few_shot_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  lead_message TEXT NOT NULL,
  agent_response TEXT NOT NULL,
  context_note TEXT,                -- opcional: "lead chegou por indicação"
  related_moment_key TEXT,          -- opcional: slug de ai_agent_moments
  related_signal_key TEXT,          -- opcional: slug de ai_agent_silent_signals

  display_order INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (length(trim(lead_message)) > 0),
  CHECK (length(trim(agent_response)) > 0)
);

CREATE INDEX IF NOT EXISTS ai_agent_few_shot_examples_agent_idx
  ON ai_agent_few_shot_examples(agent_id, display_order);

CREATE INDEX IF NOT EXISTS ai_agent_few_shot_examples_moment_idx
  ON ai_agent_few_shot_examples(agent_id, related_moment_key)
  WHERE related_moment_key IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_ai_agent_few_shot_examples_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS ai_few_shot_set_updated_at ON ai_agent_few_shot_examples;
CREATE TRIGGER ai_few_shot_set_updated_at
  BEFORE UPDATE ON ai_agent_few_shot_examples
  FOR EACH ROW EXECUTE FUNCTION trg_ai_agent_few_shot_examples_updated_at();

-- RLS
ALTER TABLE ai_agent_few_shot_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_few_shot_select" ON ai_agent_few_shot_examples;
CREATE POLICY "ai_few_shot_select" ON ai_agent_few_shot_examples
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_few_shot_examples.agent_id AND a.org_id = requesting_org_id()));

DROP POLICY IF EXISTS "ai_few_shot_insert" ON ai_agent_few_shot_examples;
CREATE POLICY "ai_few_shot_insert" ON ai_agent_few_shot_examples
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_few_shot_examples.agent_id AND a.org_id = requesting_org_id()));

DROP POLICY IF EXISTS "ai_few_shot_update" ON ai_agent_few_shot_examples;
CREATE POLICY "ai_few_shot_update" ON ai_agent_few_shot_examples
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_few_shot_examples.agent_id AND a.org_id = requesting_org_id()));

DROP POLICY IF EXISTS "ai_few_shot_delete" ON ai_agent_few_shot_examples;
CREATE POLICY "ai_few_shot_delete" ON ai_agent_few_shot_examples
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_few_shot_examples.agent_id AND a.org_id = requesting_org_id()));

DROP POLICY IF EXISTS "ai_few_shot_service" ON ai_agent_few_shot_examples;
CREATE POLICY "ai_few_shot_service" ON ai_agent_few_shot_examples
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_agent_few_shot_examples TO authenticated;
GRANT ALL ON ai_agent_few_shot_examples TO service_role;

COMMENT ON TABLE ai_agent_few_shot_examples IS
  'Exemplos few-shot lead→agente pro prompt v2 (bloco <examples>). Calibra IA por contraste. Opcional: vinculado a momento ou sinal específico.';
