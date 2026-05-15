-- ============================================================================
-- MIGRATION: Multi-venda Monde — todos os números (primário + histórico) contam
-- Date: 2026-05-15
--
-- Reverte parte da semântica da 20260511c. Decisão atualizada do Vitor
-- (registrada em memory/feedback_monde_multi_venda_sempre_ativa.md):
--   "Sempre considerar TODOS os números de venda Monde do card (primário +
--    histórico). NUNCA arquivar um produto se nada mudou nele. A intenção
--    original era apenas: cards arquivados → vendas inexistentes."
--
-- Caso real motivador: card b70d31d1 (Lucas Suzumura — Austrália+Fiji) tem
-- 3 vendas Monde paralelas (67626/67649/68943) por desenho operacional. A
-- 20260511c arquivou produtos das vendas 67649 e 68943 (não-primárias) e
-- deixou só 1 produto ativo (Likuliku). Outros 100 cards foram afetados.
--
-- Mudanças:
--   1. fn_archive_orphan_monde_items: NÃO arquiva mais quando primário muda.
--      Apenas recalcula totais do card.
--   2. fn_match_pending_monde_for_card (helper novo): centraliza lógica de
--      matching, pode ser chamado pelo trigger OU pelo backfill manual.
--   3. trg_match_pending_monde_sale: dispara para QUALQUER número novo no
--      conjunto (primário ∪ histórico), não só quando primário muda.
--   4. Backfill restaurativo: desarquiva itens com archived_reason =
--      'monde_numero_substituido' (do backfill 11/05 + triggers entre 12-13/05)
--      e recalcula valor_final/receita dos cards afetados.
--   5. Backfill de matching: força match de pending sales contra cards que
--      têm o número no histórico (ficaram órfãos pela regra antiga).
--
-- DROP + CREATE em vez de OR REPLACE: ambas funções já têm múltiplas versões
-- (warn-function-rebase exige releitura das anteriores — feito).
-- Releituras: fn_archive_orphan_monde_items (20260504k → 20260511c);
-- trg_match_pending_monde_sale (20260505b → 20260511c).
--
-- Sem GRANTs externos: ambas funções não têm GRANT explícito (verificado).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. fn_archive_orphan_monde_items — NÃO arquiva mais, só recalcula totais
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_archive_orphan_monde_items() CASCADE;

CREATE FUNCTION public.fn_archive_orphan_monde_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_num TEXT;
  v_new_num TEXT;
BEGIN
  v_old_num := NULLIF(OLD.produto_data->>'numero_venda_monde', '');
  v_new_num := NULLIF(NEW.produto_data->>'numero_venda_monde', '');

  -- Apenas recalcular totais do card se mudou algo relacionado a Monde.
  -- Itens NÃO são mais arquivados aqui — todos os números do histórico
  -- continuam válidos (regra do Vitor 2026-05-15).
  IF v_old_num IS DISTINCT FROM v_new_num THEN
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
-- 2. fn_match_pending_monde_for_card — helper reutilizável
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_match_pending_monde_for_card(UUID, TEXT[]);

