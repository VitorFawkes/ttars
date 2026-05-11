-- ============================================================================
-- MIGRATION: Vincular card_financial_items ao numero de venda Monde de origem
-- e arquivar automaticamente quando o numero some do card.
-- Date: 2026-05-04
--
-- Comportamento:
--   - Cada item ganha duas colunas novas: monde_venda_num (origem) e
--     archived_at (soft delete).
--   - Trigger BEFORE INSERT: itens 'custom' herdam o numero_venda_monde atual
--     do card como default quando monde_venda_num nao foi explicitado.
--   - Trigger AFTER UPDATE em cards.produto_data: detecta numeros que sairam
--     da combinacao primario+historico e arquiva os itens correspondentes.
--     Restaura quando o numero volta (undo).
--   - Rebase de trg_match_pending_monde_sale (20260409): grava monde_venda_num
--     com o numero exato da venda pendente (cobre o caso de multiplas vendas
--     no mesmo card via historico).
--   - Backfill: items 'custom' de cards com numero_venda_monde recebem o
--     numero do card; se houver match documento->monde_pending_sales, usa o
--     venda_num especifico (mais preciso).
--
-- Nao destrutivo: items continuam fisicamente no banco. Queries de leitura
-- precisam filtrar archived_at IS NULL para esconder do usuario final.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em card_financial_items
-- ----------------------------------------------------------------------------

ALTER TABLE public.card_financial_items
  ADD COLUMN IF NOT EXISTS monde_venda_num TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_cfi_monde_venda_num
  ON public.card_financial_items(card_id, monde_venda_num)
  WHERE monde_venda_num IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cfi_active
  ON public.card_financial_items(card_id)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.card_financial_items.monde_venda_num IS
  'Numero da venda Monde que originou esse item. NULL = item manual ou origem desconhecida.';
COMMENT ON COLUMN public.card_financial_items.archived_at IS
  'Soft delete. NULL = ativo. Setado pelo trigger trg_archive_orphan_monde_items quando o numero de venda some do card.';
COMMENT ON COLUMN public.card_financial_items.archived_reason IS
  'Motivo do arquivamento. monde_venda_removida = numero saiu do produto_data do card pai.';

-- ----------------------------------------------------------------------------
-- 2. Backfill (preciso): match via documento contra monde_pending_sales
-- ----------------------------------------------------------------------------
-- Items que tem documento e que aparecem em monde_pending_sales matched ao card:
-- usar o venda_num especifico daquele produto.

UPDATE public.card_financial_items cfi
SET monde_venda_num = mps.venda_num
FROM public.monde_pending_sales mps,
     LATERAL jsonb_array_elements(mps.products) p
WHERE cfi.card_id = mps.matched_card_id
  AND cfi.monde_venda_num IS NULL
  AND mps.status IN ('matched','imported')
  AND COALESCE(cfi.documento, '') = COALESCE(p->>'documento', '')
  AND COALESCE(cfi.documento, '') <> '';

-- ----------------------------------------------------------------------------
-- 3. Backfill (heuristica): items 'custom' restantes herdam numero_venda_monde do card
-- ----------------------------------------------------------------------------
-- Cobre items criados pela bulk_create_pos_venda_cards (que nao gravava documento)
-- e por importacoes legacy. Inexato em cards com multiplas vendas no historico,
-- mas e o melhor que da pra inferir sem rastro.

UPDATE public.card_financial_items cfi
SET monde_venda_num = c.produto_data->>'numero_venda_monde'
FROM public.cards c
WHERE cfi.card_id = c.id
  AND cfi.monde_venda_num IS NULL
  AND cfi.product_type = 'custom'
  AND c.produto_data->>'numero_venda_monde' IS NOT NULL
  AND c.produto_data->>'numero_venda_monde' <> '';

-- ----------------------------------------------------------------------------
-- 4. Trigger BEFORE INSERT em card_financial_items: default monde_venda_num
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_default_monde_venda_num()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_numero TEXT;
BEGIN
  -- Se o caller passou explicitamente, respeita
  IF NEW.monde_venda_num IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- So aplica heuristica para items 'custom' (vindos de importacao Monde).
  -- Items manuais ('catalogo', 'voo', etc) nao recebem default — usuario nao
  -- quer que sumam quando ele apaga um numero de venda.
  IF NEW.product_type IS DISTINCT FROM 'custom' THEN
    RETURN NEW;
  END IF;

  SELECT produto_data->>'numero_venda_monde'
    INTO v_card_numero
  FROM public.cards
  WHERE id = NEW.card_id;

  IF v_card_numero IS NOT NULL AND v_card_numero <> '' THEN
    NEW.monde_venda_num := v_card_numero;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_monde_venda_num ON public.card_financial_items;
CREATE TRIGGER trg_default_monde_venda_num
  BEFORE INSERT ON public.card_financial_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_default_monde_venda_num();

-- ----------------------------------------------------------------------------
-- 5. Trigger AFTER UPDATE em cards.produto_data: arquiva orfaos
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_archive_orphan_monde_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_numbers TEXT[] := ARRAY[]::TEXT[];
  v_new_numbers TEXT[] := ARRAY[]::TEXT[];
  v_removed TEXT[];
  v_added TEXT[];
  v_n TEXT;
  v_entry JSONB;
