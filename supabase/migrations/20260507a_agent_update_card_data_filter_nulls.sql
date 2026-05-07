DROP FUNCTION IF EXISTS public.agent_update_card_data(UUID, JSONB, TEXT[], TEXT[]);

CREATE OR REPLACE FUNCTION public.agent_update_card_data(
  p_card_id UUID,
  p_patch JSONB,
  p_allowed_fields TEXT[] DEFAULT NULL,
  p_protected_fields TEXT[] DEFAULT ARRAY[
    'pessoa_principal_id','produto_data','valor_estimado','created_at','created_by'
  ]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_value JSONB;
  v_updated_top TEXT[] := ARRAY[]::TEXT[];
  v_updated_produto_data TEXT[] := ARRAY[]::TEXT[];
  v_blocked JSONB := '[]'::jsonb;
  v_has_allowlist BOOLEAN;
  v_is_dynamic BOOLEAN;
  v_new_produto_data JSONB;
  v_safe_top JSONB := '{}'::jsonb;
  v_top_level_writable TEXT[] := ARRAY[
    'titulo','ai_resumo','ai_contexto','pipeline_stage_id',
    'data_viagem_inicio','data_viagem_fim','valor_estimado','valor_final',
    'dono_atual_id','briefing_inicial'
  ];
BEGIN
  v_has_allowlist := p_allowed_fields IS NOT NULL AND array_length(p_allowed_fields, 1) > 0;

  IF NOT EXISTS (SELECT 1 FROM cards WHERE id = p_card_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'card_not_found');
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch)
  LOOP
    IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object('field', v_key, 'reason', 'null_value_ignored')
      );
      CONTINUE;
    END IF;

    IF v_key = ANY(p_protected_fields) THEN
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object('field', v_key, 'reason', 'protected')
      );
      CONTINUE;
    END IF;

    IF v_has_allowlist AND NOT (v_key = ANY(p_allowed_fields)) THEN
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object('field', v_key, 'reason', 'not_in_whitelist')
      );
      CONTINUE;
    END IF;

    IF v_key = ANY(v_top_level_writable) THEN
      v_safe_top := v_safe_top || jsonb_build_object(v_key, v_value);
      v_updated_top := array_append(v_updated_top, v_key);
      CONTINUE;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM system_fields WHERE key = v_key AND active = true
    ) INTO v_is_dynamic;

    IF v_is_dynamic THEN
      v_updated_produto_data := array_append(v_updated_produto_data, v_key);
    ELSE
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object('field', v_key, 'reason', 'unknown_field')
      );
    END IF;
  END LOOP;

  IF v_safe_top <> '{}'::jsonb THEN
    UPDATE cards SET
      titulo             = COALESCE(v_safe_top->>'titulo', titulo),
      ai_resumo          = COALESCE(v_safe_top->>'ai_resumo', ai_resumo),
      ai_contexto        = COALESCE(v_safe_top->>'ai_contexto', ai_contexto),
      pipeline_stage_id  = COALESCE((v_safe_top->>'pipeline_stage_id')::UUID, pipeline_stage_id),
      data_viagem_inicio = COALESCE((v_safe_top->>'data_viagem_inicio')::DATE, data_viagem_inicio),
      data_viagem_fim    = COALESCE((v_safe_top->>'data_viagem_fim')::DATE, data_viagem_fim),
      valor_estimado     = COALESCE((v_safe_top->>'valor_estimado')::NUMERIC, valor_estimado),
      valor_final        = COALESCE((v_safe_top->>'valor_final')::NUMERIC, valor_final),
      dono_atual_id      = COALESCE((v_safe_top->>'dono_atual_id')::UUID, dono_atual_id),
      briefing_inicial   = COALESCE((v_safe_top->'briefing_inicial'), briefing_inicial),
      updated_at         = now()
    WHERE id = p_card_id;
  END IF;

  IF array_length(v_updated_produto_data, 1) > 0 THEN
    SELECT jsonb_object_agg(k, v) INTO v_new_produto_data
    FROM jsonb_each(p_patch) AS kv(k, v)
    WHERE k = ANY(v_updated_produto_data)
      AND v IS NOT NULL
      AND jsonb_typeof(v) != 'null';

    IF v_new_produto_data IS NOT NULL THEN
      UPDATE cards SET
        produto_data = COALESCE(produto_data, '{}'::jsonb) || v_new_produto_data,
        updated_at   = now()
      WHERE id = p_card_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'updated_top', v_updated_top,
    'updated_produto_data', v_updated_produto_data,
    'blocked', v_blocked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_update_card_data(UUID, JSONB, TEXT[], TEXT[]) TO service_role;

COMMENT ON FUNCTION public.agent_update_card_data(UUID, JSONB, TEXT[], TEXT[]) IS
'v3 (2026-05-07): Aplica patch do Data Agent no card. Filtra valores null (null=nao atualizar, semantica CRUD). Distingue colunas top-level de campos dinamicos (system_fields em produto_data). Respeita protected_fields e opcionalmente whitelist dinamica de auto_update_fields.';
