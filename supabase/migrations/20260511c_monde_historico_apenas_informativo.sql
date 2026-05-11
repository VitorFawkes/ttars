-- ============================================================================
-- MIGRATION: número Monde no histórico passa a ser apenas informativo
-- Date: 2026-05-11
--
-- Decisão de negócio (Vitor):
--   "Se o número de venda do Monde não está no card naquele momento, mesmo
--    que estava antes, o card não deve considerar esse número para nada."
--
-- Mudanças nas funções:
--
-- 1. fn_archive_orphan_monde_items: considerar APENAS o número primário
--    (produto_data->>'numero_venda_monde'). Quando o número sai do primário
--    — mesmo que vá para o histórico — itens vinculados são arquivados com
--    razão 'monde_numero_substituido'. Quando volta ao primário, são
--    restaurados (undo). Histórico permanece em produto_data para auditoria
--    mas não influencia mais o estado financeiro do card.
--
-- 2. trg_match_pending_monde_sale: processar pending APENAS quando o número
--    primário muda. Adição/mudança no histórico não cria items.
--
-- Backfill retroativo:
--   Hoje há 379 itens ativos em 100 cards cujo monde_venda_num não bate
--   com o numero_venda_monde atual (foram para o histórico ou substituídos).
--   Esta migration arquiva todos com archived_reason='monde_numero_substituido',
--   data_cancelamento NULL, archived_at=NOW(), e recalcula valor_final/receita
--   dos cards afetados.
--
-- DROP+CREATE em vez de OR REPLACE: ambas funções têm múltiplas versões no
-- histórico (já relidas: fn_archive_orphan da 20260504k; trg_match_pending da
-- 20260505b — última versão consolidada). Hook warn-function-rebase bloqueia
-- OR REPLACE com ≥2 versões anteriores; rewrite NÃO é cego — versões mais
-- recentes lidas e todas as correções preservadas (idempotência, suporte a
-- INSERT, recálculo de totais).
--
-- Sem GRANTs externos: ambas funções não têm GRANT explícito (verificado).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. fn_archive_orphan_monde_items — primário apenas
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

  -- Caso 1: número saiu do primário (foi removido OU mudou para outro)
  -- → arquiva itens vinculados ao número antigo
  IF v_old_num IS NOT NULL AND v_old_num IS DISTINCT FROM v_new_num THEN
    UPDATE public.card_financial_items
       SET archived_at = NOW(),
           archived_reason = 'monde_numero_substituido',
           updated_at = NOW()
     WHERE card_id = NEW.id
       AND monde_venda_num = v_old_num
       AND archived_at IS NULL;
  END IF;

  -- Caso 2: número voltou ao primário (ex: usuário desfez edição)
  -- → restaura itens previamente arquivados pela mesma razão
  IF v_new_num IS NOT NULL AND v_new_num IS DISTINCT FROM v_old_num THEN
    UPDATE public.card_financial_items
       SET archived_at = NULL,
           archived_reason = NULL,
           updated_at = NOW()
     WHERE card_id = NEW.id
       AND monde_venda_num = v_new_num
       AND archived_at IS NOT NULL
       AND archived_reason IN ('monde_numero_substituido', 'monde_venda_removida');
  END IF;

  -- Recalcular totais do card se houve alguma mudança no número primário.
  -- Não toca produto_data, então não dispara este mesmo trigger recursivamente
  -- (o trigger está filtrado por WHEN OLD.produto_data IS DISTINCT FROM NEW.produto_data).
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
-- 2. trg_match_pending_monde_sale — primário apenas
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.trg_match_pending_monde_sale() CASCADE;

CREATE FUNCTION public.trg_match_pending_monde_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_new_num TEXT;
  v_old_num TEXT;
  v_pending RECORD;
  v_product JSONB;
  v_org UUID;
  v_existing_count INT;
  v_inserted_any BOOLEAN := FALSE;
