-- Hotfix: analytics_sdr_follow_through quebra em runtime com 3 erros:
--   1) "column ct.card_id does not exist"
--   2) "column ps.phase_slug does not exist"
--   3) "cannot cast type jsonb to text[]"
--
-- Erros nasceram na migration 20260425e_sdr_widgets.sql, que assumiu:
--   - card_tags como tabela de junção (na verdade é catálogo de tags;
--     a tabela de junção é card_tag_assignments(card_id, tag_id))
--   - pipeline_stages.phase_slug existe (só existe phase_id; slug
--     fica em pipeline_phases)
--   - (jsonb -> 'destinos')::TEXT[] funciona (não funciona; precisa
--     jsonb_array_elements_text)
--
-- Como PostgreSQL valida referências no plan da função, a query falha
-- mesmo quando os parâmetros opcionais vêm NULL. Esse hotfix corrige
-- as três referências e mantém o resto da lógica intacto.

CREATE OR REPLACE FUNCTION public.analytics_sdr_follow_through(
  p_date_start TIMESTAMPTZ,
  p_date_end TIMESTAMPTZ,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  total_handoffs BIGINT,
  handoffs_won BIGINT,
  follow_through_pct NUMERIC,
  by_sdr JSON
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
  WITH filtered_cards AS (
    SELECT c.id, c.sdr_owner_id, c.ganho_sdr_at, c.ganho_planner_at, c.produto
    FROM cards c
    WHERE c.org_id = v_org
      AND c.ganho_sdr_at >= p_date_start
      AND c.ganho_sdr_at <= p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.sdr_owner_id = p_owner_id)
      AND (p_owner_ids IS NULL OR p_owner_ids = ARRAY[]::UUID[] OR c.sdr_owner_id = ANY(p_owner_ids))
      AND (p_tag_ids IS NULL OR p_tag_ids = ARRAY[]::UUID[] OR EXISTS (
        SELECT 1 FROM card_tag_assignments cta WHERE cta.card_id = c.id AND cta.tag_id = ANY(p_tag_ids)
      ))
      AND (p_origem IS NULL OR p_origem = ARRAY[]::TEXT[] OR c.origem = ANY(p_origem))
      AND (p_phase_slugs IS NULL OR p_phase_slugs = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.id = c.pipeline_stage_id AND pp.slug = ANY(p_phase_slugs)
      ))
      AND (p_lead_entry_path IS NULL OR c.lead_entry_path = p_lead_entry_path)
      AND (p_destinos IS NULL OR p_destinos = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.produto_data->'destinos', '[]'::jsonb)) AS d(val)
        WHERE d.val = ANY(p_destinos)
      ))
  ),
  summary AS (
    SELECT
      COUNT(*) AS total_handoffs,
      COUNT(CASE WHEN ganho_planner_at IS NOT NULL THEN 1 END) AS handoffs_won
    FROM filtered_cards
  ),
  by_sdr_data AS (
    SELECT
      p.id,
      p.nome,
      COUNT(*) AS total,
      COUNT(CASE WHEN fc.ganho_planner_at IS NOT NULL THEN 1 END) AS won,
      ROUND(
        100.0 * COUNT(CASE WHEN fc.ganho_planner_at IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0),
        1
      ) AS pct
    FROM filtered_cards fc
    LEFT JOIN profiles p ON fc.sdr_owner_id = p.id
    GROUP BY p.id, p.nome
    ORDER BY total DESC
  )
  SELECT
    s.total_handoffs,
    s.handoffs_won,
    ROUND(
      100.0 * s.handoffs_won / NULLIF(s.total_handoffs, 0),
      1
    ) AS follow_through_pct,
    json_agg(
      json_build_object(
        'sdr_id', bd.id,
        'sdr_name', bd.nome,
        'total', bd.total,
        'won', bd.won,
        'follow_through_pct', bd.pct
      ) ORDER BY bd.total DESC
    ) AS by_sdr
  FROM summary s, by_sdr_data bd
  GROUP BY s.total_handoffs, s.handoffs_won;
END $$;
