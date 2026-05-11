-- ============================================================
-- Fix: Criar _a_tag_ok helper + adicionar p_tag_ids ao revenue_timeseries
--
-- Problema: 20260305_product_isolation_rpcs.sql foi aplicada em produção
-- mas depende de _a_tag_ok() que era definida em 20260304_analytics_tag_filter.sql
-- (nunca aplicada). Resultado: TODAS as RPCs de analytics falhavam.
--
-- Também corrige analytics_revenue_timeseries que não tinha p_tag_ids.
-- ============================================================

-- ── 1. Helper _a_tag_ok ────────────────────────────────────────
CREATE OR REPLACE FUNCTION _a_tag_ok(
    card_id UUID, tag_ids UUID[]
) RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
SELECT
    tag_ids IS NULL
    OR array_length(tag_ids, 1) IS NULL
    OR EXISTS (
        SELECT 1
        FROM card_tag_assignments cta
        WHERE cta.card_id = $1
          AND cta.tag_id = ANY($2)
    );
$$;

-- ── 2. Drop overloads de analytics_revenue_timeseries ──────────
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure::text AS sig
        FROM pg_proc
        WHERE proname = 'analytics_revenue_timeseries'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
    END LOOP;
END $$;

-- ── 3. Recriar analytics_revenue_timeseries com p_tag_ids ──────
CREATE OR REPLACE FUNCTION analytics_revenue_timeseries(
    p_date_start  TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end    TIMESTAMPTZ DEFAULT NOW(),
    p_granularity TEXT DEFAULT 'month',
    p_product     TEXT DEFAULT NULL,
    p_mode        TEXT DEFAULT 'entries',
    p_stage_id    UUID DEFAULT NULL,
    p_owner_id    UUID DEFAULT NULL,
    p_owner_ids   UUID[] DEFAULT NULL,
    p_tag_ids     UUID[] DEFAULT NULL
)
RETURNS TABLE(period TEXT, period_start TIMESTAMPTZ, total_valor NUMERIC, total_receita NUMERIC, count_won BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN p_granularity = 'week' THEN TO_CHAR(date_trunc('week', c.data_fechamento::TIMESTAMPTZ), 'DD/MM')
            WHEN p_granularity = 'day' THEN TO_CHAR(date_trunc('day', c.data_fechamento::TIMESTAMPTZ), 'DD/MM')
            ELSE TO_CHAR(date_trunc('month', c.data_fechamento::TIMESTAMPTZ), 'MMM YYYY')
        END AS period,
        date_trunc(
            CASE WHEN p_granularity = 'day' THEN 'day' WHEN p_granularity = 'week' THEN 'week' ELSE 'month' END,
            c.data_fechamento::TIMESTAMPTZ
        ) AS period_start,
        COALESCE(SUM(c.valor_final), 0)::NUMERIC AS total_valor,
        COALESCE(SUM(c.receita), 0)::NUMERIC AS total_receita,
        COUNT(*)::BIGINT AS count_won
    FROM cards c
    WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'ganho'
      AND c.data_fechamento IS NOT NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
          ELSE
              c.created_at >= p_date_start AND c.created_at < p_date_end
      END
    GROUP BY
        date_trunc(
            CASE WHEN p_granularity = 'day' THEN 'day' WHEN p_granularity = 'week' THEN 'week' ELSE 'month' END,
            c.data_fechamento::TIMESTAMPTZ
        ),
        CASE
            WHEN p_granularity = 'week' THEN TO_CHAR(date_trunc('week', c.data_fechamento::TIMESTAMPTZ), 'DD/MM')
            WHEN p_granularity = 'day' THEN TO_CHAR(date_trunc('day', c.data_fechamento::TIMESTAMPTZ), 'DD/MM')
            ELSE TO_CHAR(date_trunc('month', c.data_fechamento::TIMESTAMPTZ), 'MMM YYYY')
        END
    ORDER BY period_start;
END;
$$;

GRANT EXECUTE ON FUNCTION _a_tag_ok TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_revenue_timeseries TO authenticated;
