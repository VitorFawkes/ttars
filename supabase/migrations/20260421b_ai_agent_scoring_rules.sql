-- ============================================================================
-- Estela — Scoring rules editaveis via CRM
-- ============================================================================
-- Cria 2 tabelas novas para permitir que o admin edite pesos de regiao,
-- pesos de valor/convidado e threshold de qualificacao pela UI, sem deploy.
--
-- ai_agent_scoring_rules: regras individuais por dimensao (regiao,
--   valor_convidado, sinal_indireto) com peso numerico
-- ai_agent_scoring_config: config geral por agente (threshold, fallback)
--
-- RLS: org_id = requesting_org_id() em ambas. Service role full access.
-- ============================================================================

-- ============================================================================
-- 1. AI_AGENT_SCORING_RULES — Regras de pontuacao por dimensao
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Dimensao da regra (qual input ela avalia)
  dimension TEXT NOT NULL CHECK (dimension IN (
    'regiao',          -- regiao geografica do destino (Caribe, Maldivas, Nordeste, etc)
    'valor_convidado', -- valor por convidado (orcamento / num_convidados)
    'sinal_indireto'   -- bonus por sinal captado (viagem internacional, referencia casamento)
  )),

  -- Como a regra casa com o input
  condition_type TEXT NOT NULL CHECK (condition_type IN (
    'equals',       -- valor exato (ex: destino = "Caribe")
    'range',        -- faixa numerica (ex: 3500 <= valor < 999999)
    'boolean_true'  -- input booleano eh true (ex: viagem_internacional = true)
  )),

  -- Valor da condicao em JSONB (flexivel por tipo)
  -- equals:       { "value": "Caribe" }
  -- range:        { "min": 3500, "max": null }  (null = infinito)
  -- boolean_true: { "field": "viagem_internacional" }
  condition_value JSONB NOT NULL,

  -- Peso a somar ao score se a regra casar
  weight NUMERIC NOT NULL,

  -- Label human-readable (aparece na UI)
  label TEXT,

  -- Ordem de exibicao (nao afeta calculo)
  ordem INT DEFAULT 0,

  -- Ativa ou desativada pelo admin
  ativa BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scoring_rules_agent ON ai_agent_scoring_rules(agent_id) WHERE ativa = true;
CREATE INDEX idx_scoring_rules_org ON ai_agent_scoring_rules(org_id);
CREATE INDEX idx_scoring_rules_dimension ON ai_agent_scoring_rules(agent_id, dimension) WHERE ativa = true;

ALTER TABLE ai_agent_scoring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY scoring_rules_org_all ON ai_agent_scoring_rules TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY scoring_rules_service_all ON ai_agent_scoring_rules TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger: garante que agent.org_id = rule.org_id (defesa cross-org)
CREATE OR REPLACE FUNCTION trg_scoring_rules_strict_agent_org()
RETURNS TRIGGER AS $$
DECLARE
  v_agent_org UUID;
BEGIN
  SELECT org_id INTO v_agent_org FROM ai_agents WHERE id = NEW.agent_id;

  IF v_agent_org IS NULL THEN
    RAISE EXCEPTION 'Agent % nao existe', NEW.agent_id;
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_agent_org;
  ELSIF NEW.org_id != v_agent_org THEN
    RAISE EXCEPTION 'Cross-org violation: scoring_rule.org_id (%) != agent.org_id (%)',
      NEW.org_id, v_agent_org;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER scoring_rules_strict_agent_org
  BEFORE INSERT OR UPDATE ON ai_agent_scoring_rules
  FOR EACH ROW EXECUTE FUNCTION trg_scoring_rules_strict_agent_org();

COMMENT ON TABLE ai_agent_scoring_rules IS
  'Regras editaveis de pontuacao por dimensao (regiao, valor_convidado, sinal_indireto).
   Permite admin ajustar pesos pela UI sem deploy.
   Usada pela RPC calculate_agent_qualification_score.';

-- ============================================================================
-- 2. AI_AGENT_SCORING_CONFIG — Config geral de scoring por agente
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_scoring_config (
  agent_id UUID PRIMARY KEY REFERENCES ai_agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  -- Score minimo para considerar qualificado
  threshold_qualify NUMERIC NOT NULL DEFAULT 25,

  -- Acao quando nao qualifica (enum: material_informativo, encerrar_cordial, nota_interna)
  fallback_action TEXT DEFAULT 'material_informativo',

  -- Max pontos que um sinal indireto pode somar (evita bypass via sinal)
  max_sinal_bonus NUMERIC DEFAULT 10,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_agent_scoring_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY scoring_config_org_all ON ai_agent_scoring_config TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY scoring_config_service_all ON ai_agent_scoring_config TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger: agent.org_id = config.org_id
CREATE OR REPLACE FUNCTION trg_scoring_config_strict_agent_org()
RETURNS TRIGGER AS $$
DECLARE
  v_agent_org UUID;
BEGIN
  SELECT org_id INTO v_agent_org FROM ai_agents WHERE id = NEW.agent_id;

  IF v_agent_org IS NULL THEN
    RAISE EXCEPTION 'Agent % nao existe', NEW.agent_id;
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_agent_org;
  ELSIF NEW.org_id != v_agent_org THEN
    RAISE EXCEPTION 'Cross-org violation: scoring_config.org_id (%) != agent.org_id (%)',
      NEW.org_id, v_agent_org;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER scoring_config_strict_agent_org
  BEFORE INSERT OR UPDATE ON ai_agent_scoring_config
  FOR EACH ROW EXECUTE FUNCTION trg_scoring_config_strict_agent_org();

COMMENT ON TABLE ai_agent_scoring_config IS
  'Config geral de scoring por agente: threshold, fallback action.
   Editavel pela UI do AiAgentDetailPage.';
