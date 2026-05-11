-- ============================================================================
-- MIGRATION: fundir_cards e mover_financial_items migram numero_venda_monde
-- Date: 2026-04-27
--
-- Bug: ao agrupar cards, o numero_venda_monde (e seu histórico) ficava no
-- card de origem e era arquivado junto, sumindo do destino. Como esse número
-- vive em produto_data (não no item), as funções não tocavam nele.
--
-- Correção:
--   1. fundir_cards: SEMPRE migra numero_venda_monde + numeros_venda_monde_historico
--      do origem pro destino. Concatena com o que o destino já tem (sem duplicar).
--      Limpa do origem (que será arquivado).
--
--   2. mover_financial_items: aceita p_migrate_venda_monde BOOLEAN DEFAULT false.
--      Quando true, copia (sem remover do origem, pois ele segue aberto) o
--      numero_venda_monde + histórico do origem pro destino. Origem mantém.
--
-- Idempotência: se destino já tem numero_venda_monde igual, não duplica.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: mescla numero_venda_monde + histórico do origem no destino
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _merge_venda_monde_into_destino(
    p_origem UUID,
    p_destino UUID,
    p_clear_origem BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_origem_pd JSONB;
    v_destino_pd JSONB;
    v_origem_numero TEXT;
    v_destino_numero TEXT;
    v_origem_hist JSONB;
    v_destino_hist JSONB;
    v_combined_hist JSONB := '[]'::JSONB;
    v_new_destino_pd JSONB;
    v_new_origem_pd JSONB;
    v_seen_numbers TEXT[] := ARRAY[]::TEXT[];
    v_entry JSONB;
    v_num TEXT;
BEGIN
    SELECT produto_data INTO v_origem_pd FROM cards WHERE id = p_origem;
    SELECT produto_data INTO v_destino_pd FROM cards WHERE id = p_destino;

    v_origem_pd := COALESCE(v_origem_pd, '{}'::JSONB);
    v_destino_pd := COALESCE(v_destino_pd, '{}'::JSONB);

    v_origem_numero := v_origem_pd->>'numero_venda_monde';
    v_destino_numero := v_destino_pd->>'numero_venda_monde';
    v_origem_hist := COALESCE(v_origem_pd->'numeros_venda_monde_historico', '[]'::JSONB);
    v_destino_hist := COALESCE(v_destino_pd->'numeros_venda_monde_historico', '[]'::JSONB);

    -- Se origem não tem nada, nada pra fazer
    IF v_origem_numero IS NULL AND jsonb_array_length(v_origem_hist) = 0 THEN
        RETURN;
    END IF;

    -- Construir histórico combinado sem duplicar números
    -- Primeiro: o que destino já tinha
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_destino_hist) LOOP
        v_num := v_entry->>'numero';
        IF v_num IS NOT NULL AND NOT (v_num = ANY(v_seen_numbers)) THEN
            v_combined_hist := v_combined_hist || v_entry;
            v_seen_numbers := array_append(v_seen_numbers, v_num);
        END IF;
    END LOOP;

    -- Se destino tem numero_venda_monde mas não está no histórico dele, adicionar
    IF v_destino_numero IS NOT NULL AND NOT (v_destino_numero = ANY(v_seen_numbers)) THEN
        v_combined_hist := v_combined_hist || jsonb_build_object(
            'numero', v_destino_numero,
            'origem', 'destino_original',
            'sub_card_id', NULL,
            'adicionado_em', NOW(),
            'sub_card_titulo', NULL
        );
        v_seen_numbers := array_append(v_seen_numbers, v_destino_numero);
    END IF;

    -- Adicionar histórico do origem
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_origem_hist) LOOP
        v_num := v_entry->>'numero';
        IF v_num IS NOT NULL AND NOT (v_num = ANY(v_seen_numbers)) THEN
            v_combined_hist := v_combined_hist || v_entry;
            v_seen_numbers := array_append(v_seen_numbers, v_num);
        END IF;
    END LOOP;

    -- Adicionar numero_venda_monde do origem (se ainda não tá)
    IF v_origem_numero IS NOT NULL AND NOT (v_origem_numero = ANY(v_seen_numbers)) THEN
        v_combined_hist := v_combined_hist || jsonb_build_object(
            'numero', v_origem_numero,
            'origem', CASE WHEN p_clear_origem THEN 'merge' ELSE 'split' END,
            'sub_card_id', NULL,
            'adicionado_em', NOW(),
            'sub_card_titulo', (SELECT titulo FROM cards WHERE id = p_origem)
        );
        v_seen_numbers := array_append(v_seen_numbers, v_origem_numero);
    END IF;

    -- Atualizar destino
    v_new_destino_pd := v_destino_pd
        || jsonb_build_object(
            'numero_venda_monde', COALESCE(v_destino_numero, v_origem_numero),
            'numeros_venda_monde_historico', v_combined_hist
        );

    UPDATE cards
       SET produto_data = v_new_destino_pd,
           updated_at = NOW()
     WHERE id = p_destino;

    -- Se for fusão completa, limpar do origem (vai ser arquivado)
    IF p_clear_origem THEN
        v_new_origem_pd := v_origem_pd
            - 'numero_venda_monde'
            - 'numeros_venda_monde_historico';
        UPDATE cards
           SET produto_data = v_new_origem_pd,
               updated_at = NOW()
         WHERE id = p_origem;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fundir_cards: chamar o helper antes de arquivar origem
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- 2. Mover cards_contatos
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

  -- 3. Activities
  UPDATE activities SET card_id = p_card_destino WHERE card_id = p_card_origem;
  GET DIAGNOSTICS v_activities_moved = ROW_COUNT;

  -- 4. card_team_members
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

  -- 5. attachments (se a tabela existir)
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

  -- 5b. Migrar numero_venda_monde + histórico (origem vai arquivar)
  PERFORM _merge_venda_monde_into_destino(p_card_origem, p_card_destino, TRUE);

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

  -- 7. Arquivar origem
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mover_financial_items: parâmetro opcional p_migrate_venda_monde
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mover_financial_items(
  p_item_ids UUID[],
  p_card_destino UUID,
  p_migrate_venda_monde BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_destino_org UUID;
  v_source_cards UUID[];
  v_source_card UUID;
  v_moved INTEGER := 0;
  v_total_venda NUMERIC;
  v_total_custo NUMERIC;
  v_item_count INTEGER;
BEGIN
  v_org_id := requesting_org_id();

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Lista de itens vazia';
  END IF;

  IF p_card_destino IS NULL THEN
    RAISE EXCEPTION 'Card destino obrigatório';
  END IF;

  SELECT org_id INTO v_destino_org FROM cards
   WHERE id = p_card_destino AND deleted_at IS NULL;

  IF v_destino_org IS NULL THEN
    RAISE EXCEPTION 'Card destino não encontrado';
  END IF;

  IF v_org_id IS NOT NULL AND v_destino_org <> v_org_id THEN
    RAISE EXCEPTION 'Card destino não pertence à sua organização';
  END IF;

  SELECT ARRAY_AGG(DISTINCT c.id)
    INTO v_source_cards
    FROM card_financial_items fi
    JOIN cards c ON c.id = fi.card_id
   WHERE fi.id = ANY(p_item_ids)
     AND c.org_id = v_destino_org;

  IF v_source_cards IS NULL OR array_length(v_source_cards, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhum item válido (possível cross-org ou IDs inválidos)';
  END IF;

  IF (SELECT COUNT(*) FROM card_financial_items WHERE id = ANY(p_item_ids)) <>
     (SELECT COUNT(*) FROM card_financial_items fi
       JOIN cards c ON c.id = fi.card_id
       WHERE fi.id = ANY(p_item_ids) AND c.org_id = v_destino_org)
  THEN
    RAISE EXCEPTION 'Algum item não pertence à sua organização';
  END IF;

  -- Mover itens
  UPDATE card_financial_items
     SET card_id = p_card_destino, updated_at = NOW()
   WHERE id = ANY(p_item_ids);
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE financial_item_passengers
     SET card_id = p_card_destino
   WHERE financial_item_id = ANY(p_item_ids);

  -- Migrar venda Monde se solicitado (origem mantém — ele segue aberto)
  IF p_migrate_venda_monde THEN
    FOREACH v_source_card IN ARRAY v_source_cards
    LOOP
      IF v_source_card <> p_card_destino THEN
        PERFORM _merge_venda_monde_into_destino(v_source_card, p_card_destino, FALSE);
      END IF;
    END LOOP;
  END IF;

  -- Recalcular destino
  SELECT COALESCE(SUM(sale_value), 0), COALESCE(SUM(supplier_cost), 0), COUNT(*)
    INTO v_total_venda, v_total_custo, v_item_count
    FROM card_financial_items WHERE card_id = p_card_destino;

  UPDATE cards
     SET valor_final = CASE WHEN v_item_count > 0 THEN v_total_venda ELSE valor_final END,
         receita = CASE WHEN v_item_count > 0 THEN (v_total_venda - v_total_custo) ELSE receita END,
         receita_source = CASE WHEN v_item_count > 0 THEN 'calculated' ELSE receita_source END,
         updated_at = NOW()
   WHERE id = p_card_destino;

  -- Recalcular cada source
  FOREACH v_source_card IN ARRAY v_source_cards
  LOOP
    IF v_source_card = p_card_destino THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(sale_value), 0), COALESCE(SUM(supplier_cost), 0), COUNT(*)
      INTO v_total_venda, v_total_custo, v_item_count
      FROM card_financial_items WHERE card_id = v_source_card;

    UPDATE cards
       SET valor_final = CASE WHEN v_item_count > 0 THEN v_total_venda ELSE 0 END,
           receita = CASE WHEN v_item_count > 0 THEN (v_total_venda - v_total_custo) ELSE 0 END,
           receita_source = CASE WHEN v_item_count > 0 THEN 'calculated' ELSE receita_source END,
           updated_at = NOW()
     WHERE id = v_source_card;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'items_moved', v_moved,
    'source_cards', v_source_cards,
    'destino_id', p_card_destino,
    'venda_monde_migrated', p_migrate_venda_monde
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mover_financial_items(UUID[], UUID, BOOLEAN) TO authenticated;

-- Backward-compat: assinatura antiga (sem o flag) — mapeia para nova com false
CREATE OR REPLACE FUNCTION mover_financial_items(
  p_item_ids UUID[],
  p_card_destino UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mover_financial_items(p_item_ids, p_card_destino, FALSE);
$$;

GRANT EXECUTE ON FUNCTION mover_financial_items(UUID[], UUID) TO authenticated;

COMMIT;
