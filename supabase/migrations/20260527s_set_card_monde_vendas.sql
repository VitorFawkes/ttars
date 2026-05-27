-- ============================================================================
-- MIGRATION: set_card_monde_vendas — fonte unica para editar lista de vendas
--           Monde de um card pela UI.
-- Date: 2026-05-27
--
-- Contexto:
--   O modal "N de Venda Monde" (UniversalFieldRenderer + MondeNumbersChipInput)
--   atualmente edita apenas produto_data.numeros_venda_monde_historico. O trigger
--   fn_archive_orphan_monde_items (20260504k) arquiva items de card_financial_items
--   apenas pra numeros que estavam em OLD historico+primary e sairam do NEW.
--
--   Problema: cards com items "orfaos" (monde_venda_num em card_financial_items
--   mas nunca registrados no historico — ex: importacao bulk antiga) nao podem
--   ser removidos pelo modal. Usuario ve o numero no popover mas nao consegue
--   apagar.
--
--   Decisao do Vitor (2026-05-27): apagar no modal = remover venda do card de
--   verdade (arquivar items). Reversivel (re-adicionar restaura items).
--
-- Esta RPC:
--   1. Valida org (defesa em profundidade alem da RLS).
--   2. Calcula desired_set (lista de numeros que o usuario quer manter).
--   3. Arquiva items ativos com monde_venda_num NOT IN desired_set, com
--      archived_reason='monde_venda_removida'.
--   4. Restaura items arquivados com reason='monde_venda_removida' cujo
--      monde_venda_num voltou pra desired_set.
--   5. Atualiza produto_data.numero_venda_monde (= ultimo da lista) e
--      produto_data.numeros_venda_monde_historico (= todos da lista).
--   6. Recalcula cards.valor_final e cards.receita.
--
-- Idempotencia: chamar com a mesma lista nao muda nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_card_monde_vendas(
  p_card_id UUID,
  p_numbers TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requesting_org UUID;
  v_card_org UUID;
  v_card_archived TIMESTAMPTZ;
  v_desired_set TEXT[];
  v_active_set TEXT[];
  v_to_archive TEXT[];
  v_to_restore TEXT[];
  v_new_primary TEXT;
  v_historico_jsonb JSONB;
  v_existing_pd JSONB;
  v_archived_count INT := 0;
  v_restored_count INT := 0;
  v_total_venda DECIMAL(12,2);
  v_receita DECIMAL(12,2);
BEGIN
  v_requesting_org := requesting_org_id();

  -- 1. Validar card e org
  SELECT org_id, archived_at, COALESCE(produto_data, '{}'::jsonb)
  INTO v_card_org, v_card_archived, v_existing_pd
  FROM cards
  WHERE id = p_card_id;

  IF v_card_org IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card nao encontrado');
  END IF;

  IF v_card_org IS DISTINCT FROM v_requesting_org THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissao para editar este card');
  END IF;

  IF v_card_archived IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card arquivado');
  END IF;

  -- 2. Normalizar desired_set (dedup, trim, exclui vazios; preserva ordem)
  v_desired_set := ARRAY(
    SELECT n
    FROM (
      SELECT DISTINCT ON (trim(n)) trim(n) AS n, ord
      FROM unnest(COALESCE(p_numbers, ARRAY[]::TEXT[])) WITH ORDINALITY AS t(n, ord)
      WHERE trim(n) <> '' AND trim(n) ~ '^[0-9]+$'
      ORDER BY trim(n), ord
    ) deduped
    ORDER BY ord
  );

  -- 3. Calcular set ativo atualmente em card_financial_items
  v_active_set := ARRAY(
    SELECT DISTINCT monde_venda_num
    FROM card_financial_items
    WHERE card_id = p_card_id
      AND archived_at IS NULL
      AND monde_venda_num IS NOT NULL
      AND monde_venda_num <> ''
  );

  -- 4. Items a arquivar = ativos que sairam do desired_set
  v_to_archive := ARRAY(
    SELECT n FROM unnest(v_active_set) n
    WHERE NOT (n = ANY(v_desired_set))
  );

  -- 5. Items a restaurar = arquivados com reason='monde_venda_removida'
  --    cujo numero voltou pro desired_set
  IF array_length(v_desired_set, 1) > 0 THEN
    v_to_restore := ARRAY(
      SELECT DISTINCT monde_venda_num
      FROM card_financial_items
      WHERE card_id = p_card_id
        AND archived_at IS NOT NULL
        AND archived_reason = 'monde_venda_removida'
        AND monde_venda_num = ANY(v_desired_set)
    );
  ELSE
    v_to_restore := ARRAY[]::TEXT[];
  END IF;

  -- 6. Arquivar items
  IF array_length(v_to_archive, 1) > 0 THEN
    UPDATE card_financial_items
    SET archived_at = NOW(),
        archived_reason = 'monde_venda_removida',
        updated_at = NOW()
    WHERE card_id = p_card_id
      AND monde_venda_num = ANY(v_to_archive)
      AND archived_at IS NULL;
    GET DIAGNOSTICS v_archived_count = ROW_COUNT;
  END IF;

  -- 7. Restaurar items
  IF array_length(v_to_restore, 1) > 0 THEN
    UPDATE card_financial_items
    SET archived_at = NULL,
        archived_reason = NULL,
        updated_at = NOW()
    WHERE card_id = p_card_id
      AND monde_venda_num = ANY(v_to_restore)
      AND archived_reason = 'monde_venda_removida';
    GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  END IF;

  -- 8. Atualizar produto_data: primary = ultimo, historico = lista completa
  --    (regra existente do modal: "ultimo adicionado eh o principal")
  IF array_length(v_desired_set, 1) > 0 THEN
    v_new_primary := v_desired_set[array_length(v_desired_set, 1)];
    v_historico_jsonb := COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'numero', n,
            'origem', 'manual',
            'sub_card_id', NULL,
            'sub_card_titulo', NULL,
            'adicionado_em', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
          ORDER BY ord
       )
       FROM unnest(v_desired_set) WITH ORDINALITY AS t(n, ord)),
      '[]'::jsonb
    );
  ELSE
    v_new_primary := NULL;
    v_historico_jsonb := '[]'::jsonb;
  END IF;

  UPDATE cards
  SET produto_data = v_existing_pd
                     || jsonb_build_object(
                          'numero_venda_monde', v_new_primary,
                          'numeros_venda_monde_historico', v_historico_jsonb
                        ),
      updated_at = NOW()
  WHERE id = p_card_id;

  -- 9. Recalcular totais (o trigger fn_archive_orphan_monde_items tambem faz,
  --    mas garante mesmo se nada chegou no diff dele)
  SELECT
    COALESCE(SUM(sale_value), 0),
    COALESCE(SUM(sale_value - COALESCE(supplier_cost, 0)), 0)
  INTO v_total_venda, v_receita
  FROM card_financial_items
  WHERE card_id = p_card_id AND archived_at IS NULL;

  UPDATE cards
  SET valor_final    = v_total_venda,
      receita        = v_receita,
      receita_source = 'calculated',
      updated_at     = NOW()
  WHERE id = p_card_id;

  RETURN jsonb_build_object(
    'success', true,
    'card_id', p_card_id,
    'desired_set', v_desired_set,
    'items_archived', v_archived_count,
    'items_restored', v_restored_count,
    'valor_final', v_total_venda,
    'receita', v_receita
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_card_monde_vendas(UUID, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.set_card_monde_vendas(UUID, TEXT[]) IS
  'Fonte unica pro modal "N de Venda Monde": recebe lista desejada de numeros, arquiva items removidos (reason=monde_venda_removida), restaura re-adicionados, atualiza produto_data.numero_venda_monde + numeros_venda_monde_historico. Reversivel. Vitor 2026-05-27.';
