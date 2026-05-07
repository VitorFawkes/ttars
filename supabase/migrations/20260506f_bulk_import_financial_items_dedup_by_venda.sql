-- ============================================================================
-- MIGRATION: bulk_import_financial_items — dedup por monde_venda_num
-- Date: 2026-05-06
--
-- Problema:
--   A versão anterior (20260414) deduplica por (card_id, description,
--   fornecedor, documento). Quando o Monde adiciona documento/representante
--   depois da 1ª importação, o re-upload da mesma venda gera duplicatas
--   porque a chave de dedup mudou (documento vazio vs preenchido). Isso
--   gerou 87 itens duplicados em 47 cards (corrigido pela migration
--   20260506e).
--
-- Solução:
--   1. RPC aceita p_cards com chave opcional `monde_venda_num` por card.
--   2. Antes de inserir qualquer produto da venda, verifica se já existe
--      QUALQUER item ativo no card com esse monde_venda_num.
--      Se sim, pula a venda inteira (escolha conservadora: assume que a
--      venda já foi importada antes — re-upload deve ser no-op).
--   3. Mantém a dedup antiga (description+fornecedor+documento) como
--      fallback para chamadas que não passam monde_venda_num.
--   4. Popula `monde_venda_num` nos itens inseridos para futuras dedups.
--
-- Não destrutivo. Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_import_financial_items(p_cards JSONB)
RETURNS JSONB AS $$
DECLARE
  v_card JSONB;
  v_product JSONB;
  v_card_id UUID;
  v_card_venda_num TEXT;
  v_item_id UUID;
  v_cards_updated INTEGER := 0;
  v_products_imported INTEGER := 0;
  v_products_skipped INTEGER := 0;
  v_vendas_skipped INTEGER := 0;
  v_exists BOOLEAN;
  v_pax_name TEXT;
  v_pax_idx INTEGER;
  v_total_venda DECIMAL(12,2);
  v_total_custo DECIMAL(12,2);
  v_receita DECIMAL(12,2);
  v_item_count INTEGER;
  v_existing_venda_count INTEGER;
BEGIN
  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards)
  LOOP
    v_card_id := (v_card->>'card_id')::UUID;
    v_card_venda_num := NULLIF(v_card->>'monde_venda_num', '');

    -- ─── Idempotência forte: se a venda já foi importada para este card,
    -- pula o batch inteiro (consistente com trg_match_pending_monde_sale).
    IF v_card_venda_num IS NOT NULL THEN
      SELECT COUNT(*) INTO v_existing_venda_count
      FROM card_financial_items
      WHERE card_id = v_card_id
        AND monde_venda_num = v_card_venda_num
        AND archived_at IS NULL;

      IF v_existing_venda_count > 0 THEN
        v_products_skipped := v_products_skipped + jsonb_array_length(v_card->'products');
        v_vendas_skipped := v_vendas_skipped + 1;
        CONTINUE;
      END IF;
    END IF;

    FOR v_product IN SELECT * FROM jsonb_array_elements(v_card->'products')
    LOOP
      -- ─── Dedup fallback (compatível com chamadas sem monde_venda_num):
      -- match por description + fornecedor + documento, case-insensitive,
      -- só itens ativos.
      SELECT EXISTS (
        SELECT 1 FROM card_financial_items
        WHERE card_id = v_card_id
          AND archived_at IS NULL
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
        fornecedor, representante, documento, data_inicio, data_fim,
        monde_venda_num
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
        (v_product->>'data_fim')::DATE,
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

      v_products_imported := v_products_imported + 1;
    END LOOP;

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
    'products_skipped', v_products_skipped,
    'vendas_skipped', v_vendas_skipped
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
