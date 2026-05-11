-- ============================================================================
-- MIGRATION: arquivar_financial_item — soft-delete manual de produto da venda
-- Date: 2026-05-11
--
-- Cria RPC para o frontend arquivar um produto (linha de card_financial_items)
-- pela ação do usuário no FinanceiroWidget. Soft delete + recálculo atômico
-- do valor_final/receita do card.
--
-- Comportamento:
--   1. Valida que o item existe e pertence ao requesting_org_id() (defesa em
--      profundidade além da RLS).
--   2. UPDATE archived_at=NOW(), archived_reason='user_deleted'.
--   3. Recalcula cards.valor_final e cards.receita somando APENAS itens com
--      archived_at IS NULL. Se ficar com 0 itens, zera (não deixa valor obsoleto).
--   4. Retorna jsonb com totais resultantes.
--
-- Notas:
--   - bulk_import_financial_items só matcha itens com archived_at IS NULL, então
--     se o produto continuar aparecendo no CSV do Monde, a próxima importação
--     cria um item NOVO (não desarquiva este). Comportamento desejado pelo Vitor.
--   - product_requirements e financial_item_passengers ficam órfãos no banco
--     (FK ON DELETE CASCADE só dispara em hard-delete). Não há prejuízo na UI
--     porque o produto pai some da listagem.
-- ============================================================================

CREATE OR REPLACE FUNCTION arquivar_financial_item(p_item_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_card_id UUID;
  v_item_org UUID;
  v_requesting_org UUID;
  v_total_venda DECIMAL(12,2);
  v_total_custo DECIMAL(12,2);
  v_receita DECIMAL(12,2);
  v_item_count INTEGER;
BEGIN
  v_requesting_org := requesting_org_id();

  -- 1. Buscar item e validar org
  SELECT card_id, org_id
  INTO v_card_id, v_item_org
  FROM card_financial_items
  WHERE id = p_item_id;

  IF v_card_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Produto não encontrado');
  END IF;

  IF v_item_org IS DISTINCT FROM v_requesting_org THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para apagar este produto');
  END IF;

  -- 2. Soft-delete (apenas se ainda não estiver arquivado)
  UPDATE card_financial_items
  SET archived_at = NOW(),
      archived_reason = 'user_deleted',
      updated_at = NOW()
  WHERE id = p_item_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Produto já estava apagado');
  END IF;

  -- 3. Recalcular totais do card considerando apenas itens ativos
  SELECT
    COALESCE(SUM(sale_value), 0),
    COALESCE(SUM(supplier_cost), 0),
    COUNT(*)
  INTO v_total_venda, v_total_custo, v_item_count
  FROM card_financial_items
  WHERE card_id = v_card_id AND archived_at IS NULL;

  v_receita := v_total_venda - v_total_custo;

  UPDATE cards
  SET valor_final    = v_total_venda,
      receita        = v_receita,
      receita_source = 'calculated',
      updated_at     = NOW()
  WHERE id = v_card_id;

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_card_id,
    'valor_final', v_total_venda,
    'receita', v_receita,
    'remaining_items', v_item_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION arquivar_financial_item(UUID) TO authenticated;

COMMENT ON FUNCTION arquivar_financial_item(UUID) IS
  'Soft-delete de um produto (card_financial_items) por ação do usuário. Marca archived_at + archived_reason=user_deleted e recalcula valor_final/receita do card. Valida org_id contra requesting_org_id().';
