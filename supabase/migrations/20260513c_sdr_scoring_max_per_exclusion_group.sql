-- ============================================================================
-- MIGRATION: sdr_atualizar_pontuacao — MAX por exclusion_group em ai_subjective
-- Date: 2026-05-13
--
-- RELEITURA DE PREDECESSORAS (obrigatória — função recriada):
--   - 20260512d_sdr_qualifications.sql: criação inicial (soma todas ai_subjective)
--   - 20260512e_sdr_qualifications_subjective_fix.sql: loop manual de ai_subjective
--     com soma de qualify/bonus + disqualifiers_hit + cap de bonus
-- Esta versão PRESERVA todo o comportamento de 20260512e e adiciona dedupe por
-- exclusion_group (apenas a regra true de MAIOR weight por grupo conta).
--
-- CONTEXTO:
-- LLM da Estela já trata exclusion_group como mutuamente exclusivo via instrução
-- "responda YES para APENAS UMA pergunta" (subjective_evaluator.ts:163). Como o
-- LLM tende a marcar a pergunta mais relevante (que costuma ter mais peso),
-- efetivamente a Estela aplica a regra de maior peso por grupo. A SDR humana
-- até agora marcava UM destino (radio); agora pode marcar VÁRIOS (checkboxes).
-- Pra manter espelhamento, contamos só a de maior peso por grupo.
--
-- O QUE MUDA:
-- 1. Para regras ai_subjective com mesmo exclusion_group resolvidas como true,
--    conta apenas a regra de MAIOR weight (ROW_NUMBER por grupo, ordem por
--    weight DESC, ordem ASC, id ASC).
-- 2. Regras sem exclusion_group: contam direto (sem dedupe).
-- 3. rule_type='disqualify': dispara independente do grupo.
-- 4. Cap de bonus permanece sobre o total combinado.
-- 5. Formato de scoring_inputs ({rule_id: true}) compatível 100%.
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
AS $func$
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
  v_subjective_qualify NUMERIC := 0;
  v_disqualified BOOLEAN := false;
  v_disqualifiers JSONB := '[]'::JSONB;
  v_breakdown JSONB := '[]'::JSONB;
  v_subjective_breakdown JSONB := '[]'::JSONB;
  v_subjective_disqualifiers JSONB := '[]'::JSONB;
  v_subjective_had_disqualify BOOLEAN := false;
  v_rpc_breakdown JSONB;
  v_existing_rpc_score NUMERIC;
  v_final_result JSONB;
  v_bonus_from_rpc NUMERIC;
  v_bonus_combined NUMERIC;
  v_bonus_applied NUMERIC;
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

  -- Passo 1: RPC base (processa só equals/range/boolean_true).
  -- Read-only de ai_agent_*. Preserva semântica do 20260512e.
  v_rpc_result := calculate_agent_qualification_score(v_qual.agent_id, v_new_inputs);

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
  v_threshold := COALESCE((v_rpc_result->>'threshold')::NUMERIC, 25);
  v_max_bonus := COALESCE((v_rpc_result->>'max_sinal_bonus')::NUMERIC, 10);
  v_disqualified := COALESCE((v_rpc_result->>'disqualified')::BOOLEAN, false);
  v_disqualifiers := COALESCE(v_rpc_result->'disqualifiers_hit', '[]'::JSONB);
  v_rpc_breakdown := COALESCE(v_rpc_result->'breakdown', '[]'::JSONB);

  -- Passo 2 (NOVO vs 20260512e): ai_subjective com dedupe MAX por exclusion_group.
  -- Em uma única consulta:
  --   - resolved=true para cada regra ai_subjective
  --   - ROW_NUMBER particionado por (exclusion_group, rule_type) com ordem por
  --     weight DESC. Apenas rnk=1 conta para qualify/bonus.
  --   - regras sem exclusion_group: contam sempre (rnk=1 forçado).
  --   - disqualify: conta sempre, sem dedupe.
  WITH active_subjective AS (
    SELECT r.id, r.dimension, r.label, r.rule_type, r.weight,
           r.exclusion_group, r.ordem,
           COALESCE((v_new_inputs->>r.id::TEXT)::BOOLEAN, false) AS resolved
    FROM ai_agent_scoring_rules r
    WHERE r.agent_id = v_qual.agent_id
      AND r.ativa = true
      AND r.condition_type = 'ai_subjective'
  ),
  resolved_true AS (
    SELECT * FROM active_subjective WHERE resolved = true
  ),
  ranked AS (
    SELECT r.*,
      CASE
        WHEN r.rule_type = 'disqualify' THEN 1
        WHEN r.exclusion_group IS NULL OR r.exclusion_group = '' THEN 1
        ELSE ROW_NUMBER() OVER (
          PARTITION BY r.exclusion_group, r.rule_type
          ORDER BY r.weight DESC NULLS LAST, r.ordem ASC, r.id ASC
        )
      END AS rnk
    FROM resolved_true r
  )
  SELECT
    COALESCE(SUM(CASE WHEN rule_type = 'bonus'   AND rnk = 1 THEN COALESCE(weight,0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN rule_type = 'qualify' AND rnk = 1 THEN COALESCE(weight,0) ELSE 0 END), 0),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'dimension', dimension,
        'label', COALESCE(label, dimension),
        'weight', weight,
        'rule_id', id,
        'rule_type', rule_type,
        'exclusion_group', exclusion_group,
        'source', 'ai_subjective'
      )
      ORDER BY rule_type, ordem
    ) FILTER (WHERE rule_type IN ('qualify','bonus') AND rnk = 1), '[]'::JSONB),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'dimension', dimension,
        'label', COALESCE(label, dimension),
        'rule_id', id,
        'source', 'ai_subjective'
      )
      ORDER BY ordem
    ) FILTER (WHERE rule_type = 'disqualify'), '[]'::JSONB),
    COALESCE(BOOL_OR(rule_type = 'disqualify'), false)
  INTO v_bonus_total, v_subjective_qualify, v_subjective_breakdown,
       v_subjective_disqualifiers, v_subjective_had_disqualify
  FROM ranked;

  -- Passo 3: combina RPC base + ai_subjective.
  --   - tira o bonus que a RPC já somou em v_existing_rpc_score; combina com
  --     bonus subjective; aplica cap; soma de volta.
  --   - qualify subjective entra direto.
  --   - breakdown concatena RPC + subjective.
  --   - disqualifiers concatena RPC + subjective.
  v_bonus_from_rpc := COALESCE((v_rpc_result->>'sinal_bonus_applied')::NUMERIC, 0);
  v_score := v_existing_rpc_score - v_bonus_from_rpc + v_subjective_qualify;
  v_breakdown := v_rpc_breakdown || v_subjective_breakdown;

  IF v_subjective_had_disqualify THEN
    v_disqualified := true;
    v_disqualifiers := COALESCE(v_disqualifiers, '[]'::JSONB) || v_subjective_disqualifiers;
  END IF;

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
$func$;

GRANT EXECUTE ON FUNCTION sdr_atualizar_pontuacao(UUID, JSONB, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION sdr_atualizar_pontuacao(UUID, JSONB, JSONB, TEXT) TO service_role;

COMMENT ON FUNCTION sdr_atualizar_pontuacao IS
  'V3 (20260513c): MAX por exclusion_group em regras ai_subjective. Espelha o "single match" da Estela (instrução LLM: responda YES para APENAS UMA por grupo). Disqualify sem dedupe. Cap de bonus combinado mantido.';
