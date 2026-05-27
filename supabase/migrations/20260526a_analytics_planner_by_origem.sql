-- Analytics — Cruzamento de Planner × Origem do lead
-- Para cada Planner (Travel Planner / Closer), mostra de onde vieram os
-- leads que ele recebeu no período e quantos viraram venda. Permite o gestor
-- avaliar se a diferença de conversão entre planners é mesmo de skill ou
-- só reflete que um recebe mais lead de "indicação" (fácil) e outro mais
-- de "mkt" (difícil).
--
-- Fonte de cards: c.created_at no período + vendas_owner_id IS NOT NULL.
-- Ganho: c.ganho_planner_at IS NOT NULL (independente de quando virou ganho).
--
-- Org isolation: SECURITY DEFINER + requesting_org_id().

CREATE OR REPLACE FUNCTION public.analytics_planner_by_origem(
  p_date_start TIMESTAMPTZ,
  p_date_end TIMESTAMPTZ,
  p_product TEXT DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  planner_id UUID,
  planner_nome TEXT,
  origem TEXT,
  leads BIGINT,
  ganhos BIGINT,
  conversao_pct NUMERIC,
  receita_total NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  SELECT
    vp.id AS planner_id,
    vp.nome::TEXT AS planner_nome,
    COALESCE(c.origem, 'sem_origem')::TEXT AS origem,
    COUNT(*)::BIGINT AS leads,
    COUNT(*) FILTER (WHERE c.ganho_planner_at IS NOT NULL)::BIGINT AS ganhos,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE c.ganho_planner_at IS NOT NULL)::NUMERIC
      / NULLIF(COUNT(*), 0),
      1
    ) AS conversao_pct,
    COALESCE(SUM(c.valor_final) FILTER (WHERE c.ganho_planner_at IS NOT NULL), 0)::NUMERIC AS receita_total
  FROM cards c
  JOIN profiles vp ON vp.id = c.vendas_owner_id
  WHERE c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.archived_at IS NULL
    AND c.vendas_owner_id IS NOT NULL
    AND c.created_at >= p_date_start
    AND c.created_at <= p_date_end
    AND COALESCE(c.card_type, 'standard') != 'sub_card'
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND (p_owner_ids IS NULL OR p_owner_ids = ARRAY[]::UUID[] OR c.vendas_owner_id = ANY(p_owner_ids))
  GROUP BY vp.id, vp.nome, c.origem
  ORDER BY vp.nome, leads DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.analytics_planner_by_origem(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID[]) TO authenticated;
