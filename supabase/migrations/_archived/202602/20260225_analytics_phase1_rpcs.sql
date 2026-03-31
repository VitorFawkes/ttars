-- ============================================================
-- Analytics Phase 1: Overview KPIs + Revenue Timeseries
-- ============================================================

-- RPC 1: analytics_overview_kpis
-- Retorna KPIs principais para a Visão Geral do Analytics
CREATE OR REPLACE FUNCTION analytics_overview_kpis(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_leads', COALESCE(COUNT(*), 0),
        'total_won', COALESCE(COUNT(*) FILTER (WHERE c.status_comercial = 'ganho'), 0),
        'total_lost', COALESCE(COUNT(*) FILTER (WHERE c.status_comercial = 'perdido'), 0),
        'total_open', COALESCE(COUNT(*) FILTER (WHERE c.status_comercial NOT IN ('ganho', 'perdido')), 0),
        'conversao_venda_rate', CASE
            WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE c.status_comercial = 'ganho'))::NUMERIC / COUNT(*)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'receita_total', COALESCE(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho'), 0),
        'margem_total', COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0),
        'ticket_medio', CASE
            WHEN COUNT(*) FILTER (WHERE c.status_comercial = 'ganho') > 0
            THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho') / COUNT(*) FILTER (WHERE c.status_comercial = 'ganho'), 0)
            ELSE 0
        END,
        'ciclo_medio_dias', COALESCE(
            ROUND(AVG(EXTRACT(EPOCH FROM (c.data_fechamento::TIMESTAMPTZ - c.created_at)) / 86400) FILTER (
                WHERE c.status_comercial = 'ganho'
                  AND c.data_fechamento IS NOT NULL
                  AND c.data_fechamento::TIMESTAMPTZ > c.created_at
            ), 1),
            0
        ),
        'viagens_vendidas', COALESCE(COUNT(*) FILTER (WHERE c.status_comercial = 'ganho'), 0)
    ) INTO result
    FROM cards c
    WHERE c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.created_at >= p_date_start
      AND c.created_at < p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product);

    RETURN result;
END;
$$;

-- RPC 2: analytics_revenue_timeseries
-- Retorna receita agrupada por período (semana/mês)
CREATE OR REPLACE FUNCTION analytics_revenue_timeseries(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_granularity TEXT DEFAULT 'month',
    p_product TEXT DEFAULT NULL
)
RETURNS TABLE(
    period TEXT,
    period_start TIMESTAMPTZ,
    total_valor NUMERIC,
    total_receita NUMERIC,
    count_won BIGINT
)
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
    WHERE c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status_comercial = 'ganho'
      AND c.data_fechamento IS NOT NULL
      AND c.data_fechamento::TIMESTAMPTZ >= p_date_start
      AND c.data_fechamento::TIMESTAMPTZ < p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
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

-- Grants
GRANT EXECUTE ON FUNCTION analytics_overview_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_revenue_timeseries TO authenticated;