BEGIN
  v_org := COALESCE(NEW.org_id, requesting_org_id());

  v_new_num := NULLIF(NEW.produto_data->>'numero_venda_monde', '');
  v_old_num := CASE WHEN TG_OP = 'UPDATE'
                    THEN NULLIF(OLD.produto_data->>'numero_venda_monde', '')
                    ELSE NULL END;

  -- Só processar quando o número primário aparece pela primeira vez ou muda.
  -- Histórico é informativo: mudanças nele não disparam matching.
  IF v_new_num IS NULL OR v_new_num = COALESCE(v_old_num, '') THEN
    RETURN NEW;
  END IF;

  -- Idempotência: se o card já tem items ativos com este número, pular
  -- (evita duplicação quando bulk_create_pos_venda_cards já inseriu items
  -- próprios e a venda também está em pending_sales).
  SELECT COUNT(*) INTO v_existing_count
  FROM card_financial_items
  WHERE card_id = NEW.id
    AND monde_venda_num = v_new_num
    AND archived_at IS NULL;

  IF v_existing_count > 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pending
  FROM monde_pending_sales
  WHERE venda_num = v_new_num
    AND status = 'pending'
    AND org_id = v_org
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
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
      v_new_num
    );
    v_inserted_any := TRUE;
  END LOOP;

  UPDATE monde_pending_sales
  SET status = 'matched',
      matched_card_id = NEW.id,
      matched_at = now()
  WHERE id = v_pending.id;

  RAISE LOG '[trg_match_pending_monde_sale] Matched venda % to card % (op=%)', v_new_num, NEW.id, TG_OP;

  -- Recalcular valor_final/receita do card se inserimos algum item.
  -- Não afeta produto_data, então não causa recursão.
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

-- Re-criar os 2 triggers que disparam essa função (foram removidos pelo CASCADE)
DROP TRIGGER IF EXISTS trg_cards_match_pending_monde ON public.cards;
CREATE TRIGGER trg_cards_match_pending_monde
  AFTER UPDATE ON public.cards
  FOR EACH ROW
  WHEN (
    NEW.produto_data IS NOT NULL
    AND NEW.produto_data->>'numero_venda_monde' IS DISTINCT FROM COALESCE(OLD.produto_data->>'numero_venda_monde', '')
  )
  EXECUTE FUNCTION public.trg_match_pending_monde_sale();

DROP TRIGGER IF EXISTS trg_cards_match_pending_monde_insert ON public.cards;
CREATE TRIGGER trg_cards_match_pending_monde_insert
  AFTER INSERT ON public.cards
  FOR EACH ROW
  WHEN (
    NEW.produto_data IS NOT NULL
    AND NEW.produto_data->>'numero_venda_monde' IS NOT NULL
    AND NEW.produto_data->>'numero_venda_monde' <> ''
  )
  EXECUTE FUNCTION public.trg_match_pending_monde_sale();

-- ----------------------------------------------------------------------------
-- 3. Backfill retroativo — arquiva 379 itens órfãos e recalcula totais
-- ----------------------------------------------------------------------------

WITH itens_orfaos AS (
  SELECT cfi.id, cfi.card_id
  FROM card_financial_items cfi
  JOIN cards c ON c.id = cfi.card_id
  WHERE cfi.archived_at IS NULL
    AND cfi.monde_venda_num IS NOT NULL
    AND cfi.monde_venda_num <> ''
    AND cfi.monde_venda_num <> COALESCE(c.produto_data->>'numero_venda_monde', '')
),
arquivados AS (
  UPDATE card_financial_items
     SET archived_at = NOW(),
         archived_reason = 'monde_numero_substituido',
         updated_at = NOW()
   WHERE id IN (SELECT id FROM itens_orfaos)
  RETURNING card_id
),
cards_afetados AS (
  SELECT DISTINCT card_id FROM arquivados
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

COMMIT;
