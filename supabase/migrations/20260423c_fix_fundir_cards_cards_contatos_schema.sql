-- ============================================================================
-- HOTFIX: fundir_cards — schema real de cards_contatos
-- Date: 2026-04-23
--
-- Problema: usei 'papel' mas a coluna real é 'tipo_viajante' + 'ordem' +
-- 'tipo_vinculo'. Corrigindo o INSERT para refletir schema atual.
-- ============================================================================

CREATE OR REPLACE FUNCTION fundir_cards(
  p_card_origem UUID,
  p_card_destino UUID,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_origem_org UUID;
  v_destino_org UUID;
  v_items_moved INTEGER := 0;
  v_passengers_moved INTEGER := 0;
  v_contatos_moved INTEGER := 0;
  v_activities_moved INTEGER := 0;
  v_team_moved INTEGER := 0;
  v_attachments_moved INTEGER := 0;
  v_total_venda NUMERIC;
  v_total_custo NUMERIC;
  v_item_count INTEGER;
  v_origem_titulo TEXT;
  v_destino_titulo TEXT;
  v_user_id UUID;
BEGIN
  v_org_id := requesting_org_id();
  v_user_id := auth.uid();

  IF p_card_origem IS NULL OR p_card_destino IS NULL THEN
    RAISE EXCEPTION 'Origem e destino são obrigatórios';
  END IF;

  IF p_card_origem = p_card_destino THEN
    RAISE EXCEPTION 'Origem e destino não podem ser o mesmo card';
  END IF;

  SELECT org_id, titulo INTO v_origem_org, v_origem_titulo
    FROM cards WHERE id = p_card_origem AND deleted_at IS NULL;

  IF v_origem_org IS NULL THEN
    RAISE EXCEPTION 'Card origem não encontrado';
  END IF;

  SELECT org_id, titulo INTO v_destino_org, v_destino_titulo
    FROM cards WHERE id = p_card_destino AND deleted_at IS NULL;

  IF v_destino_org IS NULL THEN
    RAISE EXCEPTION 'Card destino não encontrado';
  END IF;

  IF v_origem_org <> v_destino_org THEN
    RAISE EXCEPTION 'Cards estão em orgs diferentes — fusão bloqueada';
  END IF;

  IF v_org_id IS NOT NULL AND v_origem_org <> v_org_id THEN
    RAISE EXCEPTION 'Card origem não pertence à sua organização';
  END IF;

  -- 1. Mover card_financial_items
  WITH moved AS (
    UPDATE card_financial_items
       SET card_id = p_card_destino, updated_at = NOW()
     WHERE card_id = p_card_origem
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_items_moved FROM moved;

  UPDATE financial_item_passengers
     SET card_id = p_card_destino
   WHERE card_id = p_card_origem;
  GET DIAGNOSTICS v_passengers_moved = ROW_COUNT;

  -- 2. Mover cards_contatos (schema real: tipo_viajante, ordem, tipo_vinculo)
  -- Ignora duplicatas de contato (trigger enforce_single_role_cards_contatos
  -- também barra se contato já está como pessoa_principal no destino).
  INSERT INTO cards_contatos (card_id, contato_id, tipo_viajante, ordem, tipo_vinculo, created_at)
  SELECT p_card_destino, cc_origem.contato_id, cc_origem.tipo_viajante,
         COALESCE(cc_origem.ordem, 0), cc_origem.tipo_vinculo, NOW()
    FROM cards_contatos cc_origem
    JOIN cards c_dest ON c_dest.id = p_card_destino
   WHERE cc_origem.card_id = p_card_origem
     AND cc_origem.contato_id IS DISTINCT FROM c_dest.pessoa_principal_id
     AND NOT EXISTS (
       SELECT 1 FROM cards_contatos cc_dest
        WHERE cc_dest.card_id = p_card_destino
          AND cc_dest.contato_id = cc_origem.contato_id
     );
  GET DIAGNOSTICS v_contatos_moved = ROW_COUNT;

  DELETE FROM cards_contatos WHERE card_id = p_card_origem;

  -- 3. Mover activities
  UPDATE activities SET card_id = p_card_destino WHERE card_id = p_card_origem;
  GET DIAGNOSTICS v_activities_moved = ROW_COUNT;

  -- 4. Mover card_team_members (UNIQUE(card_id, profile_id))
  INSERT INTO card_team_members (card_id, profile_id, role, created_by, created_at)
  SELECT p_card_destino, ctm.profile_id, ctm.role, ctm.created_by, NOW()
    FROM card_team_members ctm
   WHERE ctm.card_id = p_card_origem
     AND NOT EXISTS (
       SELECT 1 FROM card_team_members ctm2
        WHERE ctm2.card_id = p_card_destino
          AND ctm2.profile_id = ctm.profile_id
     );
  GET DIAGNOSTICS v_team_moved = ROW_COUNT;

  DELETE FROM card_team_members WHERE card_id = p_card_origem;

  -- 5. Mover attachments se a tabela existir (card_attachments não existe hoje)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'card_attachments'
  ) THEN
    EXECUTE format(
      'UPDATE card_attachments SET card_id = %L WHERE card_id = %L',
      p_card_destino, p_card_origem
    );
    GET DIAGNOSTICS v_attachments_moved = ROW_COUNT;
  END IF;

  -- 6. Recalcular valor_final + receita do destino
  SELECT
    COALESCE(SUM(sale_value), 0),
    COALESCE(SUM(supplier_cost), 0),
    COUNT(*)
    INTO v_total_venda, v_total_custo, v_item_count
    FROM card_financial_items
   WHERE card_id = p_card_destino;

  IF v_item_count > 0 THEN
    UPDATE cards
       SET valor_final = v_total_venda,
           receita = (v_total_venda - v_total_custo),
           receita_source = 'calculated',
           updated_at = NOW()
     WHERE id = p_card_destino;
  END IF;

  -- 7. Arquivar o card origem com rastro
  UPDATE cards
     SET archived_at = NOW(),
         updated_at = NOW(),
         merge_metadata = COALESCE(merge_metadata, '{}'::JSONB) || jsonb_build_object(
           'merged_into_card_id', p_card_destino,
           'merged_into_titulo', v_destino_titulo,
           'merged_at', NOW(),
           'merged_by', v_user_id,
           'motivo', p_motivo,
           'items_moved', v_items_moved,
           'passengers_moved', v_passengers_moved,
           'contatos_moved', v_contatos_moved,
           'activities_moved', v_activities_moved
         ),
         sub_card_status = CASE
           WHEN card_type = 'sub_card' THEN 'merged'
           ELSE sub_card_status
         END
   WHERE id = p_card_origem;

  RETURN jsonb_build_object(
    'success', true,
    'card_origem_id', p_card_origem,
    'card_origem_titulo', v_origem_titulo,
    'card_destino_id', p_card_destino,
    'card_destino_titulo', v_destino_titulo,
    'items_moved', v_items_moved,
    'passengers_moved', v_passengers_moved,
    'contatos_moved', v_contatos_moved,
    'activities_moved', v_activities_moved,
    'team_moved', v_team_moved,
    'attachments_moved', v_attachments_moved,
    'destino_valor_final', v_total_venda,
    'destino_receita', CASE WHEN v_item_count > 0 THEN (v_total_venda - v_total_custo) ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fundir_cards(UUID, UUID, TEXT) TO authenticated;
