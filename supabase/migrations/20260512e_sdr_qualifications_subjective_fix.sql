-- ============================================================================
-- MIGRATION: Fix do espelhamento Estela ↔ SDR humana — regras ai_subjective
-- Date: 2026-05-12
--
-- RESTRIÇÃO INVIOLÁVEL: ZERO TOQUE em tabelas/funções ai_agent_*.
-- Esta migration apenas SUBSTITUI sdr_atualizar_pontuacao (RPC criada em
-- 20260512d) para replicar a lógica de soma manual de regras ai_subjective
-- que vive em persona_v2.ts (linhas 1269-1287) — o espelho literal exige
-- que a SDR humana e a Estela cheguem ao mesmo score.
--
-- Diferença vs versão anterior:
--   - Formato de scoring_inputs muda de {dimension: true} para
--     {rule_id: true/false} — alinhado com o output de evaluateSubjectiveRules.
--     SDR humana resolve cada regra direto (radio/toggle/calculo).
--   - Após chamar calculate_agent_qualification_score (que processa só
--     equals/range/boolean_true), iteramos as regras ai_subjective ativas e
--     somamos pesos das resolvidas como true. Aplicamos cap de bonus.
-- ============================================================================

CREATE OR REPLACE FUNCTION sdr_atualizar_pontuacao(
  p_id UUID,
  p_dados_lead JSONB DEFAULT NULL,
  p_scoring_inputs JSONB DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
  v_rpc_result JSONB;
  v_new_inputs JSONB;
  v_new_dados JSONB;
  v_score NUMERIC;
  v_threshold NUMERIC;
  v_max_bonus NUMERIC;
  v_bonus_total NUMERIC := 0;
  v_disqualified BOOLEAN := false;
  v_disqualifiers JSONB := '[]'::JSONB;
  v_breakdown JSONB := '[]'::JSONB;
  v_rpc_breakdown JSONB;
  r_rule RECORD;
  v_resolved BOOLEAN;
  v_existing_rpc_score NUMERIC;
  v_final_result JSONB;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'sdr_atualizar_pontuacao: requesting_org_id NULL';
  END IF;

  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_atualizar_pontuacao: pontuacao % nao existe', p_id;
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_atualizar_pontuacao: cross-org violation';
  END IF;
  IF v_qual.status != 'rascunho' THEN
    RAISE EXCEPTION 'sdr_atualizar_pontuacao: pontuacao ja % (so rascunho pode ser editado)', v_qual.status;
  END IF;

  v_new_inputs := COALESCE(p_scoring_inputs, v_qual.scoring_inputs);
  v_new_dados := COALESCE(p_dados_lead, v_qual.dados_lead);

  -- Passo 1: chama a RPC existente (calcula só equals/range/boolean_true)
  -- A RPC nao toca em ai_agent_* (read-only ja garantido).
  v_rpc_result := calculate_agent_qualification_score(v_qual.agent_id, v_new_inputs);

  -- Se RPC retornou enabled=false, replica
  IF (v_rpc_result->>'enabled')::BOOLEAN IS NOT TRUE THEN
    UPDATE sdr_qualifications
    SET scoring_inputs = v_new_inputs,
        dados_lead = v_new_dados,
        score_result = v_rpc_result,
        notas = COALESCE(p_notas, notas),
        updated_at = NOW()
    WHERE id = p_id;
    RETURN jsonb_build_object('id', p_id, 'score_result', v_rpc_result);
  END IF;

  v_existing_rpc_score := COALESCE((v_rpc_result->>'score')::NUMERIC, 0);
  v_score := v_existing_rpc_score;
  v_threshold := COALESCE((v_rpc_result->>'threshold')::NUMERIC, 25);
  v_max_bonus := COALESCE((v_rpc_result->>'max_sinal_bonus')::NUMERIC, 10);
  v_disqualified := COALESCE((v_rpc_result->>'disqualified')::BOOLEAN, false);
  v_disqualifiers := COALESCE(v_rpc_result->'disqualifiers_hit', '[]'::JSONB);
  v_rpc_breakdown := COALESCE(v_rpc_result->'breakdown', '[]'::JSONB);
  v_breakdown := v_rpc_breakdown;

  -- Passo 2: itera regras ai_subjective ativas e soma manualmente
  -- (mesma logica de persona_v2.ts:1269-1287, em SQL — espelho literal)
  -- p_scoring_inputs deve trazer { "<rule_id>": true } pra cada regra "ativada" pela SDR.
  FOR r_rule IN
    SELECT id, dimension, label, rule_type, condition_type, condition_value, weight, exclusion_group, ordem
    FROM ai_agent_scoring_rules
    WHERE agent_id = v_qual.agent_id
      AND ativa = true
      AND condition_type = 'ai_subjective'
    ORDER BY rule_type, ordem, id
  LOOP
    -- SDR humana resolve a regra direto. Lookup por UUID da rule.
    v_resolved := COALESCE((v_new_inputs->>r_rule.id::TEXT)::BOOLEAN, false);
    IF NOT v_resolved THEN CONTINUE; END IF;

    IF r_rule.rule_type = 'disqualify' THEN
      v_disqualified := true;
      v_disqualifiers := v_disqualifiers || jsonb_build_object(
        'dimension', r_rule.dimension,
        'label', COALESCE(r_rule.label, r_rule.dimension),
        'rule_id', r_rule.id,
        'source', 'ai_subjective'
      );
    ELSIF r_rule.rule_type = 'bonus' THEN
      v_bonus_total := v_bonus_total + COALESCE(r_rule.weight, 0);
      v_breakdown := v_breakdown || jsonb_build_object(
        'dimension', r_rule.dimension,
        'label', COALESCE(r_rule.label, r_rule.dimension),
        'weight', r_rule.weight,
        'rule_id', r_rule.id,
        'rule_type', 'bonus',
        'source', 'ai_subjective'
      );
    ELSE
      -- rule_type = 'qualify' (default)
      v_score := v_score + COALESCE(r_rule.weight, 0);
      v_breakdown := v_breakdown || jsonb_build_object(
        'dimension', r_rule.dimension,
        'label', COALESCE(r_rule.label, r_rule.dimension),
        'weight', r_rule.weight,
        'rule_id', r_rule.id,
        'rule_type', 'qualify',
        'source', 'ai_subjective'
      );
    END IF;
  END LOOP;

  -- Passo 3: aplica cap de bonus e soma
  -- (Note: bonus da RPC ja foi somado em v_existing_rpc_score; precisamos
  -- considerar bonus combinado. Cap eh sobre o total.)
  DECLARE
    v_bonus_from_rpc NUMERIC;
    v_bonus_combined NUMERIC;
    v_bonus_applied NUMERIC;
  BEGIN
    v_bonus_from_rpc := COALESCE((v_rpc_result->>'sinal_bonus_applied')::NUMERIC, 0);
    -- Desconta o bonus que ja foi somado na RPC (so somaremos o "raw" combinado capeado)
    v_score := v_score - v_bonus_from_rpc;
    v_bonus_combined := v_bonus_from_rpc + v_bonus_total;
    IF v_bonus_combined > v_max_bonus THEN
      v_bonus_applied := v_max_bonus;
    ELSE
      v_bonus_applied := v_bonus_combined;
    END IF;
    v_score := v_score + v_bonus_applied;

    v_final_result := jsonb_build_object(
      'enabled', true,
      'score', v_score,
      'threshold', v_threshold,
      'qualificado', NOT v_disqualified AND v_score >= v_threshold,
      'disqualified', v_disqualified,
      'disqualifiers_hit', v_disqualifiers,
      'sinal_bonus_applied', v_bonus_applied,
      'max_sinal_bonus', v_max_bonus,
      'breakdown', v_breakdown
    );
  END;

  UPDATE sdr_qualifications
  SET scoring_inputs = v_new_inputs,
      dados_lead = v_new_dados,
      score_result = v_final_result,
      notas = COALESCE(p_notas, notas),
      updated_at = NOW()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'score_result', v_final_result,
    'scoring_inputs', v_new_inputs,
    'dados_lead', v_new_dados
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sdr_atualizar_pontuacao(UUID, JSONB, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION sdr_atualizar_pontuacao(UUID, JSONB, JSONB, TEXT) TO service_role;

COMMENT ON FUNCTION sdr_atualizar_pontuacao IS
  'Atualiza pontuacao SDR. scoring_inputs eh JSONB no formato {rule_id: bool} pra regras ai_subjective + chaves nativas pra equals/range/boolean_true. Replica em SQL a logica de persona_v2.ts:1269-1287 (soma manual de regras ai_subjective).';
