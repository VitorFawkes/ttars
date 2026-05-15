-- ============================================================================
-- MIGRATION: trigger contínuo que sincroniza cards.valor_final + cards.receita
--            sempre que card_financial_items é inserido/alterado/arquivado.
-- Date: 2026-05-15
--
-- Bug raiz: até hoje, cards.valor_final era atualizado APENAS em paths
-- específicas (bulk_pos_venda, importação Monde, fix retroativo). Quando o
-- usuário adicionava produto manualmente pelo FinanceiroWidget, a coluna
-- ficava desatualizada — o widget mostrava o total correto (calcula em
-- runtime via SUM dos items), mas o card no Kanban e o header continuavam
-- exibindo o valor_estimado (orçamento previsto).
--
-- Caso real: card "Leonardo Lima / Bahia / JUL26" tem 1 item ativo
-- (sale_value=3127.78), mas cards.valor_final = NULL. Receita (305.81) está
-- correta porque foi setada por outra path. Inconsistência clássica.
--
-- Fix: trigger AFTER INSERT/UPDATE/DELETE em card_financial_items que
-- recalcula valor_final + receita do card pai a partir da soma dos items
-- não arquivados. Também faz fix retroativo em todos os cards com items.
-- ============================================================================

-- 1. Função reutilizável: recalcula totais de um card a partir dos items
CREATE OR REPLACE FUNCTION public.fn_recalc_card_totals_from_items(p_card_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cards
  SET valor_final = COALESCE((
        SELECT SUM(sale_value) FROM public.card_financial_items
        WHERE card_id = p_card_id AND archived_at IS NULL
      ), 0),
      receita = COALESCE((
        SELECT SUM(sale_value - supplier_cost) FROM public.card_financial_items
        WHERE card_id = p_card_id AND archived_at IS NULL
      ), 0),
      receita_source = 'calculated',
      updated_at = NOW()
  WHERE id = p_card_id;
END;
$$;

-- 2. Função do trigger
CREATE OR REPLACE FUNCTION public.fn_card_financial_items_sync_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recalc_card_totals_from_items(OLD.card_id);
    RETURN OLD;
  END IF;

  -- INSERT ou UPDATE: recalcula o card destino
  PERFORM public.fn_recalc_card_totals_from_items(NEW.card_id);

  -- Se UPDATE migrou o item para outro card (raro), recalcula o antigo também
  IF TG_OP = 'UPDATE' AND OLD.card_id IS DISTINCT FROM NEW.card_id THEN
    PERFORM public.fn_recalc_card_totals_from_items(OLD.card_id);
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger
DROP TRIGGER IF EXISTS trg_card_financial_items_sync_totals ON public.card_financial_items;
CREATE TRIGGER trg_card_financial_items_sync_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.card_financial_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_card_financial_items_sync_totals();

-- 4. Fix retroativo: recalcula todos os cards que têm pelo menos um item
--    (incluindo arquivados — o SUM filtra por archived_at IS NULL dentro).
--    Cards SEM items continuam intocados (preserva valor_final populado por
--    outro flow legado, ex: cards Monde antigos).
UPDATE public.cards c
SET valor_final = COALESCE((
      SELECT SUM(sale_value) FROM public.card_financial_items
      WHERE card_id = c.id AND archived_at IS NULL
    ), 0),
    receita = COALESCE((
      SELECT SUM(sale_value - supplier_cost) FROM public.card_financial_items
      WHERE card_id = c.id AND archived_at IS NULL
    ), 0),
    receita_source = 'calculated',
    updated_at = NOW()
WHERE c.id IN (
  SELECT DISTINCT card_id FROM public.card_financial_items
);
