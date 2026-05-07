-- ============================================================================
-- MIGRATION: bulk_import_financial_items v6 — diff desmarca is_ready
-- Date: 2026-05-07
--
-- Refinamento da regra de "preservação":
--   v5 (20260507h) preservava is_ready em qualquer item que continuasse no
--   arquivo, independente de ter mudado. Errado: se o Monde alterou preço,
--   fornecedor ou datas, a equipe de pós-venda precisa REVISAR — o "feito"
--   anterior pode já não ser mais válido.
--
-- Regra de negócio (corrigida):
--   "Se mudou qualquer coisa no produto, desmarcar o feito e mostrar
--    visualmente o que mudou. Se não mudou, não desmarca."
--
-- Comportamento:
--   - Match no arquivo + nenhum campo cadastral diferente → no-op (preserva
--     is_ready, last_change_summary do estado anterior).
--   - Match no arquivo + algum campo diferente → UPDATE dos campos +
--     SET is_ready=false, last_change_summary='preço: R$ X → R$ Y · ...',
--     last_change_at=NOW().
--   - Sem match → INSERT (is_ready=false default, sem summary).
--   - Sumiu do arquivo → archived (igual v5).
--
-- Quando a equipe re-marca como feito (is_ready=true) na UI, o trigger
-- abaixo limpa last_change_summary e last_change_at — o "alerta de mudança"
-- some, indicando que a pessoa leu e aceitou.
-- ============================================================================

-- ─── Schema: colunas pra exibir o diff na UI ───
ALTER TABLE card_financial_items
  ADD COLUMN IF NOT EXISTS last_change_summary TEXT,
  ADD COLUMN IF NOT EXISTS last_change_at TIMESTAMPTZ;

COMMENT ON COLUMN card_financial_items.last_change_summary IS
  'Resumo humano do que mudou no último re-import Monde. Limpa quando user re-marca is_ready=true. NULL = sem mudança pendente.';
COMMENT ON COLUMN card_financial_items.last_change_at IS
  'Quando ocorreu o último re-import que alterou campos cadastrais. NULL = sem mudança pendente.';

-- ─── Trigger: ao re-marcar is_ready=true, limpa o aviso ───
CREATE OR REPLACE FUNCTION fn_clear_change_summary_on_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_ready = TRUE
     AND COALESCE(OLD.is_ready, FALSE) = FALSE
     AND OLD.last_change_summary IS NOT NULL THEN
    NEW.last_change_summary := NULL;
    NEW.last_change_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_change_summary_on_ready ON card_financial_items;
CREATE TRIGGER trg_clear_change_summary_on_ready
  BEFORE UPDATE ON card_financial_items
  FOR EACH ROW
  EXECUTE FUNCTION fn_clear_change_summary_on_ready();

-- ─── RPC com diff + desmarca ───
CREATE OR REPLACE FUNCTION bulk_import_financial_items(p_cards JSONB)
RETURNS JSONB AS $$
DECLARE
  v_card JSONB;
  v_product JSONB;
  v_card_id UUID;
  v_card_venda_num TEXT;
  v_item_id UUID;
  v_match RECORD;
  v_cards_updated INTEGER := 0;
  v_products_inserted INTEGER := 0;
  v_products_updated INTEGER := 0;
  v_products_unchanged INTEGER := 0;
  v_products_archived INTEGER := 0;
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
  v_diff_parts TEXT[];
  v_summary TEXT;
BEGIN
  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards)
  LOOP
    v_card_id := (v_card->>'card_id')::UUID;
    v_card_venda_num := NULLIF(v_card->>'monde_venda_num', '');
    v_matched_ids := ARRAY[]::UUID[];

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

      v_match := NULL;

      -- Tentativa 1: match por documento (mesmo card/venda)
      IF v_card_venda_num IS NOT NULL AND v_doc_in IS NOT NULL THEN
        SELECT id, description, sale_value, supplier_cost, fornecedor,
               representante, documento, data_inicio, data_fim
        INTO v_match
        FROM card_financial_items
        WHERE card_id = v_card_id
          AND archived_at IS NULL
          AND monde_venda_num = v_card_venda_num
          AND TRIM(COALESCE(documento, '')) = v_doc_in
          AND id != ALL(v_matched_ids)
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

      -- Tentativa 2: fallback por tupla cadastral (mesma venda)
      IF v_match IS NULL AND v_card_venda_num IS NOT NULL THEN
        SELECT id, description, sale_value, supplier_cost, fornecedor,
               representante, documento, data_inicio, data_fim
        INTO v_match
        FROM card_financial_items
        WHERE card_id = v_card_id
          AND archived_at IS NULL
          AND monde_venda_num = v_card_venda_num
          AND LOWER(COALESCE(description, '')) = LOWER(COALESCE(v_desc_in, ''))
          AND LOWER(COALESCE(fornecedor, ''))  = LOWER(COALESCE(v_fornec_in, ''))
          AND COALESCE(sale_value, 0)          = v_sale_in
          AND COALESCE(data_inicio, DATE '1900-01-01') = COALESCE(v_dini_in, DATE '1900-01-01')
          AND COALESCE(data_fim,    DATE '1900-01-01') = COALESCE(v_dfim_in, DATE '1900-01-01')
          AND id != ALL(v_matched_ids)
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

      -- Tentativa 3: legado (chamadas sem monde_venda_num)
      IF v_match IS NULL AND v_card_venda_num IS NULL THEN
        SELECT id, description, sale_value, supplier_cost, fornecedor,
               representante, documento, data_inicio, data_fim
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
        -- ─── Computa diff humano por campo cadastral ───
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
          -- Nenhum campo mudou — preserva tudo, inclusive is_ready
          v_products_unchanged := v_products_unchanged + 1;
        ELSE
          -- Mudou algo — atualiza campos, desmarca is_ready, registra diff
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
        -- INSERT novo item (is_ready=false default)
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
    END LOOP;

    -- Itens da venda removidos do arquivo → archived
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

    -- Recalcula totais do card
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
    'products_inserted', v_products_inserted,
    'products_updated', v_products_updated,
    'products_unchanged', v_products_unchanged,
    'products_archived', v_products_archived,
    'products_imported', v_products_inserted,
    'products_skipped', v_products_unchanged,
    'vendas_skipped', 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
