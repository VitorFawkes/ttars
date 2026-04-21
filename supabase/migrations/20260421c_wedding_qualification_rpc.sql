-- ============================================================================
-- Estela — RPC para calcular score de qualificacao dinamicamente
-- ============================================================================
-- RPC calculate_agent_qualification_score(p_agent_id, p_inputs JSONB)
--   Le as regras de ai_agent_scoring_rules do agente, aplica aos inputs,
--   soma os pesos por dimensao, adiciona bonus de sinais indiretos
--   (respeitando max_sinal_bonus), retorna score + breakdown + qualificado.
--
-- Exemplo de chamada:
--   SELECT calculate_agent_qualification_score(
--     'uuid-estela'::UUID,
--     '{
--        "destino": "Caribe",
--        "valor_convidado": 3200,
--        "viagem_internacional": true,
--        "referencia_casamento_premium": false
--     }'::JSONB
--   );
--
-- Retorna:
--   {
--     "score": 50,
--     "threshold": 25,
--     "qualificado": true,
--     "breakdown": [
--       {"dimension": "regiao", "label": "Caribe", "weight": 30},
--       {"dimension": "valor_convidado", "label": "R$3000-3499/conv", "weight": 15},
--       {"dimension": "sinal_indireto", "label": "Viagem internacional", "weight": 5}
--     ]
--   }
--
-- SECURITY DEFINER: roda com privilegios elevados, mas filtra por org_id
-- do agente (nao permite calcular score de agente de outra org).
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_agent_qualification_score(
  p_agent_id UUID,
  p_inputs JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_org_id UUID;
  v_requesting_org UUID;
  v_threshold NUMERIC;
  v_max_sinal_bonus NUMERIC;
  v_score NUMERIC := 0;
  v_sinal_bonus NUMERIC := 0;
  v_breakdown JSONB := '[]'::JSONB;
  r_rule RECORD;
  v_match BOOLEAN;
  v_input_value TEXT;
  v_input_numeric NUMERIC;
  v_input_boolean BOOLEAN;
  v_range_min NUMERIC;
  v_range_max NUMERIC;
BEGIN
  -- 1. Busca o agente e valida org_id
  SELECT org_id INTO v_agent_org_id FROM ai_agents WHERE id = p_agent_id;
  IF v_agent_org_id IS NULL THEN
    RAISE EXCEPTION 'Agent % nao existe', p_agent_id;
  END IF;

  -- 2. Valida que o chamador pertence a mesma org (defesa cross-org)
  v_requesting_org := requesting_org_id();
  IF v_requesting_org IS NOT NULL AND v_requesting_org != v_agent_org_id THEN
    RAISE EXCEPTION 'Cross-org violation: requesting_org_id (%) != agent.org_id (%)',
      v_requesting_org, v_agent_org_id;
  END IF;

  -- 3. Busca config do agente (threshold, max sinal)
  SELECT threshold_qualify, max_sinal_bonus
    INTO v_threshold, v_max_sinal_bonus
  FROM ai_agent_scoring_config
  WHERE agent_id = p_agent_id;

  IF v_threshold IS NULL THEN
    v_threshold := 25;
  END IF;
  IF v_max_sinal_bonus IS NULL THEN
    v_max_sinal_bonus := 10;
  END IF;

  -- 4. Itera regras ativas do agente em ordem
  FOR r_rule IN
    SELECT id, dimension, condition_type, condition_value, weight, label, ordem
    FROM ai_agent_scoring_rules
    WHERE agent_id = p_agent_id AND ativa = true
    ORDER BY dimension, ordem, id
  LOOP
    v_match := false;

    -- Avalia a condicao conforme o tipo
    IF r_rule.condition_type = 'equals' THEN
      -- Compara string exata no input
      -- Ex: { "value": "Caribe" } com input.destino = "Caribe"
      -- Convencao: dimension = nome da chave do input
      v_input_value := p_inputs ->> r_rule.dimension;
      IF v_input_value IS NOT NULL
         AND v_input_value = (r_rule.condition_value ->> 'value')
      THEN
        v_match := true;
      END IF;

    ELSIF r_rule.condition_type = 'range' THEN
      -- Compara faixa numerica
      -- Ex: { "min": 3500, "max": null } com input.valor_convidado = 3700
      v_input_numeric := (p_inputs ->> r_rule.dimension)::NUMERIC;
      IF v_input_numeric IS NOT NULL THEN
        v_range_min := (r_rule.condition_value ->> 'min')::NUMERIC;
        v_range_max := (r_rule.condition_value ->> 'max')::NUMERIC;
        IF (v_range_min IS NULL OR v_input_numeric >= v_range_min)
           AND (v_range_max IS NULL OR v_input_numeric < v_range_max)
        THEN
          v_match := true;
        END IF;
      END IF;

    ELSIF r_rule.condition_type = 'boolean_true' THEN
      -- Checa se o campo booleano eh true
      -- Ex: { "field": "viagem_internacional" }
      v_input_boolean := (p_inputs ->> (r_rule.condition_value ->> 'field'))::BOOLEAN;
      IF v_input_boolean IS TRUE THEN
        v_match := true;
      END IF;
    END IF;

    -- Se regra casou, soma peso e registra no breakdown
    IF v_match THEN
      IF r_rule.dimension = 'sinal_indireto' THEN
        -- Sinais indiretos tem cap (max_sinal_bonus)
        v_sinal_bonus := v_sinal_bonus + r_rule.weight;
      ELSE
        v_score := v_score + r_rule.weight;
      END IF;

      v_breakdown := v_breakdown || jsonb_build_object(
        'dimension', r_rule.dimension,
        'label', COALESCE(r_rule.label, r_rule.dimension),
        'weight', r_rule.weight,
        'rule_id', r_rule.id
      );
    END IF;

  END LOOP;

  -- 5. Aplica cap de sinais indiretos e soma ao score
  IF v_sinal_bonus > v_max_sinal_bonus THEN
    v_sinal_bonus := v_max_sinal_bonus;
  END IF;
  v_score := v_score + v_sinal_bonus;

  -- 6. Retorna resultado
  RETURN jsonb_build_object(
    'score', v_score,
    'threshold', v_threshold,
    'qualificado', v_score >= v_threshold,
    'sinal_bonus_applied', v_sinal_bonus,
    'max_sinal_bonus', v_max_sinal_bonus,
    'breakdown', v_breakdown
  );

END;
$$;

COMMENT ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) IS
  'Calcula score de qualificacao dinamicamente baseado em ai_agent_scoring_rules.
   Usada pela Estela (Luna Edge Function) durante a conversa via tool calculate_qualification_score.
   SECURITY DEFINER + valida cross-org.';

GRANT EXECUTE ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) TO service_role;
