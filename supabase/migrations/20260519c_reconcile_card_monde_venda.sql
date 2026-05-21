-- ============================================================================
-- MIGRATION: Reconciliação única de venda Monde + guarda absoluta vs card arquivado
-- Date: 2026-05-19
--
-- Decisão Vitor (2026-05-19):
--   "O número de Venda Monde precisa respeitar o que temos atualmente no
--    arquivo Monde. Produto sumiu → some. Produto novo → adiciona. Produto
--    alterado → fica + desmarcado. Tudo pelo estado REAL daquele número
--    naquele momento. NUNCA duplicar, nunca deixar de mostrar.
--    E QUALQUER card arquivado é IGNORADO em qualquer operação Monde."
--
-- Causa raiz mapeada:
--   1. Existem 2 paths que criam card_financial_items a partir de venda Monde:
--      (a) bulk_import_financial_items v10 (correta — reconcilia tudo)
--      (b) fn_match_pending_monde_for_card / trigger trg_match_pending_monde_sale
--          (incompleta — só INSERT, e pula tudo se já há item com o venda_num)
--      Resultado: pending_sales com produtos que nunca chegaram no card; cards
--      com items fantasmas de venda que mudou de número no Monde.
--   2. Pelo menos uma tela secundária (ImportacaoPosVendaPage) tem queries
--      diretas em `cards` sem filtrar archived_at — vetor para produtos
--      atrelados a cards arquivados.
--
-- Solução em 5 camadas:
--   0. Trigger BEFORE INSERT/UPDATE em card_financial_items bloqueia qualquer
--      operação em card arquivado (exceção: arquivamento cascateado).
--   1. Função reconcile_card_monde_venda(card_id, venda_num): única forma de
--      promover pending_sale em items. Pega o products JSONB da pending mais
--      recente daquela (org, venda) e chama bulk_import_financial_items v10
--      (que faz insert+update+archive idempotente).
--   2. fn_match_pending_monde_for_card refatorada: chama reconcile_*  em vez
--      de fazer INSERT direto. Remove a guard "skip se já tem item".
--   3. Backfill: rodar reconcile_card_monde_venda para todo par (card_ativo,
--      monde_venda_num) ativo. Fix em prod: 573 pares, 378 cards.
--
-- Releitura confirmada:
--   - bulk_import_financial_items v10 (20260515f) ✓
--   - fn_match_pending_monde_for_card / trg_match_pending_monde_sale (20260515a) ✓
--   - fn_propagate_card_archived / 20260515e ✓
--   - trg_archive_orphan_monde_items / 20260515a ✓
-- ============================================================================

BEGIN;

-- ============================================================================
-- CAMADA 0: Guarda absoluta — card arquivado NUNCA recebe item
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_block_items_in_archived_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_archived TIMESTAMPTZ;
BEGIN
  -- Permite arquivamento do próprio item (cascata do fn_propagate_card_archived,
  -- ou archive direto). NEW.archived_at indo de NULL para NOT NULL é sempre OK.
  IF TG_OP = 'UPDATE'
     AND OLD.archived_at IS NULL
     AND NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Permite UPDATEs internos no item se o item JÁ ESTÁ arquivado (ex: backfill
  -- corrigindo archived_reason, ou alguma manutenção). Item arquivado não vai
  -- aparecer na UI ativa de qualquer forma.
  IF TG_OP = 'UPDATE' AND OLD.archived_at IS NOT NULL AND NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT archived_at INTO v_archived FROM cards WHERE id = NEW.card_id;

  IF v_archived IS NOT NULL THEN
    RAISE EXCEPTION
      'Card % está arquivado (em %), não pode receber/atualizar item financeiro (venda=%, descricao=%)',
      NEW.card_id, v_archived, NEW.monde_venda_num, NEW.description
      USING ERRCODE = 'check_violation',
            HINT = 'Desarquive o card primeiro ou vincule a venda a um card ativo.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_items_in_archived_card ON public.card_financial_items;
CREATE TRIGGER trg_block_items_in_archived_card
  BEFORE INSERT OR UPDATE ON public.card_financial_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_items_in_archived_card();

COMMENT ON FUNCTION public.fn_block_items_in_archived_card() IS
  'Bloqueia INSERT/UPDATE em card_financial_items quando o card está arquivado. Cobre todos os caminhos (RPCs, edge functions, UI direta) — defesa final independente da função chamadora.';


-- ============================================================================
-- CAMADA 1: reconcile_card_monde_venda — única forma de reconciliar uma venda
-- ============================================================================

DROP FUNCTION IF EXISTS public.reconcile_card_monde_venda(UUID, TEXT);