CREATE FUNCTION public.fn_match_pending_monde_for_card(
  p_card_id UUID,
  p_only_nums TEXT[] DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
  v_nums TEXT[];
  v_to_match TEXT;
  v_pending RECORD;
  v_product JSONB;
  v_existing_count INT;
  v_inserted_total INT := 0;
BEGIN
  SELECT * INTO v_card FROM cards WHERE id = p_card_id;
  IF NOT FOUND OR v_card.archived_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  -- Conjunto completo de números (primário + histórico)
  SELECT ARRAY(
    SELECT DISTINCT venda_num FROM (
      SELECT v_card.produto_data->>'numero_venda_monde' AS venda_num
      UNION ALL
      SELECT elem->>'numero' FROM jsonb_array_elements(
        COALESCE(v_card.produto_data->'numeros_venda_monde_historico', '[]'::JSONB)
      ) elem
    ) sub
    WHERE venda_num IS NOT NULL AND venda_num <> ''
  ) INTO v_nums;

  IF array_length(v_nums, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH v_to_match IN ARRAY v_nums
  LOOP
    -- Filtro de subset (quando trigger só quer processar números recém-adicionados)
    IF p_only_nums IS NOT NULL AND NOT (v_to_match = ANY(p_only_nums)) THEN
      CONTINUE;
    END IF;

    -- Idempotência: já existem items ativos com esse número no card? Pular.
    SELECT COUNT(*) INTO v_existing_count
    FROM card_financial_items
    WHERE card_id = p_card_id
      AND monde_venda_num = v_to_match
      AND archived_at IS NULL;

    IF v_existing_count > 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_pending
    FROM monde_pending_sales
    WHERE venda_num = v_to_match
      AND status = 'pending'
      AND org_id = v_card.org_id
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    FOR v_product IN SELECT * FROM jsonb_array_elements(v_pending.products)
    LOOP
      INSERT INTO card_financial_items (
        card_id, description, sale_value, supplier_cost,
        fornecedor, representante, documento, data_inicio, data_fim,
        org_id, monde_venda_num
      ) VALUES (
        p_card_id,
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
        v_card.org_id,
        v_to_match
      );
      v_inserted_total := v_inserted_total + 1;
    END LOOP;

    UPDATE monde_pending_sales
    SET status = 'matched',
        matched_card_id = p_card_id,
        matched_at = NOW()
    WHERE id = v_pending.id;

    RAISE LOG '[fn_match_pending_monde_for_card] Matched venda % to card %', v_to_match, p_card_id;
  END LOOP;

  -- Recalcular totais se inserimos algum item
  IF v_inserted_total > 0 THEN
    UPDATE cards c
       SET valor_final = COALESCE((
             SELECT SUM(sale_value) FROM card_financial_items
             WHERE card_id = p_card_id AND archived_at IS NULL
           ), 0),
           receita = COALESCE((
             SELECT SUM(sale_value - supplier_cost) FROM card_financial_items
             WHERE card_id = p_card_id AND archived_at IS NULL
           ), 0),
           receita_source = 'monde_import',
           updated_at = NOW()
     WHERE c.id = p_card_id;
  END IF;

  RETURN v_inserted_total;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. trg_match_pending_monde_sale — match por TODOS os números do card
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.trg_match_pending_monde_sale() CASCADE;

CREATE FUNCTION public.trg_match_pending_monde_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_set TEXT[];
  v_new_set TEXT[];
  v_diff TEXT[];
BEGIN
  -- Card arquivado é tratado como inexistente para matching
  IF NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Conjunto NOVO de números (primário + histórico)
  SELECT ARRAY(
    SELECT DISTINCT venda_num FROM (
      SELECT NEW.produto_data->>'numero_venda_monde' AS venda_num
      UNION ALL
      SELECT elem->>'numero' FROM jsonb_array_elements(
        COALESCE(NEW.produto_data->'numeros_venda_monde_historico', '[]'::JSONB)
      ) elem
    ) sub
    WHERE venda_num IS NOT NULL AND venda_num <> ''
  ) INTO v_new_set;

  IF array_length(v_new_set, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT ARRAY(
      SELECT DISTINCT venda_num FROM (
        SELECT OLD.produto_data->>'numero_venda_monde' AS venda_num
        UNION ALL
        SELECT elem->>'numero' FROM jsonb_array_elements(
          COALESCE(OLD.produto_data->'numeros_venda_monde_historico', '[]'::JSONB)
        ) elem
      ) sub
      WHERE venda_num IS NOT NULL AND venda_num <> ''
    ) INTO v_old_set;
  ELSE
    v_old_set := ARRAY[]::TEXT[];
  END IF;

  -- Apenas números NOVOS (não estavam antes) precisam ser processados
  v_diff := ARRAY(SELECT unnest(v_new_set) EXCEPT SELECT unnest(v_old_set));

  IF array_length(v_diff, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM fn_match_pending_monde_for_card(NEW.id, v_diff);

  RETURN NEW;
END;
$$;

-- Re-criar os 2 triggers (foram removidos pelo CASCADE)
DROP TRIGGER IF EXISTS trg_cards_match_pending_monde ON public.cards;
CREATE TRIGGER trg_cards_match_pending_monde
  AFTER UPDATE ON public.cards
  FOR EACH ROW
  WHEN (
    NEW.produto_data IS NOT NULL
    AND NEW.produto_data IS DISTINCT FROM OLD.produto_data
  )
  EXECUTE FUNCTION public.trg_match_pending_monde_sale();

DROP TRIGGER IF EXISTS trg_cards_match_pending_monde_insert ON public.cards;
CREATE TRIGGER trg_cards_match_pending_monde_insert
  AFTER INSERT ON public.cards
  FOR EACH ROW
  WHEN (NEW.produto_data IS NOT NULL)
  EXECUTE FUNCTION public.trg_match_pending_monde_sale();

-- ----------------------------------------------------------------------------
-- 4. Backfill restaurativo: desarquiva itens 'monde_numero_substituido'
-- ----------------------------------------------------------------------------

WITH restored AS (
  UPDATE card_financial_items
     SET archived_at = NULL,
         archived_reason = NULL,
         updated_at = NOW()
   WHERE archived_reason = 'monde_numero_substituido'
     AND archived_at IS NOT NULL
  RETURNING card_id, id
),
cards_afetados AS (
  SELECT DISTINCT card_id FROM restored
)
UPDATE cards c
   SET valor_final = COALESCE((
         SELECT SUM(sale_value) FROM card_financial_items
         WHERE card_id = c.id AND archived_at IS NULL
       ), 0),
       receita = COALESCE((
         SELECT SUM(sale_value - supplier_cost) FROM card_financial_items
         WHERE card_id = c.id AND archived_at IS NULL
       ), 0),
       updated_at = NOW()
 WHERE c.id IN (SELECT card_id FROM cards_afetados);

-- ----------------------------------------------------------------------------
-- 5. Backfill de matching: importa pending sales órfãs cujo número está no
--    histórico de algum card não-arquivado da mesma org
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_card RECORD;
  v_inserted INT;
  v_total_inserted INT := 0;
  v_cards_processed INT := 0;
BEGIN
  FOR v_card IN
    SELECT DISTINCT c.id
    FROM cards c
    WHERE c.archived_at IS NULL
      AND c.produto_data IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM monde_pending_sales mps
        WHERE mps.status = 'pending'
          AND mps.org_id = c.org_id
          AND mps.venda_num IN (
            SELECT v FROM (
              SELECT c.produto_data->>'numero_venda_monde' AS v
              UNION ALL
              SELECT elem->>'numero' FROM jsonb_array_elements(
                COALESCE(c.produto_data->'numeros_venda_monde_historico', '[]'::JSONB)
              ) elem
            ) s WHERE v IS NOT NULL AND v <> ''
          )
      )
  LOOP
    SELECT fn_match_pending_monde_for_card(v_card.id, NULL) INTO v_inserted;
    v_total_inserted := v_total_inserted + COALESCE(v_inserted, 0);
    v_cards_processed := v_cards_processed + 1;
  END LOOP;

  RAISE LOG '[backfill_pending_match] Processed % cards, inserted % items',
            v_cards_processed, v_total_inserted;
END;
$$;

COMMIT;
