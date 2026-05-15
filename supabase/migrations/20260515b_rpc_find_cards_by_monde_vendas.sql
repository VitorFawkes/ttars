-- ============================================================================
-- MIGRATION: RPC find_cards_by_monde_vendas
-- Date: 2026-05-15
--
-- RPC usada pela tela VendasMondePage.matchCards para encontrar cards onde
-- uma venda Monde está vinculada — seja como número primário ou no histórico.
-- Cards arquivados são tratados como inexistentes (regra de negócio).
--
-- Retorna 1 linha por (card, venda) encontrado. Se o mesmo card tem mais de
-- uma venda no input, retorna múltiplas linhas para esse card.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.find_cards_by_monde_vendas(TEXT[]);

CREATE FUNCTION public.find_cards_by_monde_vendas(p_venda_nums TEXT[])
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
    AND c.org_id = requesting_org_id();
$$;

GRANT EXECUTE ON FUNCTION public.find_cards_by_monde_vendas(TEXT[]) TO authenticated;

COMMIT;
