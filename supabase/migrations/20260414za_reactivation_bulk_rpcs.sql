-- ============================================================
-- Reativação v4 — RPCs de ação em lote
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_reactivation_suppress_bulk(
  p_contact_ids UUID[],
  p_reason TEXT,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org UUID;
  v_user UUID;
  v_count INT := 0;
BEGIN
  v_org := requesting_org_id();
  v_user := auth.uid();

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Org context required';
  END IF;

  IF p_reason NOT IN ('opt_out','working_elsewhere','bad_data','wrong_profile','other') THEN
    RAISE EXCEPTION 'Invalid reason: %', p_reason;
  END IF;

  INSERT INTO reactivation_suppressions (org_id, contact_id, reason, suppressed_until, note, created_by)
  SELECT v_org, cid, p_reason, p_until, p_note, v_user
  FROM UNNEST(p_contact_ids) AS cid
  ON CONFLICT (org_id, contact_id) DO UPDATE SET
    reason = EXCLUDED.reason,
    suppressed_until = EXCLUDED.suppressed_until,
    note = EXCLUDED.note,
    created_by = EXCLUDED.created_by,
    created_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM reactivation_patterns
  WHERE org_id = v_org
    AND contact_id = ANY(p_contact_ids);

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_reactivation_unsuppress_bulk(p_contact_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org UUID;
  v_count INT := 0;
BEGIN
  v_org := requesting_org_id();
  DELETE FROM reactivation_suppressions
  WHERE org_id = v_org AND contact_id = ANY(p_contact_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_reactivation_assign_bulk(
  p_contact_ids UUID[],
  p_responsavel_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org UUID;
  v_count INT := 0;
BEGIN
  v_org := requesting_org_id();
  UPDATE reactivation_patterns
  SET last_responsavel_id = p_responsavel_id,
      calculated_at = NOW()
  WHERE org_id = v_org AND contact_id = ANY(p_contact_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_reactivation_create_cards_bulk(
  p_contact_ids UUID[],
  p_pipeline_id UUID,
  p_stage_id UUID,
  p_vendas_owner_id UUID DEFAULT NULL,
  p_titulo_prefix TEXT DEFAULT 'Reativação'
)
RETURNS TABLE(contact_id UUID, card_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org UUID;
  v_user UUID;
  v_produto TEXT;
  v_contact_id UUID;
  v_new_card_id UUID;
  v_contact_name TEXT;
BEGIN
  v_org := requesting_org_id();
  v_user := auth.uid();

  SELECT p.produto::TEXT INTO v_produto
  FROM pipelines p
  WHERE p.id = p_pipeline_id AND p.org_id = v_org;

  IF v_produto IS NULL THEN
    RAISE EXCEPTION 'Pipeline % não pertence à org atual', p_pipeline_id;
  END IF;

  FOR v_contact_id IN SELECT UNNEST(p_contact_ids) LOOP
    SELECT COALESCE(nome || COALESCE(' ' || sobrenome, ''), 'Cliente') INTO v_contact_name
    FROM contatos WHERE id = v_contact_id;

    INSERT INTO cards (
      org_id, pipeline_id, pipeline_stage_id,
      titulo, produto, pessoa_principal_id,
      status_comercial, estado_operacional,
      vendas_owner_id, origem, origem_lead,
      created_by, updated_by
    ) VALUES (
      v_org, p_pipeline_id, p_stage_id,
      p_titulo_prefix || ' — ' || COALESCE(v_contact_name, 'Cliente'),
      v_produto::app_product, v_contact_id,
      'aberto', 'ativo',
      p_vendas_owner_id, 'reativacao', 'reativacao',
      v_user, v_user
    ) RETURNING id INTO v_new_card_id;

    contact_id := v_contact_id;
    card_id := v_new_card_id;
    RETURN NEXT;
  END LOOP;

  DELETE FROM reactivation_patterns
  WHERE org_id = v_org AND contact_id = ANY(p_contact_ids);

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_reactivation_suppress_bulk(UUID[], TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_reactivation_unsuppress_bulk(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_reactivation_assign_bulk(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_reactivation_create_cards_bulk(UUID[], UUID, UUID, UUID, TEXT) TO authenticated;
