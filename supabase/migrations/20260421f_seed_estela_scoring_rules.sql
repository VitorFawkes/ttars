-- ============================================================================
-- Estela — Seed das regras de scoring editaveis via CRM
-- ============================================================================
-- Popula ai_agent_scoring_rules com:
--   * 7 regras de regiao (destinos do catalogo + mapeamentos Europa)
--   * 5 faixas de valor por convidado (de R$1500 a R$4000+)
--   * 2 sinais indiretos (viagem internacional, referencia casamento premium)
--
-- Admin edita cada peso/threshold depois pela UI do CRM. Idempotente.
-- ============================================================================

DO $$
DECLARE
  v_estela_id UUID;
  v_org_weddings UUID := 'b0000000-0000-0000-0000-000000000002';
BEGIN

  -- Guard: se nao tem tabela, skipa
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_agent_scoring_rules'
  ) THEN
    RAISE NOTICE 'Tabela ai_agent_scoring_rules nao existe. Skipando seed.';
    RETURN;
  END IF;

  -- Busca Estela
  SELECT id INTO v_estela_id FROM ai_agents
  WHERE org_id = v_org_weddings AND nome = 'Estela';

  IF v_estela_id IS NULL THEN
    RAISE NOTICE 'Estela nao existe neste ambiente. Skipando seed de scoring rules.';
    RETURN;
  END IF;

  -- Se ja tem regras, skipa (idempotencia)
  IF EXISTS (SELECT 1 FROM ai_agent_scoring_rules WHERE agent_id = v_estela_id) THEN
    RAISE NOTICE 'Estela ja tem scoring rules. Skipando seed.';
    RETURN;
  END IF;

  -- ===========================================================================
  -- 1. Regras de REGIAO (dimension='regiao')
  -- Input esperado: { "regiao": "Caribe" | "Maldivas" | ... }
  -- ===========================================================================
  INSERT INTO ai_agent_scoring_rules (org_id, agent_id, dimension, condition_type, condition_value, weight, label, ordem, ativa) VALUES
    (v_org_weddings, v_estela_id, 'regiao', 'equals', '{"value": "Caribe"}'::JSONB, 30, 'Caribe (top tier)', 10, true),
    (v_org_weddings, v_estela_id, 'regiao', 'equals', '{"value": "Maldivas"}'::JSONB, 30, 'Maldivas (top tier)', 20, true),
    (v_org_weddings, v_estela_id, 'regiao', 'equals', '{"value": "Nordeste Brasileiro"}'::JSONB, 20, 'Nordeste Brasileiro', 30, true),
    (v_org_weddings, v_estela_id, 'regiao', 'equals', '{"value": "Mendoza"}'::JSONB, 10, 'Mendoza', 40, true),
    (v_org_weddings, v_estela_id, 'regiao', 'equals', '{"value": "Portugal"}'::JSONB, 5, 'Portugal (mapeia Europa)', 50, true),
    (v_org_weddings, v_estela_id, 'regiao', 'equals', '{"value": "Italia"}'::JSONB, 5, 'Italia (mapeia Europa)', 60, true),
    (v_org_weddings, v_estela_id, 'regiao', 'equals', '{"value": "Europa"}'::JSONB, 5, 'Europa (generica)', 70, true);

  -- ===========================================================================
  -- 2. Regras de VALOR POR CONVIDADO (dimension='valor_convidado')
  -- Input esperado: { "valor_convidado": 3200 }
  -- Faixas: R$1500/conv = 5, 2000=10, 2500=15, 3000=15, 3500=25, 4000+=30
  -- ===========================================================================
  INSERT INTO ai_agent_scoring_rules (org_id, agent_id, dimension, condition_type, condition_value, weight, label, ordem, ativa) VALUES
    (v_org_weddings, v_estela_id, 'valor_convidado', 'range', '{"min": 0, "max": 1750}'::JSONB, 5, 'Ate R$ 1.750/conv', 10, true),
    (v_org_weddings, v_estela_id, 'valor_convidado', 'range', '{"min": 1750, "max": 2250}'::JSONB, 10, 'R$ 1.750 a R$ 2.250/conv', 20, true),
    (v_org_weddings, v_estela_id, 'valor_convidado', 'range', '{"min": 2250, "max": 3250}'::JSONB, 15, 'R$ 2.250 a R$ 3.250/conv', 30, true),
    (v_org_weddings, v_estela_id, 'valor_convidado', 'range', '{"min": 3250, "max": 3750}'::JSONB, 25, 'R$ 3.250 a R$ 3.750/conv', 40, true),
    (v_org_weddings, v_estela_id, 'valor_convidado', 'range', '{"min": 3750, "max": null}'::JSONB, 30, 'R$ 3.750/conv ou mais', 50, true);

  -- ===========================================================================
  -- 3. Regras de SINAL INDIRETO (dimension='sinal_indireto')
  -- Input esperado: { "viagem_internacional": true, "referencia_casamento_premium": true }
  -- Cada um soma +5, respeitando cap de max_sinal_bonus (default 10 na config)
  -- ===========================================================================
  INSERT INTO ai_agent_scoring_rules (org_id, agent_id, dimension, condition_type, condition_value, weight, label, ordem, ativa) VALUES
    (v_org_weddings, v_estela_id, 'sinal_indireto', 'boolean_true', '{"field": "viagem_internacional"}'::JSONB, 5, 'Viagem internacional recente (+5)', 10, true),
    (v_org_weddings, v_estela_id, 'sinal_indireto', 'boolean_true', '{"field": "referencia_casamento_premium"}'::JSONB, 5, 'Referencia a casamento premium (+5)', 20, true);

  RAISE NOTICE 'Scoring rules inseridos: 7 regioes + 5 faixas valor + 2 sinais indiretos';
END $$;


-- ============================================================================
-- Teste final: calcula score de um casal-exemplo pra validar a RPC
-- Caribe + R$ 3.125/conv (80 conv, R$ 250k) + viagem internacional = 30+15+5 = 50
-- ============================================================================
DO $$
DECLARE
  v_estela_id UUID;
  v_result JSONB;
BEGIN
  SELECT id INTO v_estela_id FROM ai_agents
  WHERE org_id = 'b0000000-0000-0000-0000-000000000002' AND nome = 'Estela';

  IF v_estela_id IS NULL THEN
    RETURN;
  END IF;

  v_result := calculate_agent_qualification_score(
    v_estela_id,
    '{"regiao": "Caribe", "valor_convidado": 3125, "viagem_internacional": true}'::JSONB
  );

  RAISE NOTICE 'Teste de scoring: %', v_result;
END $$;
