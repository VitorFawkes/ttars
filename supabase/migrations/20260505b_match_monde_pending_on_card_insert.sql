-- ============================================================================
-- MIGRATION: Card recém-criado puxa valor da venda Monde automaticamente
-- Date: 2026-05-05
--
-- Problema:
--   Quando a planilha "por viagem" CRIA um card já com numero_venda_monde
--   no produto_data (INSERT), o trigger trg_cards_match_pending_monde não
--   dispara — ele só roda em AFTER UPDATE. Resultado: card nasce com
--   valor_final=0 mesmo quando a venda já está em monde_pending_sales.
--
-- Solução:
--   1. Reescreve trg_match_pending_monde_sale para:
--      a. Funcionar em INSERT (OLD = NULL não quebra)
--      b. Recalcular cards.valor_final/receita ao final (não há trigger
--         em card_financial_items que faça isso)
--      c. Idempotente: pula numero que já tem items no card (evita
--         duplicação se RPC bulk_create_pos_venda_cards já inseriu items
--         próprios e venda também está em pending_sales)
--   2. Cria trigger trg_cards_match_pending_monde_insert AFTER INSERT
--      em cards, espelho do trigger AFTER UPDATE existente.
--
-- Não destrutivo: trigger AFTER UPDATE continua exatamente igual.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Reescreve a função para suportar INSERT + recalcular valor_final/receita
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_match_pending_monde_sale()
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
  v_existing_count INT;
  v_inserted_any BOOLEAN := FALSE;
BEGIN
  v_org := COALESCE(NEW.org_id, requesting_org_id());

  -- Coletar numeros antigos do historico para comparacao.
  -- Em INSERT, OLD nao existe / e NULL — tratamos como historico vazio.
  v_old_hist_nums := ARRAY[]::TEXT[];
  IF TG_OP = 'UPDATE' AND OLD.produto_data->'numeros_venda_monde_historico' IS NOT NULL THEN
    FOR v_hist_entry IN SELECT * FROM jsonb_array_elements(OLD.produto_data->'numeros_venda_monde_historico')
    LOOP
      v_old_hist_nums := array_append(v_old_hist_nums, v_hist_entry->>'numero');
    END LOOP;
  END IF;

  -- Coletar TODOS os numeros novos que precisam ser verificados
  v_nums_to_check := ARRAY[]::TEXT[];

  -- 1. Numero primario: em INSERT considera todo numero presente; em UPDATE so se mudou
  v_new_num := NEW.produto_data->>'numero_venda_monde';
  v_old_num := CASE WHEN TG_OP = 'UPDATE' THEN OLD.produto_data->>'numero_venda_monde' ELSE NULL END;
  IF v_new_num IS NOT NULL AND v_new_num <> '' AND v_new_num <> COALESCE(v_old_num, '') THEN
    v_nums_to_check := array_append(v_nums_to_check, v_new_num);
  END IF;

  -- 2. Numeros NOVOS no historico (em INSERT, todos sao novos)
  IF NEW.produto_data->'numeros_venda_monde_historico' IS NOT NULL THEN
    FOR v_hist_entry IN SELECT * FROM jsonb_array_elements(NEW.produto_data->'numeros_venda_monde_historico')
    LOOP
      v_hist_num := v_hist_entry->>'numero';
      IF v_hist_num IS NOT NULL AND v_hist_num <> '' AND NOT (v_hist_num = ANY(v_old_hist_nums)) THEN
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

  -- Processar cada numero: buscar venda pendente e importar produtos
  FOREACH v_hist_num IN ARRAY v_nums_to_check
  LOOP
    -- Idempotencia: se o card ja tem items ativos com este numero, pular
    -- (evita duplicacao quando RPC ja inseriu items proprios e venda tambem
    -- estava em pending_sales)
    SELECT COUNT(*) INTO v_existing_count
    FROM card_financial_items
    WHERE card_id = NEW.id
      AND monde_venda_num = v_hist_num
      AND archived_at IS NULL;

    IF v_existing_count > 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_pending
    FROM monde_pending_sales
    WHERE venda_num = v_hist_num
      AND status = 'pending'
      AND org_id = v_org
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Inserir cada produto como card_financial_item, gravando o venda_num exato
    FOR v_product IN SELECT * FROM jsonb_array_elements(v_pending.products)
    LOOP
      INSERT INTO card_financial_items (
        card_id, description, sale_value, supplier_cost,
        fornecedor, representante, documento, data_inicio, data_fim,
        org_id, monde_venda_num
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
        v_org,
        v_hist_num
      );
      v_inserted_any := TRUE;
    END LOOP;

    UPDATE monde_pending_sales
    SET status = 'matched',
        matched_card_id = NEW.id,
        matched_at = now()
    WHERE id = v_pending.id;

    RAISE LOG '[trg_match_pending_monde_sale] Matched venda % to card % (op=%)', v_hist_num, NEW.id, TG_OP;
  END LOOP;

  -- Recalcular valor_final/receita do card se inserimos algum item.
  -- Necessario porque nao ha trigger em card_financial_items que faca isso
  -- automaticamente. NAO afeta produto_data, entao nao causa recursao.
  IF v_inserted_any THEN
    UPDATE cards c
       SET valor_final = COALESCE((
             SELECT SUM(sale_value) FROM card_financial_items
             WHERE card_id = NEW.id AND archived_at IS NULL
           ), 0),
           receita = COALESCE((
             SELECT SUM(sale_value - supplier_cost) FROM card_financial_items
             WHERE card_id = NEW.id AND archived_at IS NULL
           ), 0),
           receita_source = 'monde_import',
           updated_at = NOW()
     WHERE c.id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. Trigger AFTER INSERT em cards (espelho do AFTER UPDATE existente)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_cards_match_pending_monde_insert ON public.cards;
CREATE TRIGGER trg_cards_match_pending_monde_insert
  AFTER INSERT ON public.cards
  FOR EACH ROW
  WHEN (
    NEW.produto_data IS NOT NULL
    AND (
      (NEW.produto_data->>'numero_venda_monde' IS NOT NULL AND NEW.produto_data->>'numero_venda_monde' <> '')
      OR NEW.produto_data->'numeros_venda_monde_historico' IS NOT NULL
    )
  )
  EXECUTE FUNCTION public.trg_match_pending_monde_sale();

COMMENT ON TRIGGER trg_cards_match_pending_monde_insert ON public.cards IS
  'Quando card nasce ja com numero_venda_monde (caso da planilha pos-venda por viagem), busca em monde_pending_sales e injeta items + recalcula valor_final/receita. Espelho de trg_cards_match_pending_monde (AFTER UPDATE).';

COMMIT;
