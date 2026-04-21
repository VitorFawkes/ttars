-- ============================================================================
-- Scoring genericizado — qualquer agente da plataforma pode usar
-- ============================================================================
-- Muda o scoring de Estela-especifico pra feature generica da plataforma:
--   1. Remove CHECK constraint rigido em dimension (qualquer nome aceito)
--   2. Adiciona ai_agent_scoring_config.enabled (toggle on/off por agente)
--   3. RPC atualizada pra retornar {enabled: false} se desligado (router respeita)
--
-- Admin agora pode criar qualquer dimensao:
--   * "regiao" (equals)
--   * "valor_convidado" (range)
--   * "sinal_indireto" (boolean_true)
--   * "urgencia_prazo" (range custom)
--   * "tipo_empresa" (equals custom)
--   * qualquer coisa que faca sentido pro dominio do agente
-- ============================================================================

-- ============================================================================
-- 1. Remove CHECK constraint rigido de dimension
-- ============================================================================
ALTER TABLE ai_agent_scoring_rules
  DROP CONSTRAINT IF EXISTS ai_agent_scoring_rules_dimension_check;

-- Mantem validacao minima: dimension nao pode ser vazio
ALTER TABLE ai_agent_scoring_rules
  ADD CONSTRAINT ai_agent_scoring_rules_dimension_not_empty
  CHECK (dimension IS NOT NULL AND length(trim(dimension)) > 0);

-- ============================================================================
-- 2. Toggle enabled em scoring_config
-- ============================================================================
ALTER TABLE ai_agent_scoring_config
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN ai_agent_scoring_config.enabled IS
  'Toggle master: se false, RPC retorna sem calcular e router nao expoe tool calculate_qualification_score.
   Permite admin desligar scoring temporariamente sem deletar as regras.';

-- ============================================================================
-- 3. RPC atualizada pra respeitar o toggle enabled
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
  v_enabled BOOLEAN;
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

  -- 2. Cross-org guard
  v_requesting_org := requesting_org_id();
  IF v_requesting_org IS NOT NULL AND v_requesting_org != v_agent_org_id THEN
    RAISE EXCEPTION 'Cross-org violation: requesting_org_id (%) != agent.org_id (%)',
      v_requesting_org, v_agent_org_id;
  END IF;

  -- 3. Busca config. Se nao existe OU enabled=false, retorna inativo.
  SELECT threshold_qualify, max_sinal_bonus, enabled
    INTO v_threshold, v_max_sinal_bonus, v_enabled
  FROM ai_agent_scoring_config
  WHERE agent_id = p_agent_id;

  IF NOT FOUND OR v_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'score', null,
      'qualificado', null,
      'message', 'Scoring nao configurado ou desabilitado para este agente'
    );
  END IF;

  IF v_threshold IS NULL THEN v_threshold := 25; END IF;
  IF v_max_sinal_bonus IS NULL THEN v_max_sinal_bonus := 10; END IF;

  -- 4. Itera regras ativas
  FOR r_rule IN
    SELECT id, dimension, condition_type, condition_value, weight, label, ordem
    FROM ai_agent_scoring_rules
    WHERE agent_id = p_agent_id AND ativa = true
    ORDER BY dimension, ordem, id
  LOOP
    v_match := false;

    IF r_rule.condition_type = 'equals' THEN
      v_input_value := p_inputs ->> r_rule.dimension;
      IF v_input_value IS NOT NULL
         AND v_input_value = (r_rule.condition_value ->> 'value')
      THEN
        v_match := true;
      END IF;

    ELSIF r_rule.condition_type = 'range' THEN
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
      v_input_boolean := (p_inputs ->> (r_rule.condition_value ->> 'field'))::BOOLEAN;
      IF v_input_boolean IS TRUE THEN
        v_match := true;
      END IF;
    END IF;

    IF v_match THEN
      -- Regras da dimensao "sinal_indireto" respeitam o cap (max_sinal_bonus).
      -- Qualquer outra dimensao soma direto. Admin pode criar dimensoes custom.
      IF r_rule.dimension = 'sinal_indireto' THEN
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

  -- 5. Aplica cap de sinais indiretos
  IF v_sinal_bonus > v_max_sinal_bonus THEN
    v_sinal_bonus := v_max_sinal_bonus;
  END IF;
  v_score := v_score + v_sinal_bonus;

  RETURN jsonb_build_object(
    'enabled', true,
    'score', v_score,
    'threshold', v_threshold,
    'qualificado', v_score >= v_threshold,
    'sinal_bonus_applied', v_sinal_bonus,
    'max_sinal_bonus', v_max_sinal_bonus,
    'breakdown', v_breakdown
  );

END;
$$;

GRANT EXECUTE ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) TO service_role;

COMMENT ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) IS
  'Calcula score generico de qualificacao. Retorna {enabled:false} se agente nao tem config ou config.enabled=false.
   Qualquer agente da plataforma pode usar: admin cria dimensoes e regras via UI sem deploy.';
