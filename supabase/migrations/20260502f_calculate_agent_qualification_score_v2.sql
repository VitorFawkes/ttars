-- ============================================================================
-- MIGRATION: RPC calculate_agent_qualification_score estendida pra v2
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2.
--
-- Estende a RPC existente (última versão em 20260421g_scoring_genericize.sql)
-- pra suportar rule_type='disqualify' (adicionado em 20260502e).
--
-- Mudanças:
--   1. Itera PRIMEIRO as regras disqualify. Se qualquer uma bater, retorna
--      imediatamente { qualificado: false, disqualified: true, reason }.
--   2. Usa rule_type no lugar de dimension='sinal_indireto' pra categorizar
--      bonus (preserva semantic antiga via backfill feito em 20260502e).
--   3. breakdown agora inclui rule_type pra UI classificar visualmente.
--
-- SEM MUDANÇA DE ASSINATURA: mesma signature (p_agent_id, p_inputs),
-- mesmo shape de retorno acrescido de campos opcionais. Compat 100% com
-- consumidores existentes (router + TabPontuacao + simulator).
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
  v_disqualifiers_hit JSONB := '[]'::JSONB;
  r_rule RECORD;
  v_match BOOLEAN;
  v_input_value TEXT;
  v_input_numeric NUMERIC;
  v_input_boolean BOOLEAN;
  v_range_min NUMERIC;
  v_range_max NUMERIC;
BEGIN
  -- 1. Busca agente + valida org
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

  -- 3. Busca config
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

  -- 4. PRIMEIRO: avalia regras disqualify. Qualquer match = hard stop.
  FOR r_rule IN
    SELECT id, dimension, condition_type, condition_value, weight, label, ordem, rule_type
    FROM ai_agent_scoring_rules
    WHERE agent_id = p_agent_id AND ativa = true AND rule_type = 'disqualify'
    ORDER BY dimension, ordem, id
  LOOP
    v_match := false;

    IF r_rule.condition_type = 'equals' THEN
      v_input_value := p_inputs ->> r_rule.dimension;
      IF v_input_value IS NOT NULL AND v_input_value = (r_rule.condition_value ->> 'value') THEN
        v_match := true;
      END IF;
    ELSIF r_rule.condition_type = 'range' THEN
      v_input_numeric := (p_inputs ->> r_rule.dimension)::NUMERIC;
      IF v_input_numeric IS NOT NULL THEN
        v_range_min := (r_rule.condition_value ->> 'min')::NUMERIC;
        v_range_max := (r_rule.condition_value ->> 'max')::NUMERIC;
        IF (v_range_min IS NULL OR v_input_numeric >= v_range_min)
           AND (v_range_max IS NULL OR v_input_numeric < v_range_max) THEN
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
      v_disqualifiers_hit := v_disqualifiers_hit || jsonb_build_object(
        'dimension', r_rule.dimension,
        'label', COALESCE(r_rule.label, r_rule.dimension),
        'rule_id', r_rule.id
      );
    END IF;
  END LOOP;

  -- Se qualquer disqualifier bateu, hard stop
  IF jsonb_array_length(v_disqualifiers_hit) > 0 THEN
    RETURN jsonb_build_object(
      'enabled', true,
      'score', 0,
      'threshold', v_threshold,
      'qualificado', false,
      'disqualified', true,
      'disqualifiers_hit', v_disqualifiers_hit,
      'message', 'Lead desqualificado por uma ou mais regras hard-stop'
    );
  END IF;

  -- 5. Itera qualify + bonus rules
  FOR r_rule IN
    SELECT id, dimension, condition_type, condition_value, weight, label, ordem, rule_type
    FROM ai_agent_scoring_rules
    WHERE agent_id = p_agent_id
      AND ativa = true
      AND rule_type IN ('qualify', 'bonus')
    ORDER BY rule_type, dimension, ordem, id
  LOOP
    v_match := false;

    IF r_rule.condition_type = 'equals' THEN
      v_input_value := p_inputs ->> r_rule.dimension;
      IF v_input_value IS NOT NULL AND v_input_value = (r_rule.condition_value ->> 'value') THEN
        v_match := true;
      END IF;
    ELSIF r_rule.condition_type = 'range' THEN
      v_input_numeric := (p_inputs ->> r_rule.dimension)::NUMERIC;
      IF v_input_numeric IS NOT NULL THEN
        v_range_min := (r_rule.condition_value ->> 'min')::NUMERIC;
        v_range_max := (r_rule.condition_value ->> 'max')::NUMERIC;
        IF (v_range_min IS NULL OR v_input_numeric >= v_range_min)
           AND (v_range_max IS NULL OR v_input_numeric < v_range_max) THEN
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
      -- rule_type='bonus' respeita cap. rule_type='qualify' soma direto.
      IF r_rule.rule_type = 'bonus' THEN
        v_sinal_bonus := v_sinal_bonus + r_rule.weight;
      ELSE
        v_score := v_score + r_rule.weight;
      END IF;

      v_breakdown := v_breakdown || jsonb_build_object(
        'dimension', r_rule.dimension,
        'label', COALESCE(r_rule.label, r_rule.dimension),
        'weight', r_rule.weight,
        'rule_id', r_rule.id,
        'rule_type', r_rule.rule_type
      );
    END IF;
  END LOOP;

  -- 6. Aplica cap de bonus e soma
  IF v_sinal_bonus > v_max_sinal_bonus THEN
    v_sinal_bonus := v_max_sinal_bonus;
  END IF;
  v_score := v_score + v_sinal_bonus;

  RETURN jsonb_build_object(
    'enabled', true,
    'score', v_score,
    'threshold', v_threshold,
    'qualificado', v_score >= v_threshold,
    'disqualified', false,
    'sinal_bonus_applied', v_sinal_bonus,
    'max_sinal_bonus', v_max_sinal_bonus,
    'breakdown', v_breakdown
  );

END;
$$;

-- Grants permanecem iguais (já existentes de migrations anteriores, mas re-declarando por segurança)
GRANT EXECUTE ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) TO service_role;

COMMENT ON FUNCTION calculate_agent_qualification_score(UUID, JSONB) IS
  'V2: calcula score respeitando rule_type (qualify/disqualify/bonus). Se qualquer disqualify bate, retorna imediatamente qualificado=false com disqualifiers_hit. Senão, soma qualify + bonus (bonus com cap). Compat 100% com v1 — backfill em 20260502e garante sinal_indireto => bonus.';
