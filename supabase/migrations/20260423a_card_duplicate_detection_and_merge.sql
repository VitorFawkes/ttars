-- ============================================================================
-- MIGRATION: Card Duplicate Detection + Merge
-- Date: 2026-04-23
--
-- Introduces the missing glue for detecting and fusing duplicate cards:
--   1. find_possible_duplicate_cards — retorna cards abertos com mesma
--      pessoa principal + mesmo produto + datas sobrepostas (tolerância 2 dias).
--   2. fundir_cards — transfere card_financial_items (+ passageiros via cascade),
--      cards_contatos, activities, attachments do origem → destino, arquiva o
--      origem e recalcula valor_final/receita dos dois lados.
--   3. mover_financial_items — permite split granular de itens entre cards
--      (usado no marco 2 do plano).
--
-- Todas as RPCs são SECURITY DEFINER e validam que ambos os cards estão
-- dentro de requesting_org_id() — defesa em profundidade além de RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. find_possible_duplicate_cards
-- ---------------------------------------------------------------------------
-- Heurística: mesma pessoa principal, mesmo produto, datas de viagem com até
-- 2 dias de folga entre os intervalos. Não retorna o próprio card (exclude).
-- Não retorna cards arquivados/deletados. Não retorna cards já ganhos ou
-- perdidos (não faz sentido fundir resultado fechado).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION find_possible_duplicate_cards(
  p_pessoa_principal_id UUID,
  p_produto TEXT,
  p_data_inicio DATE DEFAULT NULL,
  p_data_fim DATE DEFAULT NULL,
  p_exclude_card_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  titulo TEXT,
  produto TEXT,
  status_comercial TEXT,
  data_viagem_inicio DATE,
  data_viagem_fim DATE,
  valor_final NUMERIC,
  valor_estimado NUMERIC,
  pipeline_stage_id UUID,
  stage_nome TEXT,
  phase_slug TEXT,
  financial_items_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF p_pessoa_principal_id IS NULL OR p_produto IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.titulo,
    c.produto::TEXT,
    c.status_comercial::TEXT,
    c.data_viagem_inicio,
    c.data_viagem_fim,
    c.valor_final,
    c.valor_estimado,
    c.pipeline_stage_id,
    s.nome AS stage_nome,
    ph.slug::TEXT AS phase_slug,
    (SELECT COUNT(*)::INTEGER FROM card_financial_items fi WHERE fi.card_id = c.id) AS financial_items_count,
    c.created_at
  FROM cards c
  LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
  LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
  WHERE c.org_id = v_org_id
    AND c.pessoa_principal_id = p_pessoa_principal_id
    AND c.produto::TEXT = p_produto
    AND c.deleted_at IS NULL
    AND c.archived_at IS NULL
    AND c.status_comercial NOT IN ('ganho', 'perdido')
    AND (p_exclude_card_id IS NULL OR c.id <> p_exclude_card_id)
    AND (
      -- Se não há datas informadas, retorna qualquer card aberto da mesma pessoa/produto.
      (p_data_inicio IS NULL AND p_data_fim IS NULL)
      OR
      -- Card sem datas também é candidato (pode ser duplicata nascendo sem data)
      (c.data_viagem_inicio IS NULL AND c.data_viagem_fim IS NULL)
      OR
      -- Overlap com tolerância de 2 dias em cada ponta
      (
        COALESCE(c.data_viagem_inicio, c.data_viagem_fim) IS NOT NULL
        AND (
          -- Intervalo do card candidato começa até 2 dias após o fim do novo, e vice-versa
          (COALESCE(p_data_fim, p_data_inicio) IS NULL OR c.data_viagem_inicio IS NULL
            OR c.data_viagem_inicio - COALESCE(p_data_fim, p_data_inicio) <= 2)
          AND
          (COALESCE(p_data_inicio, p_data_fim) IS NULL OR c.data_viagem_fim IS NULL
            OR COALESCE(p_data_inicio, p_data_fim) - c.data_viagem_fim <= 2)
        )
      )
    )
  ORDER BY c.created_at DESC
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION find_possible_duplicate_cards IS
  'Retorna cards abertos que são possíveis duplicatas: mesma pessoa principal, mesmo produto, datas com tolerância de 2 dias. Usado pelo modal de criação e por importações para oferecer fusão.';

-- ---------------------------------------------------------------------------
-- 2. fundir_cards
-- ---------------------------------------------------------------------------
-- Move tudo que é "conteúdo" do card origem para o destino e arquiva o origem.
-- Transferências:
--   - card_financial_items (UPDATE card_id) + financial_item_passengers segue
--     via FK (tem card_id também, UPDATE junto)
--   - cards_contatos (UPDATE card_id, ignora duplicatas)
--   - activities (UPDATE card_id)
--   - card_attachments (UPDATE card_id, se existir)
--   - card_team_members (UPDATE card_id, ignora duplicatas)
-- Depois:
--   - recalcula valor_final + receita do destino a partir de card_financial_items
--   - marca origem: archived_at = now(), merge_metadata = {...}, sub_card_status
--     = 'merged' se aplicável
-- ---------------------------------------------------------------------------

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

  -- Validação de org: ambos os cards devem pertencer à org do usuário
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

  -- 1. Mover card_financial_items (FK passengers acompanha via UPDATE card_id)
  WITH moved AS (
    UPDATE card_financial_items
       SET card_id = p_card_destino,
           updated_at = NOW()
     WHERE card_id = p_card_origem
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_items_moved FROM moved;

  -- financial_item_passengers.card_id também precisa ser atualizado
  -- (tem coluna card_id própria além da FK via financial_item_id)
  UPDATE financial_item_passengers
     SET card_id = p_card_destino
   WHERE card_id = p_card_origem;
  GET DIAGNOSTICS v_passengers_moved = ROW_COUNT;

  -- 2. Mover cards_contatos, ignorando duplicatas (mesmo contato já vinculado)
  INSERT INTO cards_contatos (card_id, contato_id, papel, created_at)
  SELECT p_card_destino, contato_id, papel, NOW()
    FROM cards_contatos cc_origem
   WHERE cc_origem.card_id = p_card_origem
     AND NOT EXISTS (
       SELECT 1 FROM cards_contatos cc_dest
        WHERE cc_dest.card_id = p_card_destino
          AND cc_dest.contato_id = cc_origem.contato_id
     );
  GET DIAGNOSTICS v_contatos_moved = ROW_COUNT;

  DELETE FROM cards_contatos WHERE card_id = p_card_origem;

  -- 3. Mover activities (tarefas, mensagens, histórico)
  UPDATE activities SET card_id = p_card_destino WHERE card_id = p_card_origem;
  GET DIAGNOSTICS v_activities_moved = ROW_COUNT;

  -- 4. Mover card_team_members (assistentes, apoio), ignorando duplicatas
  INSERT INTO card_team_members (card_id, profile_id, role, created_by, created_at)
  SELECT p_card_destino, ctm.profile_id, ctm.role, ctm.created_by, NOW()
    FROM card_team_members ctm
   WHERE ctm.card_id = p_card_origem
     AND NOT EXISTS (
       SELECT 1 FROM card_team_members ctm2
        WHERE ctm2.card_id = p_card_destino
          AND ctm2.profile_id = ctm.profile_id
          AND ctm2.role = ctm.role
     );
  GET DIAGNOSTICS v_team_moved = ROW_COUNT;

  DELETE FROM card_team_members WHERE card_id = p_card_origem;

  -- 5. Mover attachments, se a tabela existir neste ambiente
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

  -- 7. Arquivar o card origem com rastro de fusão
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

COMMENT ON FUNCTION fundir_cards IS
  'Funde dois cards: transfere itens financeiros, contatos, atividades e time para o destino; arquiva o origem; recalcula totais. Valida mesma org.';

-- ---------------------------------------------------------------------------
-- 3. mover_financial_items
-- ---------------------------------------------------------------------------
-- Move um subconjunto de card_financial_items para outro card e recalcula
-- valor_final/receita dos dois lados. Usado para fusão granular (marco 2).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mover_financial_items(
  p_item_ids UUID[],
  p_card_destino UUID
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

  -- Coletar cards de origem (todos devem ser da mesma org do destino)
  SELECT ARRAY_AGG(DISTINCT c.id)
    INTO v_source_cards
    FROM card_financial_items fi
    JOIN cards c ON c.id = fi.card_id
   WHERE fi.id = ANY(p_item_ids)
     AND c.org_id = v_destino_org;

  IF v_source_cards IS NULL OR array_length(v_source_cards, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhum item válido (possível cross-org ou IDs inválidos)';
  END IF;

  -- Verificar que todos os itens pedidos são desta org (evitar mover de fora)
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

  -- Atualizar passageiros (têm card_id próprio)
  UPDATE financial_item_passengers
     SET card_id = p_card_destino
   WHERE financial_item_id = ANY(p_item_ids);

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

  -- Recalcular cada card de origem
  FOREACH v_source_card IN ARRAY v_source_cards
  LOOP
    IF v_source_card = p_card_destino THEN
      CONTINUE;
    END IF;

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
    'destino_id', p_card_destino
  );
END;
$$;

COMMENT ON FUNCTION mover_financial_items IS
  'Move um subconjunto de card_financial_items para outro card e recalcula totais. Usado para fusão granular (split por item).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION find_possible_duplicate_cards(UUID, TEXT, DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fundir_cards(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mover_financial_items(UUID[], UUID) TO authenticated;
