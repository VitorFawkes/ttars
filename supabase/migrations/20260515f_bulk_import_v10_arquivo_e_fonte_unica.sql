-- ============================================================================
-- MIGRATION: bulk_import_financial_items v10 + find_cards_by_monde_vendas v3
-- Date: 2026-05-15
--
-- Decisão final do Vitor (registrada em feedback_monde_multi_venda_sempre_ativa):
--   "A fonte de verdade da vinculação produto ↔ venda Monde é a tabela
--    card_financial_items.monde_venda_num. O numeros_venda_monde_historico no
--    card é só metadado, não usar pra decisão operacional.
--
--    Regras:
--    1. Produto no arquivo + igual → preserva is_ready
--    2. Produto no arquivo + mudou → atualiza + desmarca is_ready + summary
--    3. Produto sumiu do arquivo → arquiva (INDEPENDENTE DE is_ready)
--    4. Produto novo no arquivo → insere
--    5. Cards arquivados são ignorados em TODA operação Monde."
--
-- Mudanças:
--
-- A. bulk_import_financial_items v10 (vs v9):
--    No ramo cleanup, REMOVER o filtro `AND is_ready = FALSE`. Arquivo Monde
--    é fonte de verdade absoluta — produto que sumiu do arquivo é arquivado,
--    mesmo se a operação tinha marcado como feito. (A regra v9 foi revogada
--    pelo Vitor em 15/05 após teste prático.)
--
-- B. find_cards_by_monde_vendas v3:
--    Em vez de buscar por produto_data->numero_venda_monde + histórico,
--    busca direto em card_financial_items.monde_venda_num (fonte real).
--    Cards arquivados continuam ignorados (c.archived_at IS NULL).
--
-- Releitura confirmada de v4–v9. Sem grants externos custom.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A. bulk_import_financial_items v10 — cleanup sem proteger is_ready
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS bulk_import_financial_items(JSONB);

CREATE FUNCTION bulk_import_financial_items(p_cards JSONB)
RETURNS JSONB AS $$
DECLARE
  v_card JSONB;
  v_product JSONB;
  v_card_id UUID;
  v_card_venda_num TEXT;
  v_item_id UUID;
  v_match RECORD;
  v_cards_updated INTEGER := 0;
  v_cards_skipped_archived INTEGER := 0;
  v_products_inserted INTEGER := 0;
  v_products_updated INTEGER := 0;
  v_products_unchanged INTEGER := 0;
  v_products_archived INTEGER := 0;
  v_products_cancelled INTEGER := 0;
  v_products_reactivated INTEGER := 0;
  v_pax_name TEXT;
  v_pax_idx INTEGER;
  v_total_venda DECIMAL(12,2);
  v_total_custo DECIMAL(12,2);
  v_receita DECIMAL(12,2);
  v_item_count INTEGER;
  v_matched_ids UUID[];
  v_archived_now INTEGER;
  v_doc_in TEXT;
  v_desc_in TEXT;
  v_fornec_in TEXT;
  v_repres_in TEXT;
  v_sale_in DECIMAL(12,2);
  v_cost_in DECIMAL(12,2);
  v_dini_in DATE;
  v_dfim_in DATE;
  v_cancel_in DATE;
  v_diff_parts TEXT[];
  v_summary TEXT;
  v_was_cancelled BOOLEAN;
  v_existing_cancel_date DATE;
  v_card_is_archived BOOLEAN;
