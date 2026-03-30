-- ============================================================================
-- MIGRATION: Bulk Import Financial Items (RPC)
-- Date: 2026-03-30
--
-- RPC server-side para importação em massa de card_financial_items.
-- Recebe um JSON array com todos os cards+produtos de uma vez e processa
-- tudo em uma única transaction — elimina ~1600 round-trips HTTP.
--
-- Input JSON format:
-- [
--   {
--     "card_id": "uuid",
--     "products": [
--       {
--         "description": "Hotel X",
--         "sale_value": 5000.00,
--         "supplier_cost": 4000.00,
--         "fornecedor": "Fornecedor Y",
--         "representante": "Rep Z",
--         "documento": "LOC123",
--         "data_inicio": "2026-04-01",
--         "data_fim": "2026-04-10",
--         "passageiros": ["João Silva", "Maria Silva"]
--       }
--     ]
--   }
-- ]
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_import_financial_items(p_cards JSONB)
RETURNS JSONB AS $$
DECLARE
  v_card JSONB;
  v_product JSONB;
  v_card_id UUID;
  v_item_id UUID;
  v_cards_updated INTEGER := 0;
  v_products_imported INTEGER := 0;
  v_pax_name TEXT;
  v_pax_idx INTEGER;
  v_total_venda DECIMAL(12,2);
  v_total_custo DECIMAL(12,2);
  v_receita DECIMAL(12,2);
  v_item_count INTEGER;
BEGIN
  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards)
  LOOP
    v_card_id := (v_card->>'card_id')::UUID;

    -- 1. Delete existing financial items (cascade deletes passengers too)
    DELETE FROM card_financial_items WHERE card_id = v_card_id;

    -- 2. Insert products
    FOR v_product IN SELECT * FROM jsonb_array_elements(v_card->'products')
    LOOP
      INSERT INTO card_financial_items (
        card_id, product_type, description, sale_value, supplier_cost,
        fornecedor, representante, documento, data_inicio, data_fim
      ) VALUES (
        v_card_id,
        'custom',
        v_product->>'description',
        COALESCE((v_product->>'sale_value')::DECIMAL, 0),
        COALESCE((v_product->>'supplier_cost')::DECIMAL, 0),
        v_product->>'fornecedor',
        v_product->>'representante',
        v_product->>'documento',
        (v_product->>'data_inicio')::DATE,
        (v_product->>'data_fim')::DATE
      )
      RETURNING id INTO v_item_id;

      -- 3. Insert passengers for this product
      v_pax_idx := 0;
      IF v_product->'passageiros' IS NOT NULL AND jsonb_array_length(v_product->'passageiros') > 0 THEN
        FOR v_pax_name IN SELECT jsonb_array_elements_text(v_product->'passageiros')
        LOOP
          INSERT INTO financial_item_passengers (financial_item_id, card_id, nome, ordem)
          VALUES (v_item_id, v_card_id, v_pax_name, v_pax_idx);
          v_pax_idx := v_pax_idx + 1;
        END LOOP;
      END IF;

      v_products_imported := v_products_imported + 1;
    END LOOP;

    -- 4. Recalculate financials inline (same logic as recalcular_financeiro_manual)
    SELECT
      COALESCE(SUM(sale_value), 0),
      COALESCE(SUM(supplier_cost), 0),
      COUNT(*)
    INTO v_total_venda, v_total_custo, v_item_count
    FROM card_financial_items
    WHERE card_id = v_card_id;

    IF v_item_count > 0 THEN
      v_receita := v_total_venda - v_total_custo;

      UPDATE cards
      SET
        valor_final = v_total_venda,
        receita = v_receita,
        receita_source = 'calculated',
        updated_at = NOW()
      WHERE id = v_card_id;
    END IF;

    v_cards_updated := v_cards_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'cards_updated', v_cards_updated,
    'products_imported', v_products_imported
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
