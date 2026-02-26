-- ============================================================
-- Fix: ORDER BY s.ordem → ORDER BY pp.order_index, s.ordem
-- A coluna `ordem` é LOCAL a cada fase (reinicia em 1 por phase).
-- Sem considerar pipeline_phases.order_index, stages de fases
-- diferentes se intercalam.
-- ============================================================

-- 1) analytics_funnel_live
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_funnel_live(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'activity'
)
RETURNS TABLE(
    stage_id     UUID,
    stage_nome   TEXT,
    fase         TEXT,
    ordem        INT,
    total_cards  BIGINT,
    valor_total  NUMERIC,
    receita_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id            AS stage_id,
        s.nome          AS stage_nome,
        s.fase,
        s.ordem::INT,
        COUNT(c.id)::BIGINT AS total_cards,
        COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
        COALESCE(SUM(c.receita), 0)::NUMERIC AS receita_total
    FROM pipeline_stages s
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND c.status_comercial NOT IN ('ganho', 'perdido')
        AND c.created_at >= p_date_start
        AND c.created_at < p_date_end
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
    WHERE s.ativo = true
    GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

-- 2) analytics_funnel_conversion
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_funnel_conversion(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'activity'
)
RETURNS TABLE(
    stage_id UUID,
    stage_nome TEXT,
    phase_slug TEXT,
    ordem INT,
    current_count BIGINT,
    total_valor NUMERIC,
    avg_days_in_stage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id AS stage_id,
        s.nome AS stage_nome,
        COALESCE(s.fase, 'SDR') AS phase_slug,
        s.ordem::INT,
        COUNT(c.id)::BIGINT AS current_count,
        COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS total_valor,
        COALESCE(ROUND(AVG(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400
        ), 1), 0)::NUMERIC AS avg_days_in_stage
    FROM pipeline_stages s
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND (CASE
            WHEN p_mode = 'cohort' THEN c.created_at
            WHEN c.data_fechamento IS NOT NULL THEN c.data_fechamento::TIMESTAMPTZ
            ELSE c.created_at
        END) >= p_date_start
        AND (CASE
            WHEN p_mode = 'cohort' THEN c.created_at
            WHEN c.data_fechamento IS NOT NULL THEN c.data_fechamento::TIMESTAMPTZ
            ELSE c.created_at
        END) < p_date_end
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
    WHERE s.ativo = true
    GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

-- 3) analytics_sla_summary
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_sla_summary(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'activity'
)
RETURNS TABLE(
    stage_nome         TEXT,
    sla_hours          INT,
    total_cards        BIGINT,
    compliant_cards    BIGINT,
    violating_cards    BIGINT,
    compliance_rate    NUMERIC,
    avg_hours_in_stage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.nome AS stage_nome,
        COALESCE(s.sla_hours, 0)::INT AS sla_hours,
        COUNT(c.id)::BIGINT AS total_cards,
        COUNT(c.id) FILTER (WHERE
            s.sla_hours IS NOT NULL AND s.sla_hours > 0
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 <= s.sla_hours
        )::BIGINT AS compliant_cards,
        COUNT(c.id) FILTER (WHERE
            s.sla_hours IS NOT NULL AND s.sla_hours > 0
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 > s.sla_hours
        )::BIGINT AS violating_cards,
        CASE WHEN COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0) > 0
            THEN ROUND(
                COUNT(c.id) FILTER (WHERE
                    s.sla_hours IS NOT NULL AND s.sla_hours > 0
                    AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 <= s.sla_hours
                )::NUMERIC
                / COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0)::NUMERIC * 100,
            1)
            ELSE NULL END AS compliance_rate,
        COALESCE(ROUND(AVG(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600
        ), 1), 0)::NUMERIC AS avg_hours_in_stage
    FROM pipeline_stages s
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND c.status_comercial NOT IN ('ganho', 'perdido')
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND c.created_at >= p_date_start
        AND c.created_at < p_date_end
    WHERE s.ativo = true
    GROUP BY s.id, s.nome, s.sla_hours, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

-- Re-grant (idempotent)
GRANT EXECUTE ON FUNCTION analytics_funnel_live TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_summary TO authenticated;
