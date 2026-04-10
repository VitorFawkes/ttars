-- ============================================================
-- Fix: trigger deve processar TODOS os números de venda
-- (primário + histórico), não apenas o numero_venda_monde
--
-- Problema: quando o usuário adiciona múltiplos números de
-- venda ao histórico, o trigger só vinculava o primário.
-- ============================================================

CREATE OR REPLACE FUNCTION trg_match_pending_monde_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_new_num TEXT;
  v_old_num TEXT;
  v_pending RECORD;
  v_product JSONB;
  v_org UUID;
  v_hist_entry JSONB;
  v_hist_num TEXT;
  v_old_hist_nums TEXT[];
  v_nums_to_check TEXT[];
BEGIN
  v_org := COALESCE(NEW.org_id, requesting_org_id());

  -- Coletar números antigos do histórico para comparação
  v_old_hist_nums := ARRAY[]::TEXT[];
  IF OLD.produto_data->'numeros_venda_monde_historico' IS NOT NULL THEN
    FOR v_hist_entry IN SELECT * FROM jsonb_array_elements(OLD.produto_data->'numeros_venda_monde_historico')
    LOOP
      v_old_hist_nums := array_append(v_old_hist_nums, v_hist_entry->>'numero');
    END LOOP;
  END IF;

  -- Coletar TODOS os números novos que precisam ser verificados
  v_nums_to_check := ARRAY[]::TEXT[];

  -- 1. Verificar número primário (se mudou)
  v_new_num := NEW.produto_data->>'numero_venda_monde';
  v_old_num := OLD.produto_data->>'numero_venda_monde';
  IF v_new_num IS NOT NULL AND v_new_num <> '' AND v_new_num <> COALESCE(v_old_num, '') THEN
    v_nums_to_check := array_append(v_nums_to_check, v_new_num);
  END IF;

  -- 2. Verificar números NOVOS no histórico (que não existiam antes)
  IF NEW.produto_data->'numeros_venda_monde_historico' IS NOT NULL THEN
    FOR v_hist_entry IN SELECT * FROM jsonb_array_elements(NEW.produto_data->'numeros_venda_monde_historico')
    LOOP
      v_hist_num := v_hist_entry->>'numero';
      IF v_hist_num IS NOT NULL AND v_hist_num <> '' AND NOT (v_hist_num = ANY(v_old_hist_nums)) THEN
        -- Evitar duplicata se já está na lista por ser primário
        IF NOT (v_hist_num = ANY(v_nums_to_check)) THEN
          v_nums_to_check := array_append(v_nums_to_check, v_hist_num);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Nada a processar
  IF array_length(v_nums_to_check, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Processar cada número: buscar venda pendente e importar produtos
  FOREACH v_hist_num IN ARRAY v_nums_to_check
  LOOP
    SELECT * INTO v_pending
    FROM monde_pending_sales
    WHERE venda_num = v_hist_num
      AND status = 'pending'
      AND org_id = v_org
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Inserir cada produto como card_financial_item
    FOR v_product IN SELECT * FROM jsonb_array_elements(v_pending.products)
    LOOP
      INSERT INTO card_financial_items (
        card_id, description, sale_value, supplier_cost,
        fornecedor, representante, documento, data_inicio, data_fim,
        org_id
      ) VALUES (
        NEW.id,
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
        v_org
      );
    END LOOP;

    -- Marcar como matched
    UPDATE monde_pending_sales
    SET status = 'matched',
        matched_card_id = NEW.id,
        matched_at = now()
    WHERE id = v_pending.id;

    RAISE LOG '[trg_match_pending_monde_sale] Matched venda % to card %', v_hist_num, NEW.id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar trigger para também disparar quando histórico muda
DROP TRIGGER IF EXISTS trg_cards_match_pending_monde ON cards;

CREATE TRIGGER trg_cards_match_pending_monde
  AFTER UPDATE ON cards
  FOR EACH ROW
  WHEN (
    NEW.produto_data->>'numero_venda_monde' IS DISTINCT FROM OLD.produto_data->>'numero_venda_monde'
    OR NEW.produto_data->'numeros_venda_monde_historico' IS DISTINCT FROM OLD.produto_data->'numeros_venda_monde_historico'
  )
  EXECUTE FUNCTION trg_match_pending_monde_sale();