CREATE FUNCTION public.reconcile_card_monde_venda(
  p_card_id UUID,
  p_venda_num TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_archived TIMESTAMPTZ;
  v_card_org UUID;
  v_pending RECORD;
  v_bulk_payload JSONB;
  v_result JSONB;
BEGIN
  -- Guarda: card arquivado retorna sem fazer nada (consistente com Camada 0)
  SELECT archived_at, org_id INTO v_card_archived, v_card_org
  FROM cards WHERE id = p_card_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'skipped', 'card_not_found', 'card_id', p_card_id);
  END IF;

  IF v_card_archived IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'skipped', 'card_archived', 'card_id', p_card_id);
  END IF;

  IF p_venda_num IS NULL OR p_venda_num = '' THEN
    RETURN jsonb_build_object('success', false, 'skipped', 'no_venda_num');
  END IF;

  -- Pega a pending_sale mais recente para essa (org, venda) — independente do status.
  -- Arquivo Monde é fonte: se a venda existe em pending_sales, o JSONB products
  -- representa o estado atual daquele número.
  SELECT * INTO v_pending
  FROM monde_pending_sales
  WHERE venda_num = p_venda_num
    AND org_id = v_card_org
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Não há registro do arquivo Monde para essa venda nesta org. Não temos
    -- referência pra reconciliar. Não tocar em items existentes.
    RETURN jsonb_build_object(
      'success', false,
      'skipped', 'no_pending_sale',
      'venda_num', p_venda_num,
      'org_id', v_card_org
    );
  END IF;

  -- Construir payload no formato esperado por bulk_import_financial_items v10.
  -- Estrutura do JSONB products no banco:
  --   [{ produto, valorTotal, receita, fornecedor, representante, documento,
  --      dataInicio, dataFim, dataCancelamento, passageiros }]
  -- Estrutura esperada pela v10:
  --   [{ card_id, monde_venda_num, products: [{ description, sale_value,
  --      supplier_cost, fornecedor, representante, documento, data_inicio,
  --      data_fim, data_cancelamento, passageiros }] }]
  SELECT jsonb_build_array(
    jsonb_build_object(
      'card_id', p_card_id,
      'monde_venda_num', p_venda_num,
      'products', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'description',       p->>'produto',
              'sale_value',        COALESCE((p->>'valorTotal')::NUMERIC, 0),
              'supplier_cost',     ROUND(
                                     (COALESCE((p->>'valorTotal')::NUMERIC, 0)
                                      - COALESCE((p->>'receita')::NUMERIC, 0))
                                     * 100
                                   ) / 100,
              'fornecedor',        NULLIF(p->>'fornecedor', ''),
              'representante',     NULLIF(p->>'representante', ''),
              'documento',         NULLIF(p->>'documento', ''),
              'data_inicio',       NULLIF(p->>'dataInicio', ''),
              'data_fim',          NULLIF(p->>'dataFim', ''),
              'data_cancelamento', NULLIF(p->>'dataCancelamento', ''),
              'passageiros',       COALESCE(p->'passageiros', '[]'::JSONB)
            )
          )
          FROM jsonb_array_elements(v_pending.products) p
        ),
        '[]'::JSONB
      )
    )
  ) INTO v_bulk_payload;

  -- Chama a v10 (insert + update + archive idempotente)
  v_result := bulk_import_financial_items(v_bulk_payload);

  -- Marca a pending_sale como matched a este card.
  -- COALESCE preserva matched_card_id caso já aponte pra outro card (regra do
  -- Vitor: produto pode existir em cards diferentes por desenho — sub-card etc).
  UPDATE monde_pending_sales
  SET status          = 'matched',
      matched_card_id = COALESCE(matched_card_id, p_card_id),
      matched_at      = COALESCE(matched_at, NOW())
  WHERE id = v_pending.id;

  RETURN v_result
       || jsonb_build_object('venda_num', p_venda_num, 'card_id', p_card_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_card_monde_venda(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reconcile_card_monde_venda(UUID, TEXT) IS
  'Reconcilia produtos de uma venda Monde com card_financial_items: insere novos, atualiza alterados (desmarca is_ready), arquiva sumidos do arquivo. Card arquivado é skipado. Único caminho autorizado para promover pending_sale em itens.';


-- ============================================================================
-- CAMADA 2: Refactor fn_match_pending_monde_for_card — chama reconcile
-- ============================================================================

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
  v_result JSONB;
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

    -- Reconcilia (idempotente: insert + update + archive)
    v_result := reconcile_card_monde_venda(p_card_id, v_to_match);

    IF (v_result->>'success')::BOOLEAN THEN
      v_inserted_total := v_inserted_total
                        + COALESCE((v_result->>'products_inserted')::INT, 0);
    END IF;
  END LOOP;

  RETURN v_inserted_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_match_pending_monde_for_card(UUID, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.fn_match_pending_monde_for_card(UUID, TEXT[]) IS
  'Wrapper de reconcile_card_monde_venda para todos os números (primário + histórico) de um card. Mantida para compatibilidade com triggers existentes.';


-- ============================================================================
-- BACKFILL (Camada 3) está em arquivo separado: 20260519d_backfill_reconcile.sql
-- Aplicar APÓS confirmar que esta migration foi promovida com sucesso e que a
-- função reconcile_card_monde_venda funciona como esperado em 1 par teste.
-- ============================================================================

COMMIT;
