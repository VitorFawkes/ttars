-- ============================================================================
-- MIGRATION: produtos da venda Monde aparecem em TODO card que tem a venda
-- Date: 2026-05-15
--
-- Regra do Vitor (15/05):
--   "Se o número de venda está no card (primário ou histórico), os produtos
--    da venda devem APARECER no card. Não importa se também aparecem em
--    outro card — produto duplicado em múltiplos cards é desenho válido."
--
-- Mudanças vs estado atual (após 20260515f):
--
-- 1. fn_match_pending_monde_for_card v2:
--    - Aceita pending sales com QUALQUER status (não só 'pending')
--    - Pending matched a outro card pode ter seus produtos copiados pra este
--    - Idempotência: pula venda no card se já há item ativo com a venda
--
-- 2. find_cards_by_monde_vendas v4:
--    - Combina 3 fontes: primário (produto_data->numero_venda_monde),
--      histórico (produto_data->numeros_venda_monde_historico) e items
--      ativos (card_financial_items.monde_venda_num).
--    - Qualquer card com a venda em qualquer uma das 3 fontes entra.
--
-- 3. Backfill: pra cada (card_ativo, venda_no_card) sem produtos, chama
--    fn_match_pending_monde_for_card para popular.
--
-- Estado prévio à migration: 59 cards com 92 vendas no histórico/primário
-- sem produtos correspondentes na tabela.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. fn_match_pending_monde_for_card v2 — aceita qualquer status
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_match_pending_monde_for_card(UUID, TEXT[]);