BEGIN
  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards)
  LOOP
    v_card_id := (v_card->>'card_id')::UUID;
    v_card_venda_num := NULLIF(v_card->>'monde_venda_num', '');
    v_matched_ids := ARRAY[]::UUID[];

    SELECT (archived_at IS NOT NULL) INTO v_card_is_archived
    FROM cards WHERE id = v_card_id;

    IF v_card_is_archived IS NULL OR v_card_is_archived = TRUE THEN
      v_cards_skipped_archived := v_cards_skipped_archived + 1;
      CONTINUE;
    END IF;

    FOR v_product IN SELECT * FROM jsonb_array_elements(v_card->'products')
    LOOP
      v_doc_in    := NULLIF(TRIM(v_product->>'documento'), '');
      v_desc_in   := v_product->>'description';
      v_fornec_in := v_product->>'fornecedor';
      v_repres_in := v_product->>'representante';
      v_sale_in   := COALESCE((v_product->>'sale_value')::DECIMAL, 0);
      v_cost_in   := COALESCE((v_product->>'supplier_cost')::DECIMAL, 0);
      v_dini_in   := NULLIF(v_product->>'data_inicio', '')::DATE;
      v_dfim_in   := NULLIF(v_product->>'data_fim', '')::DATE;
      v_cancel_in := NULLIF(v_product->>'data_cancelamento', '')::DATE;

      v_match := NULL;

      IF v_card_venda_num IS NOT NULL AND v_doc_in IS NOT NULL THEN
        SELECT id, description, sale_value, supplier_cost, fornecedor,
               representante, documento, data_inicio, data_fim,
               archived_at, archived_reason
        INTO v_match
        FROM card_financial_items
        WHERE card_id = v_card_id
          AND (archived_at IS NULL OR archived_reason = 'monde_cancelamento')
          AND monde_venda_num = v_card_venda_num
          AND TRIM(COALESCE(documento, '')) = v_doc_in
          AND id != ALL(v_matched_ids)
        ORDER BY archived_at NULLS FIRST, created_at ASC
        LIMIT 1;
      END IF;

      IF v_match IS NULL AND v_card_venda_num IS NOT NULL THEN
        SELECT id, description, sale_value, supplier_cost, fornecedor,
               representante, documento, data_inicio, data_fim,
               archived_at, archived_reason
        INTO v_match
        FROM card_financial_items
        WHERE card_id = v_card_id
          AND (archived_at IS NULL OR archived_reason = 'monde_cancelamento')
          AND monde_venda_num = v_card_venda_num
          AND LOWER(COALESCE(description, '')) = LOWER(COALESCE(v_desc_in, ''))
          AND LOWER(COALESCE(fornecedor, ''))  = LOWER(COALESCE(v_fornec_in, ''))
          AND COALESCE(sale_value, 0)          = v_sale_in
          AND COALESCE(data_inicio, DATE '1900-01-01') = COALESCE(v_dini_in, DATE '1900-01-01')
          AND COALESCE(data_fim,    DATE '1900-01-01') = COALESCE(v_dfim_in, DATE '1900-01-01')
          AND id != ALL(v_matched_ids)
        ORDER BY archived_at NULLS FIRST, created_at ASC
        LIMIT 1;
      END IF;

      IF v_match IS NULL AND v_card_venda_num IS NULL THEN
        SELECT id, description, sale_value, supplier_cost, fornecedor,
               representante, documento, data_inicio, data_fim,
               archived_at, archived_reason
        INTO v_match
        FROM card_financial_items
        WHERE card_id = v_card_id
          AND archived_at IS NULL
          AND LOWER(COALESCE(description, '')) = LOWER(COALESCE(v_desc_in, ''))
          AND LOWER(COALESCE(fornecedor, ''))  = LOWER(COALESCE(v_fornec_in, ''))
          AND COALESCE(documento, '')          = COALESCE(v_doc_in, '')
          AND id != ALL(v_matched_ids)
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

      IF v_match IS NOT NULL THEN
        v_was_cancelled := (v_match.archived_at IS NOT NULL
                            AND v_match.archived_reason = 'monde_cancelamento');

        IF v_cancel_in IS NOT NULL THEN
          IF v_was_cancelled THEN
            SELECT data_cancelamento INTO v_existing_cancel_date
            FROM card_financial_items WHERE id = v_match.id;

            IF v_existing_cancel_date IS DISTINCT FROM v_cancel_in THEN
              UPDATE card_financial_items
              SET data_cancelamento = v_cancel_in,
                  updated_at = NOW()
              WHERE id = v_match.id;
            END IF;
            v_products_unchanged := v_products_unchanged + 1;
          ELSE
            UPDATE card_financial_items
            SET archived_at = NOW(),
                archived_reason = 'monde_cancelamento',
                data_cancelamento = v_cancel_in,
                updated_at = NOW()
            WHERE id = v_match.id;
            v_products_cancelled := v_products_cancelled + 1;
          END IF;

          v_matched_ids := array_append(v_matched_ids, v_match.id);
          CONTINUE;
        END IF;

        IF v_was_cancelled THEN
          UPDATE card_financial_items
          SET archived_at = NULL,
              archived_reason = NULL,
              data_cancelamento = NULL,
              updated_at = NOW()
          WHERE id = v_match.id;
          v_products_reactivated := v_products_reactivated + 1;
        END IF;

        v_diff_parts := ARRAY[]::TEXT[];

        IF COALESCE(v_match.sale_value, 0) IS DISTINCT FROM v_sale_in THEN
          v_diff_parts := array_append(v_diff_parts,
            'preço: R$ ' || to_char(COALESCE(v_match.sale_value, 0), 'FM999G999G990D00') ||
            ' → R$ ' || to_char(v_sale_in, 'FM999G999G990D00'));
        END IF;
        IF COALESCE(v_match.supplier_cost, 0) IS DISTINCT FROM v_cost_in THEN
          v_diff_parts := array_append(v_diff_parts,
            'custo: R$ ' || to_char(COALESCE(v_match.supplier_cost, 0), 'FM999G999G990D00') ||
            ' → R$ ' || to_char(v_cost_in, 'FM999G999G990D00'));
        END IF;
        IF COALESCE(v_match.fornecedor, '') IS DISTINCT FROM COALESCE(v_fornec_in, '') THEN
          v_diff_parts := array_append(v_diff_parts,
            'fornecedor: ' || COALESCE(NULLIF(v_match.fornecedor, ''), '∅') ||
            ' → ' || COALESCE(NULLIF(v_fornec_in, ''), '∅'));
        END IF;
        IF COALESCE(v_match.representante, '') IS DISTINCT FROM COALESCE(v_repres_in, '') THEN
          v_diff_parts := array_append(v_diff_parts,
            'representante: ' || COALESCE(NULLIF(v_match.representante, ''), '∅') ||
            ' → ' || COALESCE(NULLIF(v_repres_in, ''), '∅'));
        END IF;
        IF v_doc_in IS NOT NULL AND COALESCE(v_match.documento, '') IS DISTINCT FROM v_doc_in THEN
          v_diff_parts := array_append(v_diff_parts,
            'documento: ' || COALESCE(NULLIF(v_match.documento, ''), '∅') ||
            ' → ' || v_doc_in);
        END IF;
        IF COALESCE(v_match.data_inicio, DATE '1900-01-01') IS DISTINCT FROM COALESCE(v_dini_in, DATE '1900-01-01') THEN
          v_diff_parts := array_append(v_diff_parts,
            'início: ' || COALESCE(to_char(v_match.data_inicio, 'DD/MM/YYYY'), '∅') ||
            ' → ' || COALESCE(to_char(v_dini_in, 'DD/MM/YYYY'), '∅'));
        END IF;
        IF COALESCE(v_match.data_fim, DATE '1900-01-01') IS DISTINCT FROM COALESCE(v_dfim_in, DATE '1900-01-01') THEN
          v_diff_parts := array_append(v_diff_parts,
            'fim: ' || COALESCE(to_char(v_match.data_fim, 'DD/MM/YYYY'), '∅') ||
            ' → ' || COALESCE(to_char(v_dfim_in, 'DD/MM/YYYY'), '∅'));
        END IF;
        IF COALESCE(v_match.description, '') IS DISTINCT FROM COALESCE(v_desc_in, '') THEN
          v_diff_parts := array_append(v_diff_parts,
            'produto: ' || COALESCE(NULLIF(v_match.description, ''), '∅') ||
            ' → ' || COALESCE(NULLIF(v_desc_in, ''), '∅'));
        END IF;

        IF array_length(v_diff_parts, 1) IS NULL THEN
          IF NOT v_was_cancelled THEN
            v_products_unchanged := v_products_unchanged + 1;
          END IF;
        ELSE
          v_summary := array_to_string(v_diff_parts, ' · ');

          UPDATE card_financial_items
          SET description    = v_desc_in,
              sale_value     = v_sale_in,
              supplier_cost  = v_cost_in,
              fornecedor     = v_fornec_in,
              representante  = v_repres_in,
              documento      = COALESCE(v_doc_in, documento),
              data_inicio    = v_dini_in,
              data_fim       = v_dfim_in,
              is_ready       = FALSE,
              last_change_summary = v_summary,
              last_change_at = NOW(),
              updated_at     = NOW()
          WHERE id = v_match.id;

          v_products_updated := v_products_updated + 1;
        END IF;

        v_matched_ids := array_append(v_matched_ids, v_match.id);
      ELSE
        IF v_cancel_in IS NOT NULL THEN
          INSERT INTO card_financial_items (
            card_id, product_type, description, sale_value, supplier_cost,
            fornecedor, representante, documento, data_inicio, data_fim,
            monde_venda_num, archived_at, archived_reason, data_cancelamento
          ) VALUES (
            v_card_id, 'custom', v_desc_in, v_sale_in, v_cost_in,
            v_fornec_in, v_repres_in, v_doc_in, v_dini_in, v_dfim_in,
            v_card_venda_num, NOW(), 'monde_cancelamento', v_cancel_in
          )
          RETURNING id INTO v_item_id;

          v_products_cancelled := v_products_cancelled + 1;
          v_matched_ids := array_append(v_matched_ids, v_item_id);
        ELSE
          INSERT INTO card_financial_items (
            card_id, product_type, description, sale_value, supplier_cost,
            fornecedor, representante, documento, data_inicio, data_fim,
            monde_venda_num
          ) VALUES (
            v_card_id, 'custom', v_desc_in, v_sale_in, v_cost_in,
            v_fornec_in, v_repres_in, v_doc_in, v_dini_in, v_dfim_in,
            v_card_venda_num
          )
          RETURNING id INTO v_item_id;

          v_pax_idx := 0;
          IF v_product->'passageiros' IS NOT NULL AND jsonb_array_length(v_product->'passageiros') > 0 THEN
            FOR v_pax_name IN SELECT jsonb_array_elements_text(v_product->'passageiros')
            LOOP
              INSERT INTO financial_item_passengers (financial_item_id, card_id, nome, ordem)
              VALUES (v_item_id, v_card_id, v_pax_name, v_pax_idx);
              v_pax_idx := v_pax_idx + 1;
            END LOOP;
          END IF;

          v_products_inserted := v_products_inserted + 1;
          v_matched_ids := array_append(v_matched_ids, v_item_id);
        END IF;
      END IF;
    END LOOP;

    -- ────────────────────────────────────────────────────────────────────
    -- CLEANUP v10: arquivo Monde é fonte de verdade.
    -- Produto que sumiu do arquivo é arquivado independente do is_ready.
    -- Operação re-confirma manualmente quando o produto voltar (se voltar).
    -- ────────────────────────────────────────────────────────────────────
    IF v_card_venda_num IS NOT NULL THEN
      WITH archived AS (
        UPDATE card_financial_items
        SET archived_at = NOW(),
            archived_reason = 'monde_reupload_removed',
            updated_at = NOW()
        WHERE card_id = v_card_id
          AND monde_venda_num = v_card_venda_num
          AND archived_at IS NULL
          AND id != ALL(v_matched_ids)
        RETURNING id
      )
      SELECT COUNT(*) INTO v_archived_now FROM archived;

      v_products_archived := v_products_archived + COALESCE(v_archived_now, 0);
    END IF;

    SELECT
      COALESCE(SUM(sale_value), 0),
      COALESCE(SUM(supplier_cost), 0),
      COUNT(*)
    INTO v_total_venda, v_total_custo, v_item_count
    FROM card_financial_items
    WHERE card_id = v_card_id AND archived_at IS NULL;

    IF v_item_count > 0 THEN
      v_receita := v_total_venda - v_total_custo;
      UPDATE cards
      SET valor_final    = v_total_venda,
          receita        = v_receita,
          receita_source = 'calculated',
          updated_at     = NOW()
      WHERE id = v_card_id;
    END IF;

    v_cards_updated := v_cards_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'cards_updated', v_cards_updated,
    'cards_skipped_archived', v_cards_skipped_archived,
    'products_inserted', v_products_inserted,
    'products_updated', v_products_updated,
    'products_unchanged', v_products_unchanged,
    'products_archived', v_products_archived,
    'products_cancelled', v_products_cancelled,
    'products_reactivated', v_products_reactivated
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- B. find_cards_by_monde_vendas v3 — busca via card_financial_items
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.find_cards_by_monde_vendas(TEXT[]);
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
  -- Fonte de verdade: card_financial_items.monde_venda_num
  -- (numeros_venda_monde_historico no card é apenas metadado/auditoria.)
  SELECT DISTINCT
    c.id AS card_id,
    c.titulo::TEXT AS card_titulo,
    cfi.monde_venda_num AS venda_num,
    'item'::TEXT AS match_source
  FROM card_financial_items cfi
  JOIN cards c ON c.id = cfi.card_id
  WHERE cfi.monde_venda_num = ANY(p_venda_nums)
    AND cfi.archived_at IS NULL
    AND c.archived_at IS NULL
    AND c.org_id = COALESCE(p_org_id, requesting_org_id());
$$;

GRANT EXECUTE ON FUNCTION public.find_cards_by_monde_vendas(TEXT[], UUID) TO authenticated;

COMMIT;
