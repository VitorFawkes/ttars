-- ============================================================================
-- MIGRATION: bulk_import_financial_items — não-destrutivo
-- Date: 2026-04-14
--
-- Substitui a versão anterior (20260330) que fazia DELETE + INSERT e zerava
-- is_ready, datas editadas e qualquer ajuste manual nos produtos do card.
--
-- Novo comportamento:
-- - Items existentes (match por description + fornecedor + documento, case-
--   insensitive) são IGNORADOS. Nada neles é alterado.
-- - Apenas produtos realmente novos são inseridos.
-- - Totais do card (valor_final, receita) são recalculados somando todos os
--   items (novos + antigos).
--
-- Contrato de retorno ganhou `products_skipped`.
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
  v_products_skipped INTEGER := 0;
  v_exists BOOLEAN;
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

    FOR v_product IN SELECT * FROM jsonb_array_elements(v_card->'products')
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM card_financial_items
        WHERE card_id = v_card_id
          AND LOWER(COALESCE(description, '')) = LOWER(COALESCE(v_product->>'description', ''))
          AND LOWER(COALESCE(fornecedor, ''))  = LOWER(COALESCE(v_product->>'fornecedor', ''))
          AND COALESCE(documento, '')          = COALESCE(v_product->>'documento', '')
      ) INTO v_exists;

      IF v_exists THEN
        v_products_skipped := v_products_skipped + 1;
        CONTINUE;
      END IF;

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
    'products_imported', v_products_imported,
    'products_skipped', v_products_skipped
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
