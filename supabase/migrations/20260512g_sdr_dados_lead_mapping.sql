-- Fix: mapeamento de dados_lead → cards.produto_data com chaves WEDDING corretas
-- Não toca em nada de agente IA. Só substitui sdr_finalizar_pontuacao.

CREATE OR REPLACE FUNCTION sdr_finalizar_pontuacao(
  p_id UUID,
  p_notas TEXT DEFAULT NULL,
  p_merge_strategy TEXT DEFAULT 'preserve'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  UPDATE sdr_qualifications
  SET status = 'finalizado',
      finalized_at = NOW(),
      notas = COALESCE(p_notas, notas),
      rules_version = sdr_compute_rules_version(agent_id)
  WHERE id = p_id;

  -- Copia dados_lead pra cards.produto_data, com mapeamento de chaves WEDDING
  IF v_qual.card_id IS NOT NULL AND v_qual.dados_lead != '{}'::JSONB THEN
    SELECT id, produto_data FROM cards WHERE id = v_qual.card_id INTO v_card;
    v_new_produto_data := COALESCE(v_card.produto_data, '{}'::JSONB);
    v_dados := v_qual.dados_lead;

    FOR v_key, v_value IN SELECT * FROM jsonb_each(v_dados) LOOP
      -- Mapeia chaves "amigáveis" do form para as chaves do system_fields WEDDING
      v_target_key := CASE v_key
        WHEN 'data_casamento'      THEN 'ww_data_casamento'
        WHEN 'num_convidados'      THEN 'ww_num_convidados'
        WHEN 'investimento_total'  THEN 'ww_sdr_orcamento'
        WHEN 'destino_desejado'    THEN 'ww_destino'
        WHEN 'nome_parceiro'       THEN 'ww_nome_parceiro'
        -- nome_casal, telefone, email e observacoes ficam fora de produto_data
        -- (nome/telefone/email vão no contato; observacoes vai em notas)
        WHEN 'nome_casal'          THEN NULL
        WHEN 'telefone'            THEN NULL
        WHEN 'email'               THEN NULL
        WHEN 'observacoes'         THEN NULL
        ELSE v_key  -- repassa chaves prefixadas ww_* já corretas
      END;

      IF v_target_key IS NULL THEN CONTINUE; END IF;
      -- Pular valores vazios/nulos
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

  -- Webhook via outbox (apenas se outbox existe)
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
$$;
