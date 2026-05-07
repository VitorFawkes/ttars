-- ============================================================================
-- MIGRATION: bulk_import_financial_items — arquiva itens removidos do Monde
-- Date: 2026-05-07
--
-- Correção da v4 (20260507g):
--   v4 NÃO arquivava itens da mesma venda que sumiam do novo arquivo.
--   Isso é errado. O arquivo Monde é a fonte de verdade da venda. Se um
--   item não está no arquivo novo, ele foi removido no Monde — tem que
--   sair do card também.
--
-- Regra de negócio (corrigida):
--   "O relatório de venda por produto do Monde é a fonte da verdade.
--    Só não podemos desmarcar algo que já estava feito pelas meninas de
--    pós-venda, mas se um produto sumir do arquivo, mesmo que tivesse
--    is_ready=true, ele tem que sumir do card."
--
-- Comportamento desta versão:
--   Para cada card+venda no batch:
--     - Reconcilia produto-a-produto (igual v4): match por documento ou
--       fallback cadastral.
--     - Match → UPDATE só campos cadastrais (sale_value, supplier_cost,
--       fornecedor, representante, datas, description). PRESERVA is_ready,
--       notes, observacoes.
--     - Sem match → INSERT (is_ready default false).
--     - **NOVO**: itens ativos da mesma venda que NÃO foram matched com
--       nenhum produto do arquivo → archived_at=NOW() com
--       archived_reason='monde_reupload_removed'. Reversível.
--
--   O archive só age dentro do escopo (card_id, monde_venda_num) presentes
--   no batch. NÃO toca em outras vendas do card. NÃO toca em itens com
--   monde_venda_num NULL (manuais).
--
-- Continuidade:
--   - Preserva todas as correções de 20260330 v1, 20260414 v2, 20260506f v3
--     e 20260507g v4.
--   - Notification logic permanece removida (decisão do v2 mantida).
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_import_financial_items(p_cards JSONB)
RETURNS JSONB AS $$
DECLARE
  v_card JSONB;
  v_product JSONB;
  v_card_id UUID;
  v_card_venda_num TEXT;
  v_item_id UUID;
  v_match_id UUID;
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

      v_match_id := NULL;

      -- ─── Tentativa 1: match forte por documento (mesmo card/venda) ───
      IF v_card_venda_num IS NOT NULL AND v_doc_in IS NOT NULL THEN
        SELECT id INTO v_match_id
        FROM card_financial_items
        WHERE card_id = v_card_id
          AND archived_at IS NULL
          AND monde_venda_num = v_card_venda_num
          AND TRIM(COALESCE(documento, '')) = v_doc_in
          AND id != ALL(v_matched_ids)
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

      -- ─── Tentativa 2: fallback por tupla cadastral (mesma venda) ───
      IF v_match_id IS NULL AND v_card_venda_num IS NOT NULL THEN
        SELECT id INTO v_match_id
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

      -- ─── Tentativa 3: fallback legado quando NÃO há monde_venda_num ───
      IF v_match_id IS NULL AND v_card_venda_num IS NULL THEN
        SELECT id INTO v_match_id
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

      IF v_match_id IS NOT NULL THEN
        UPDATE card_financial_items
        SET description    = v_desc_in,
            sale_value     = v_sale_in,
            supplier_cost  = v_cost_in,
            fornecedor     = v_fornec_in,
            representante  = v_repres_in,
            documento      = COALESCE(v_doc_in, documento),
            data_inicio    = v_dini_in,
            data_fim       = v_dfim_in,
            updated_at     = NOW()
        WHERE id = v_match_id
          AND (
            description   IS DISTINCT FROM v_desc_in
            OR sale_value IS DISTINCT FROM v_sale_in
            OR supplier_cost IS DISTINCT FROM v_cost_in
            OR fornecedor IS DISTINCT FROM v_fornec_in
            OR representante IS DISTINCT FROM v_repres_in
            OR (v_doc_in IS NOT NULL AND COALESCE(documento, '') IS DISTINCT FROM v_doc_in)
            OR data_inicio IS DISTINCT FROM v_dini_in
            OR data_fim    IS DISTINCT FROM v_dfim_in
          );

        IF FOUND THEN
          v_products_updated := v_products_updated + 1;
        ELSE
          v_products_unchanged := v_products_unchanged + 1;
        END IF;

        v_matched_ids := array_append(v_matched_ids, v_match_id);
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
    END LOOP;

    -- ─── NOVO (v5): arquivar itens da venda que sumiram do arquivo ───
    -- O arquivo Monde é a fonte de verdade. Se um item ativo tem
    -- monde_venda_num desta venda mas não foi matched com nenhum produto
    -- do batch, ele foi removido no Monde → soft-delete aqui.
    -- Reversível: UPDATE archived_at=NULL nos mesmos IDs.
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

    -- ─── Recalcula totais do card baseado nos itens ativos ───
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
    -- chaves antigas mantidas para compat:
    'products_imported', v_products_inserted,
    'products_skipped', v_products_unchanged,
    'vendas_skipped', 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
