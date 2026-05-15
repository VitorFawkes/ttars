-- ============================================================================
-- MIGRATION: find_cards_by_monde_vendas — aceita org_id explícito
-- Date: 2026-05-15
--
-- Pequeno fix na RPC criada em 20260515b: aceitar p_org_id opcional pra que
-- o frontend possa passar a org ativa (vindo de useOrg()) em vez de depender
-- de requesting_org_id(). Mantém compatibilidade: se p_org_id é NULL, usa
-- requesting_org_id() como antes.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.find_cards_by_monde_vendas(TEXT[]);
DROP FUNCTION IF EXISTS public.find_cards_by_monde_vendas(TEXT[], UUID);

CREATE FUNCTION public.find_cards_by_monde_vendas(
  p_venda_nums TEXT[],
  p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  card_id UUID,
  card_titulo TEXT,
  venda_num TEXT,
  match_source TEXT  -- 'primary' ou 'history'
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS card_id,
    c.titulo::TEXT AS card_titulo,
    v.venda_num,
    v.match_source
  FROM cards c
  CROSS JOIN LATERAL (
    SELECT
      c.produto_data->>'numero_venda_monde' AS venda_num,
      'primary'::TEXT AS match_source
    WHERE c.produto_data->>'numero_venda_monde' = ANY(p_venda_nums)

    UNION ALL

    SELECT
      elem->>'numero' AS venda_num,
      'history'::TEXT AS match_source
    FROM jsonb_array_elements(
      COALESCE(c.produto_data->'numeros_venda_monde_historico', '[]'::JSONB)
    ) elem
    WHERE elem->>'numero' = ANY(p_venda_nums)
      AND elem->>'numero' IS DISTINCT FROM (c.produto_data->>'numero_venda_monde')
  ) v
  WHERE c.archived_at IS NULL
    AND c.org_id = COALESCE(p_org_id, requesting_org_id());
$$;

GRANT EXECUTE ON FUNCTION public.find_cards_by_monde_vendas(TEXT[], UUID) TO authenticated;

COMMIT;