CREATE FUNCTION public.fn_match_pending_monde_for_card(
  p_card_id UUID,
  p_only_nums TEXT[] DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
  v_nums TEXT[];
  v_to_match TEXT;
  v_pending RECORD;
  v_product JSONB;
  v_existing_count INT;
  v_inserted_total INT := 0;
BEGIN
  SELECT * INTO v_card FROM cards WHERE id = p_card_id;
  IF NOT FOUND OR v_card.archived_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  -- Conjunto completo: primário + histórico
  SELECT ARRAY(
    SELECT DISTINCT venda_num FROM (
      SELECT v_card.produto_data->>'numero_venda_monde' AS venda_num
      UNION ALL
      SELECT elem->>'numero' FROM jsonb_array_elements(
        COALESCE(v_card.produto_data->'numeros_venda_monde_historico', '[]'::JSONB)
      ) elem
    ) sub
    WHERE venda_num IS NOT NULL AND venda_num <> ''
  ) INTO v_nums;

  IF array_length(v_nums, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH v_to_match IN ARRAY v_nums
  LOOP
    IF p_only_nums IS NOT NULL AND NOT (v_to_match = ANY(p_only_nums)) THEN
      CONTINUE;
    END IF;

    -- Idempotência: se card já tem item ativo com essa venda, pula
    SELECT COUNT(*) INTO v_existing_count
    FROM card_financial_items
    WHERE card_id = p_card_id
      AND monde_venda_num = v_to_match
      AND archived_at IS NULL;

    IF v_existing_count > 0 THEN
      CONTINUE;
    END IF;

    -- Procurar pending sale: QUALQUER status (matched ou pending),
    -- preferindo a mais recente. Pending sale é o documento Monde —
    -- pode ser reutilizado pra múltiplos cards que têm essa venda.
    SELECT * INTO v_pending
    FROM monde_pending_sales
    WHERE venda_num = v_to_match
      AND org_id = v_card.org_id
    ORDER BY
      CASE WHEN status = 'pending' THEN 0 ELSE 1 END,  -- prefere pending
      created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    FOR v_product IN SELECT * FROM jsonb_array_elements(v_pending.products)
    LOOP
      INSERT INTO card_financial_items (
        card_id, description, sale_value, supplier_cost,
        fornecedor, representante, documento, data_inicio, data_fim,
        org_id, monde_venda_num
      ) VALUES (
        p_card_id,
        v_product->>'produto',
        COALESCE((v_product->>'valorTotal')::NUMERIC, 0),
        ROUND((COALESCE((v_product->>'valorTotal')::NUMERIC, 0) - COALESCE((v_product->>'receita')::NUMERIC, 0)) * 100) / 100,
        NULLIF(v_product->>'fornecedor', ''),
        NULLIF(v_product->>'representante', ''),
        NULLIF(v_product->>'documento', ''),
        CASE WHEN v_product->>'dataInicio' IS NOT NULL AND v_product->>'dataInicio' <> ''
             THEN (v_product->>'dataInicio')::DATE ELSE NULL END,
        CASE WHEN v_product->>'dataFim' IS NOT NULL AND v_product->>'dataFim' <> ''
             THEN (v_product->>'dataFim')::DATE ELSE NULL END,
        v_card.org_id,
        v_to_match
      );
      v_inserted_total := v_inserted_total + 1;
    END LOOP;

    -- Se a pending estava 'pending', marcar matched (apenas registra primeiro consumidor)
    UPDATE monde_pending_sales
       SET status = 'matched',
           matched_card_id = COALESCE(matched_card_id, p_card_id),
           matched_at = COALESCE(matched_at, NOW())
     WHERE id = v_pending.id
       AND status = 'pending';

    RAISE LOG '[fn_match_pending_monde_for_card v2] card=% venda=% pending_status=%',
              p_card_id, v_to_match, v_pending.status;
  END LOOP;

  IF v_inserted_total > 0 THEN
    UPDATE cards c
       SET valor_final = COALESCE((
             SELECT SUM(sale_value) FROM card_financial_items
             WHERE card_id = p_card_id AND archived_at IS NULL
           ), 0),
           receita = COALESCE((
             SELECT SUM(sale_value - supplier_cost) FROM card_financial_items
             WHERE card_id = p_card_id AND archived_at IS NULL
           ), 0),
           receita_source = 'monde_import',
           updated_at = NOW()
     WHERE c.id = p_card_id;
  END IF;

  RETURN v_inserted_total;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. find_cards_by_monde_vendas v4 — primário ∪ histórico ∪ items
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.find_cards_by_monde_vendas(TEXT[], UUID);

CREATE FUNCTION public.find_cards_by_monde_vendas(
  p_venda_nums TEXT[],
  p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  card_id UUID,
  card_titulo TEXT,
  venda_num TEXT,
  match_source TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH effective_org AS (
    SELECT COALESCE(p_org_id, requesting_org_id()) AS oid
  )
  SELECT DISTINCT
    c.id AS card_id,
    c.titulo::TEXT AS card_titulo,
    v.venda_num,
    v.match_source
  FROM cards c
  CROSS JOIN LATERAL (
    SELECT c.produto_data->>'numero_venda_monde' AS venda_num,
           'primary'::TEXT AS match_source
    WHERE c.produto_data->>'numero_venda_monde' = ANY(p_venda_nums)
    UNION ALL
    SELECT elem->>'numero', 'history'::TEXT
    FROM jsonb_array_elements(
      COALESCE(c.produto_data->'numeros_venda_monde_historico', '[]'::JSONB)
    ) elem
    WHERE elem->>'numero' = ANY(p_venda_nums)
    UNION ALL
    SELECT cfi.monde_venda_num, 'item'::TEXT
    FROM card_financial_items cfi
    WHERE cfi.card_id = c.id
      AND cfi.monde_venda_num = ANY(p_venda_nums)
      AND cfi.archived_at IS NULL
  ) v
  WHERE c.archived_at IS NULL
    AND c.org_id = (SELECT oid FROM effective_org);
$$;

GRANT EXECUTE ON FUNCTION public.find_cards_by_monde_vendas(TEXT[], UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Backfill: replica produtos pra todos os cards (ativos) que têm a venda
--    no primário ou histórico mas não têm items ativos dessa venda.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_card RECORD;
  v_inserted INT;
  v_total_inserted INT := 0;
  v_cards_processed INT := 0;
BEGIN
  FOR v_card IN
    SELECT DISTINCT c.id
    FROM cards c
    WHERE c.archived_at IS NULL
      AND c.produto_data IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT c.produto_data->>'numero_venda_monde' AS v
          WHERE c.produto_data->>'numero_venda_monde' IS NOT NULL
            AND c.produto_data->>'numero_venda_monde' <> ''
          UNION ALL
          SELECT elem->>'numero'
          FROM jsonb_array_elements(COALESCE(c.produto_data->'numeros_venda_monde_historico','[]'::JSONB)) elem
        ) vendas_card
        WHERE NOT EXISTS (
          SELECT 1 FROM card_financial_items cfi
          WHERE cfi.card_id = c.id
            AND cfi.monde_venda_num = vendas_card.v
            AND cfi.archived_at IS NULL
        )
      )
  LOOP
    SELECT fn_match_pending_monde_for_card(v_card.id, NULL) INTO v_inserted;
    v_total_inserted := v_total_inserted + COALESCE(v_inserted, 0);
    v_cards_processed := v_cards_processed + 1;
  END LOOP;

  RAISE LOG '[backfill_replicate_products] cards=%, items_inseridos=%',
            v_cards_processed, v_total_inserted;
END;
$$;

COMMIT;
