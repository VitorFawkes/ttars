-- ============================================================================
-- MIGRATION: Card arquivado = inexistente (invariante absoluta)
-- Date: 2026-05-15
--
-- Regra absoluta do Vitor (registrada em feedback_monde_multi_venda_sempre_ativa):
--   "Cards arquivados devem ser IGNORADOS. Inexistentes para qualquer propósito.
--    Pode existir produto em card duplicado (sub-card etc), isso é desenho.
--    Mas card arquivado NÃO deve segurar produto ativo nem pending sale."
--
-- Estado atual em produção (auditoria 2026-05-15):
--   - 157 items ATIVOS em 52 cards arquivados (vazamento)
--   - 36 pending_sales status=matched apontando para cards arquivados (presas)
--
-- Mudanças:
--   1. Backfill A: arquivar 157 items com archived_reason='card_archived'
--   2. Backfill B: resetar 36 pending_sales (matched_card_id=NULL, status=pending)
--      para que possam re-matchar com cards ativos via trigger.
--   3. Trigger preventivo em cards: ao arquivar card, cascata automática que
--      arquiva items ativos do card E reseta pending_sales matched a ele.
--
-- Não toca a RPC bulk_import_financial_items (já tem skip de cards arquivados
-- desde v8, regra mantida na v9 de hoje).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Trigger preventivo: ao arquivar card, propagar para items + pending sales
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_propagate_card_archived() CASCADE;

CREATE FUNCTION public.fn_propagate_card_archived()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caso 1: card vira arquivado (archived_at: NULL → NOT NULL)
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    -- Arquiva items ativos do card
    UPDATE card_financial_items
       SET archived_at = NOW(),
           archived_reason = 'card_archived',
           updated_at = NOW()
     WHERE card_id = NEW.id
       AND archived_at IS NULL;

    -- Solta pending sales matched a esse card pra que possam re-matchar
    -- com outro card ativo via trigger trg_match_pending_monde_sale
    UPDATE monde_pending_sales
       SET status = 'pending',
           matched_card_id = NULL,
           matched_at = NULL
     WHERE matched_card_id = NEW.id
       AND status = 'matched';
  END IF;

  -- Caso 2: card desarquivado (archived_at: NOT NULL → NULL) → restaura items
  -- arquivados com razão 'card_archived' (não toca outras razões)
  IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    UPDATE card_financial_items
       SET archived_at = NULL,
           archived_reason = NULL,
           updated_at = NOW()
     WHERE card_id = NEW.id
       AND archived_at IS NOT NULL
       AND archived_reason = 'card_archived';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_card_archived ON public.cards;
CREATE TRIGGER trg_propagate_card_archived
  AFTER UPDATE OF archived_at ON public.cards
  FOR EACH ROW
  WHEN (OLD.archived_at IS DISTINCT FROM NEW.archived_at)
  EXECUTE FUNCTION public.fn_propagate_card_archived();

-- ----------------------------------------------------------------------------
-- 2. Backfill A: arquivar 157 items ativos em cards arquivados
-- ----------------------------------------------------------------------------

UPDATE card_financial_items cfi
   SET archived_at = NOW(),
       archived_reason = 'card_archived',
       updated_at = NOW()
  FROM cards c
 WHERE c.id = cfi.card_id
   AND c.archived_at IS NOT NULL
   AND cfi.archived_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Backfill B: soltar pending_sales matched a cards arquivados
-- ----------------------------------------------------------------------------

UPDATE monde_pending_sales mps
   SET status = 'pending',
       matched_card_id = NULL,
       matched_at = NULL
  FROM cards c
 WHERE c.id = mps.matched_card_id
   AND c.archived_at IS NOT NULL
   AND mps.status = 'matched';

-- ----------------------------------------------------------------------------
-- 4. Backfill C: disparar matching nas pending sales recém-liberadas que têm
--    card ATIVO no histórico (chamamos fn_match_pending_monde_for_card que
--    foi criada na 20260515a — filtra card arquivado naturalmente)
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

  RAISE LOG '[backfill_card_archived_invariante] cards_processados=%, items_inseridos=%',
            v_cards_processed, v_total_inserted;
END;
$$;

COMMIT;
