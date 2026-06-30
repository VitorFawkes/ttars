-- ============================================================================
-- MIGRATION: SDR scoring — 2 novos desqualificadores + remove "premium"
-- Date: 2026-06-30
--
-- CONTEXTO:
-- A tela /sdr/pontuacoes ("Qualificar lead") usa EXATAMENTE a régua do agente
-- ativo de Weddings (Patricia, 4d96d9b4-...). O cálculo server-side
-- (sdr_atualizar_pontuacao, 20260513c — Passo 2) só reconhece desqualificadores
-- que existam como regra rule_type='disqualify' + condition_type='ai_subjective'.
-- Padrão canônico vivo: 'destino_fora_catalogo_sem_flex'.
--
-- O QUE MUDA (3 ajustes de produto pedidos pelo Vitor):
-- 1. Novo desqualificador manual: "Abaixo de R$ 50 mil de investimento".
--    Inclui formula 'budget_below' (value=50000) → a Patricia avalia
--    deterministicamente do orçamento coletado (subjective_evaluator.ts);
--    a SDR humana marca no botão. ESTRITO: 50k não é abaixo de 50k.
-- 2. Novo desqualificador manual: "Casal internacional".
--    Sem fórmula → a Patricia avalia via LLM; a SDR humana marca no botão.
-- 3. Desativa o bônus subjetivo "referencia_casamento_premium" (a pergunta
--    "Casal demonstra circulação em meio premium / referência cultural?").
--    Removido da tela E da régua pra manter "mesma régua que a Patricia"
--    coerente. Patricia está ativa=false → sem impacto em produção live.
--
-- Idempotente: re-rodar não duplica regra nem reverte estados já aplicados.
-- ============================================================================

DO $$
DECLARE
  v_agent_id UUID := '4d96d9b4-e909-4441-bd85-d3f807cccfa7';  -- Patricia (Weddings)
  v_org_id   UUID;
BEGIN
  -- Resolve org do agente (não hardcode — pega do próprio registro).
  SELECT org_id INTO v_org_id FROM ai_agents WHERE id = v_agent_id;
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'Agente % não existe neste ambiente. Skipando.', v_agent_id;
    RETURN;
  END IF;

  -- 1. Desqualificador: investimento total abaixo de R$ 50 mil ------------------
  IF NOT EXISTS (
    SELECT 1 FROM ai_agent_scoring_rules
    WHERE agent_id = v_agent_id AND dimension = 'investimento_abaixo_50k'
  ) THEN
    INSERT INTO ai_agent_scoring_rules
      (org_id, agent_id, dimension, condition_type, condition_value, weight, label, ordem, ativa, rule_type, exclusion_group)
    VALUES (
      v_org_id, v_agent_id, 'investimento_abaixo_50k', 'ai_subjective',
      '{"formula": "budget_below", "value": 50000, "question": "O investimento total declarado pelo casal está abaixo de R$ 50.000 (estritamente menor que 50 mil)?"}'::JSONB,
      0, 'Abaixo de R$ 50 mil de investimento', 102, true, 'disqualify', NULL
    );
    RAISE NOTICE 'Inserido desqualificador investimento_abaixo_50k';
  END IF;

  -- 2. Desqualificador: casal internacional ------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM ai_agent_scoring_rules
    WHERE agent_id = v_agent_id AND dimension = 'casal_internacional'
  ) THEN
    INSERT INTO ai_agent_scoring_rules
      (org_id, agent_id, dimension, condition_type, condition_value, weight, label, ordem, ativa, rule_type, exclusion_group)
    VALUES (
      v_org_id, v_agent_id, 'casal_internacional', 'ai_subjective',
      '{"question": "O casal mora fora do Brasil ou é um casal internacional (residente no exterior), de modo que a jornada presencial Welcome Weddings não se aplica a eles?"}'::JSONB,
      0, 'Casal internacional', 103, true, 'disqualify', NULL
    );
    RAISE NOTICE 'Inserido desqualificador casal_internacional';
  END IF;

  -- 3. Desativa o bônus subjetivo "circulação em meio premium" ------------------
  UPDATE ai_agent_scoring_rules
  SET ativa = false, updated_at = NOW()
  WHERE agent_id = v_agent_id
    AND dimension = 'referencia_casamento_premium'
    AND ativa = true;

END $$;
