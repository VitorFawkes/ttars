-- ============================================================================
-- MIGRATION: bulk_import_financial_items v7 — tratar Data Cancelamento
-- Date: 2026-05-11
--
-- Base: v6 (20260507j_bulk_import_diff_unmarks_ready.sql). Releitura confirmada
-- de v4 (20260414, legacy match), v5 (20260507h, archive de items removidos)
-- e v6 (20260507j, diff cadastral desmarca is_ready). Todas as correções
-- incrementais foram preservadas.
--
-- Mudança principal vs v6:
--   Relatório Monde agora pode trazer coluna "Data Cancelamento" por linha.
--   Quando preenchida, o produto correspondente foi cancelado no Monde.
--
-- Regras novas:
--   1. Match agora aceita items archived com archived_reason='monde_cancelamento'
--      (precisa enxergá-los para detectar reativação).
--   2. Item ativo + CSV traz data_cancelamento → arquiva como
--      archived_reason='monde_cancelamento', popula data_cancelamento.
--      NÃO toca is_ready nem last_change_summary (não é mudança cadastral,
--      é saída do escopo ativo).
--   3. Item archived com 'monde_cancelamento' + CSV sem data_cancelamento →
--      reativa (archived_at=NULL, archived_reason=NULL, data_cancelamento=NULL)
--      e depois passa pelo diff normal (pode vir com campos mudados também).
--   4. Item archived com 'monde_cancelamento' + CSV ainda traz data → no-op.
--   5. INSERT sem match + CSV traz data → INSERT já archived, sem passageiros.
--
-- v_matched_ids inclui items cancelados nesse ciclo, para que o passo
-- "itens removidos do arquivo" não re-arquive com razão errada.
--
-- DROP + CREATE em vez de CREATE OR REPLACE porque a função não tem grants
-- externos custom no projeto (verificado via grep) e o hook warn-function-rebase
-- bloqueia rewrites cegos — esse rewrite NÃO é cego (todas as versões anteriores
-- foram relidas e suas correções preservadas).
-- ============================================================================

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
      v_cancel_in := NULLIF(v_product->>'data_cancelamento', '')::DATE;

      v_match := NULL;

      -- Tentativa 1: match por documento (mesmo card/venda).
      -- Aceita items ativos OU archived com razão monde_cancelamento (reativação).
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

      -- Tentativa 2: fallback por tupla cadastral (mesma venda).
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

      -- Tentativa 3: legado (chamadas sem monde_venda_num)
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

        -- ─── Ramo CANCELAMENTO: CSV traz data_cancelamento ───
        IF v_cancel_in IS NOT NULL THEN
          IF v_was_cancelled THEN
            -- Já cancelado, segue cancelado. Atualiza só data_cancelamento se mudou.
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
            -- Item ativo virou cancelado.
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

        -- ─── Ramo REATIVAÇÃO: archived com 'monde_cancelamento' mas CSV sem data ───
        IF v_was_cancelled THEN
          UPDATE card_financial_items
          SET archived_at = NULL,
              archived_reason = NULL,
              data_cancelamento = NULL,
              updated_at = NOW()
          WHERE id = v_match.id;
          v_products_reactivated := v_products_reactivated + 1;
          -- Não dá CONTINUE — segue para o diff abaixo (pode ter vindo com campos mudados).
        END IF;

        -- ─── Ramo NORMAL: diff cadastral (v6 mantida) ───
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
          -- Sem mudança cadastral. Se foi reativado nesse ciclo, contador já
          -- subiu acima; senão, é um no-op clássico (preserva is_ready).
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
        -- ─── Sem match: INSERT novo ───
        IF v_cancel_in IS NOT NULL THEN
          -- Já chega cancelado: registra como archived, sem passageiros.
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
          -- INSERT ativo normal (v6).
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

    -- Itens da venda que sumiram do arquivo (não estavam no payload) → archived.
    -- v_matched_ids inclui items cancelados/reativados nesse ciclo, então não
    -- vão ser re-arquivados aqui com razão errada (preserva semântica v5).
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

    -- Recalcula totais do card (preserva semântica v5/v6: só atualiza se ainda
    -- há items ativos; cards que ficam sem nenhum item mantém valor anterior).
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
    'products_cancelled', v_products_cancelled,
    'products_reactivated', v_products_reactivated,
    'products_imported', v_products_inserted,
    'products_skipped', v_products_unchanged,
    'vendas_skipped', 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
