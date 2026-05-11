-- ============================================================================
-- MIGRATION: rascunho de pontuação SDR pode existir sem âncora
-- Date: 2026-05-12
--
-- Antes: CHECK exigia ao menos um de (contato_id, card_id, telefone_normalizado)
-- mesmo em rascunho. Bloqueava o caso "SDR só abre pra anotar e atrelar depois".
--
-- Agora: rascunho pode ter tudo NULL. Finalizado/descartado continua exigindo
-- ao menos uma âncora (pra garantir que dado registrado tenha a quem se referir).
-- Preserva todas as correções de 20260512d e 20260512g (mapping ww_*, etc).
-- ============================================================================

BEGIN;

ALTER TABLE sdr_qualifications
  DROP CONSTRAINT IF EXISTS chk_sdr_qual_anchor;

ALTER TABLE sdr_qualifications
  ADD CONSTRAINT chk_sdr_qual_anchor CHECK (
    status = 'rascunho'
    OR contato_id IS NOT NULL
    OR card_id IS NOT NULL
    OR telefone_normalizado IS NOT NULL
  );

-- iniciar: remove a exigência de âncora na criação (rascunho pode ser órfão)
CREATE OR REPLACE FUNCTION sdr_iniciar_pontuacao(
  p_agent_id UUID,
  p_contato_id UUID DEFAULT NULL,
  p_card_id UUID DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_org_id UUID;
  v_agent_org UUID;
  v_user_id UUID;
  v_id UUID;
  v_phone_norm TEXT;
  v_rules JSONB;
  v_config JSONB;
  v_rules_version TEXT;
  v_estela_score JSONB;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: requesting_org_id eh NULL';
  END IF;
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: usuario nao autenticado';
  END IF;
  SELECT org_id INTO v_agent_org FROM ai_agents WHERE id = p_agent_id;
  IF v_agent_org IS NULL THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: agent_id % nao existe', p_agent_id;
  END IF;
  IF v_agent_org != v_org_id THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: agent pertence a outra org';
  END IF;

  v_phone_norm := sdr_normalize_phone(p_telefone);
  v_rules_version := sdr_compute_rules_version(p_agent_id);

  INSERT INTO sdr_qualifications (
    org_id, agent_id, rules_version, contato_id, card_id,
    telefone_normalizado, sdr_user_id, status
  ) VALUES (
    v_org_id, p_agent_id, v_rules_version, p_contato_id, p_card_id,
    v_phone_norm, v_user_id, 'rascunho'
  ) RETURNING id INTO v_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id, 'dimension', dimension, 'label', label,
      'rule_type', rule_type, 'condition_type', condition_type,
      'condition_value', condition_value, 'weight', weight,
      'exclusion_group', exclusion_group, 'ordem', ordem
    ) ORDER BY rule_type, ordem
  ) INTO v_rules
  FROM ai_agent_scoring_rules
  WHERE agent_id = p_agent_id AND ativa = true;

  SELECT jsonb_build_object(
    'enabled', enabled,
    'threshold_qualify', threshold_qualify,
    'max_sinal_bonus', max_sinal_bonus,
    'fallback_action', fallback_action
  ) INTO v_config
  FROM ai_agent_scoring_config
  WHERE agent_id = p_agent_id;

  IF p_card_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'score', qualification_score_at_turn,
      'turn_at', created_at
    ) INTO v_estela_score
    FROM ai_conversation_turns
    WHERE agent_id = p_agent_id
      AND qualification_score_at_turn IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'rules', COALESCE(v_rules, '[]'::JSONB),
    'config', COALESCE(v_config, '{}'::JSONB),
    'rules_version', v_rules_version,
    'estela_score_recente', v_estela_score
  );
END;
$func$;