BEGIN
  -- Coletar OLD: primario + historico
  v_n := OLD.produto_data->>'numero_venda_monde';
  IF v_n IS NOT NULL AND v_n <> '' THEN
    v_old_numbers := array_append(v_old_numbers, v_n);
  END IF;
  IF OLD.produto_data->'numeros_venda_monde_historico' IS NOT NULL THEN
    FOR v_entry IN SELECT * FROM jsonb_array_elements(OLD.produto_data->'numeros_venda_monde_historico')
    LOOP
      v_n := v_entry->>'numero';
      IF v_n IS NOT NULL AND v_n <> '' AND NOT (v_n = ANY(v_old_numbers)) THEN
        v_old_numbers := array_append(v_old_numbers, v_n);
      END IF;
    END LOOP;
  END IF;

  -- Coletar NEW: primario + historico
  v_n := NEW.produto_data->>'numero_venda_monde';
  IF v_n IS NOT NULL AND v_n <> '' THEN
    v_new_numbers := array_append(v_new_numbers, v_n);
  END IF;
  IF NEW.produto_data->'numeros_venda_monde_historico' IS NOT NULL THEN
    FOR v_entry IN SELECT * FROM jsonb_array_elements(NEW.produto_data->'numeros_venda_monde_historico')
    LOOP
      v_n := v_entry->>'numero';
      IF v_n IS NOT NULL AND v_n <> '' AND NOT (v_n = ANY(v_new_numbers)) THEN
        v_new_numbers := array_append(v_new_numbers, v_n);
      END IF;
    END LOOP;
  END IF;

  -- Removidos = OLD - NEW
  SELECT array_agg(n) INTO v_removed
  FROM unnest(v_old_numbers) n
  WHERE NOT (n = ANY(v_new_numbers));

  -- Restaurados = NEW - OLD (cobre undo: numero foi removido e voltou)
  SELECT array_agg(n) INTO v_added
  FROM unnest(v_new_numbers) n
  WHERE NOT (n = ANY(v_old_numbers));

  IF v_removed IS NOT NULL AND array_length(v_removed, 1) > 0 THEN
    UPDATE public.card_financial_items
       SET archived_at = NOW(),
           archived_reason = 'monde_venda_removida'
     WHERE card_id = NEW.id
       AND monde_venda_num = ANY(v_removed)
       AND archived_at IS NULL;
  END IF;

  IF v_added IS NOT NULL AND array_length(v_added, 1) > 0 THEN
    UPDATE public.card_financial_items
       SET archived_at = NULL,
           archived_reason = NULL
     WHERE card_id = NEW.id
       AND monde_venda_num = ANY(v_added)
       AND archived_at IS NOT NULL
       AND archived_reason = 'monde_venda_removida';
  END IF;

  -- Recalcular totais do card considerando apenas itens ativos.
  -- Atualiza so valor_final/receita; nao toca em produto_data, entao nao
  -- dispara este mesmo trigger recursivamente (filtrado por OF produto_data).
  IF (v_removed IS NOT NULL AND array_length(v_removed, 1) > 0)
     OR (v_added IS NOT NULL AND array_length(v_added, 1) > 0) THEN
    UPDATE public.cards c
       SET valor_final = COALESCE((
             SELECT SUM(sale_value) FROM public.card_financial_items
             WHERE card_id = NEW.id AND archived_at IS NULL
           ), 0),
           receita = COALESCE((
             SELECT SUM(sale_value - supplier_cost) FROM public.card_financial_items
             WHERE card_id = NEW.id AND archived_at IS NULL
           ), 0),
           updated_at = NOW()
     WHERE c.id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_orphan_monde_items ON public.cards;
CREATE TRIGGER trg_archive_orphan_monde_items
  AFTER UPDATE OF produto_data ON public.cards
  FOR EACH ROW
  WHEN (OLD.produto_data IS DISTINCT FROM NEW.produto_data)
  EXECUTE FUNCTION public.fn_archive_orphan_monde_items();

-- ----------------------------------------------------------------------------
-- 6. Rebase trg_match_pending_monde_sale (versao 20260409)
-- ----------------------------------------------------------------------------
-- Mesma logica da 20260409, mas grava monde_venda_num no INSERT para que o
-- trigger de arquivamento saiba exatamente qual numero originou cada item.
-- Tambem grava monde_venda_num em items criados aqui mesmo se houver multiplas
-- vendas no historico do card (caso o BEFORE INSERT default nao consiga inferir).

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
BEGIN
  v_org := COALESCE(NEW.org_id, requesting_org_id());

  -- Coletar numeros antigos do historico para comparacao
  v_old_hist_nums := ARRAY[]::TEXT[];
  IF OLD.produto_data->'numeros_venda_monde_historico' IS NOT NULL THEN
    FOR v_hist_entry IN SELECT * FROM jsonb_array_elements(OLD.produto_data->'numeros_venda_monde_historico')
    LOOP
      v_old_hist_nums := array_append(v_old_hist_nums, v_hist_entry->>'numero');
    END LOOP;
  END IF;

  -- Coletar TODOS os numeros novos que precisam ser verificados
  v_nums_to_check := ARRAY[]::TEXT[];

  -- 1. Verificar numero primario (se mudou)
  v_new_num := NEW.produto_data->>'numero_venda_monde';
  v_old_num := OLD.produto_data->>'numero_venda_monde';
  IF v_new_num IS NOT NULL AND v_new_num <> '' AND v_new_num <> COALESCE(v_old_num, '') THEN
    v_nums_to_check := array_append(v_nums_to_check, v_new_num);
  END IF;

  -- 2. Verificar numeros NOVOS no historico (que nao existiam antes)
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
    END LOOP;

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

COMMIT;