-- finalizar: exige âncora no momento de fechar (preserva mapping ww_* de 20260512g)
CREATE OR REPLACE FUNCTION sdr_finalizar_pontuacao(
  p_id UUID,
  p_notas TEXT DEFAULT NULL,
  p_merge_strategy TEXT DEFAULT 'preserve'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
  v_card RECORD;
  v_new_produto_data JSONB;
  v_dados JSONB;
  v_key TEXT;
  v_value JSONB;
  v_should_write BOOLEAN;
  v_target_key TEXT;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: requesting_org_id NULL';
  END IF;
  IF p_merge_strategy NOT IN ('preserve', 'overwrite', 'update_if_newer') THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: merge_strategy invalido: %', p_merge_strategy;
  END IF;

  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: pontuacao % nao existe', p_id;
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: cross-org violation';
  END IF;
  IF v_qual.status != 'rascunho' THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: pontuacao ja %', v_qual.status;
  END IF;

  IF v_qual.contato_id IS NULL
     AND v_qual.card_id IS NULL
     AND v_qual.telefone_normalizado IS NULL THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: pontuacao sem ancora -- informe pelo menos telefone, contato ou card antes de registrar'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE sdr_qualifications
  SET status = 'finalizado',
      finalized_at = NOW(),
      notas = COALESCE(p_notas, notas),
      rules_version = sdr_compute_rules_version(agent_id)
  WHERE id = p_id;

  IF v_qual.card_id IS NOT NULL AND v_qual.dados_lead != '{}'::JSONB THEN
    SELECT id, produto_data FROM cards WHERE id = v_qual.card_id INTO v_card;
    v_new_produto_data := COALESCE(v_card.produto_data, '{}'::JSONB);
    v_dados := v_qual.dados_lead;

    FOR v_key, v_value IN SELECT * FROM jsonb_each(v_dados) LOOP
      v_target_key := CASE v_key
        WHEN 'data_casamento'      THEN 'ww_data_casamento'
        WHEN 'num_convidados'      THEN 'ww_num_convidados'
        WHEN 'investimento_total'  THEN 'ww_sdr_orcamento'
        WHEN 'destino_desejado'    THEN 'ww_destino'
        WHEN 'nome_parceiro'       THEN 'ww_nome_parceiro'
        WHEN 'nome_casal'          THEN NULL
        WHEN 'telefone'            THEN NULL
        WHEN 'email'               THEN NULL
        WHEN 'observacoes'         THEN NULL
        ELSE v_key
      END;

      IF v_target_key IS NULL THEN CONTINUE; END IF;
      IF v_value IS NULL OR v_value = 'null'::JSONB OR v_value::TEXT = '""' THEN CONTINUE; END IF;

      v_should_write := false;
      IF p_merge_strategy = 'overwrite' THEN
        v_should_write := true;
      ELSIF p_merge_strategy = 'preserve' THEN
        v_should_write := (v_new_produto_data->v_target_key IS NULL
          OR v_new_produto_data->>v_target_key = ''
          OR v_new_produto_data->>v_target_key = 'null');
      ELSIF p_merge_strategy = 'update_if_newer' THEN
        v_should_write := true;
      END IF;

      IF v_should_write THEN
        v_new_produto_data := jsonb_set(v_new_produto_data, ARRAY[v_target_key], v_value);
      END IF;
    END LOOP;

    UPDATE cards SET produto_data = v_new_produto_data, updated_at = NOW()
    WHERE id = v_qual.card_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integration_outbox') THEN
    BEGIN
      INSERT INTO integration_outbox (
        topic, payload, status, created_at
      ) VALUES (
        'sdr_qualification.finalized',
        jsonb_build_object(
          'qualification_id', p_id,
          'org_id', v_qual.org_id,
          'card_id', v_qual.card_id,
          'contato_id', v_qual.contato_id,
          'agent_id', v_qual.agent_id,
          'score_result', (SELECT score_result FROM sdr_qualifications WHERE id = p_id),
          'sdr_user_id', v_qual.sdr_user_id,
          'finalized_at', NOW()
        ),
        'pending',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'id', p_id,
    'status', 'finalizado',
    'score_result', (SELECT score_result FROM sdr_qualifications WHERE id = p_id)
  );
END;
$func$;

COMMIT;
