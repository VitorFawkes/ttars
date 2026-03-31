-- ============================================================
-- Analytics: Activity vs Cohort Mode Toggle
-- Adds p_mode parameter to 9 RPCs
-- 'activity' = filter by event date (data_fechamento)
-- 'cohort'   = filter by lead creation date (created_at)
-- ============================================================

-- Drop old function signatures (different param count before p_mode was added)
DROP FUNCTION IF EXISTS analytics_overview_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS analytics_revenue_timeseries(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS analytics_team_performance(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS analytics_funnel_conversion(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS analytics_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS analytics_financial_breakdown(DATE, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS analytics_top_destinations(DATE, DATE, INT);
DROP FUNCTION IF EXISTS analytics_revenue_by_product(DATE, DATE);
DROP FUNCTION IF EXISTS analytics_operations_summary(DATE, DATE, TEXT);

-- 1) analytics_overview_kpis — uses two pools (leads + outcomes)
CREATE OR REPLACE FUNCTION analytics_overview_kpis(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'activity'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    WITH leads_pool AS (
        -- Leads are ALWAYS filtered by created_at (creation IS the activity)
        SELECT c.*
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.created_at >= p_date_start
          AND c.created_at < p_date_end
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    outcomes_pool AS (
        -- Outcomes filtered by mode: cohort=created_at, activity=data_fechamento
        SELECT c.*
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial IN ('ganho', 'perdido')
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND CASE
              WHEN p_mode = 'cohort' THEN
                  c.created_at >= p_date_start AND c.created_at < p_date_end
              ELSE
                  c.data_fechamento IS NOT NULL
                  AND c.data_fechamento::TIMESTAMPTZ >= p_date_start
                  AND c.data_fechamento::TIMESTAMPTZ < p_date_end
          END
    )
    SELECT json_build_object(
        'total_leads', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool),
        'total_won', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'total_lost', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'perdido'),
        'total_open', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE status_comercial NOT IN ('ganho', 'perdido')),
        'conversao_venda_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0
            THEN ROUND(
                (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'receita_total', (SELECT COALESCE(SUM(valor_final), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'margem_total', (SELECT COALESCE(SUM(receita), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'ticket_medio', CASE
            WHEN (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho') > 0
            THEN (SELECT ROUND(SUM(valor_final) / COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho')
            ELSE 0
        END,
        'ciclo_medio_dias', (
            SELECT COALESCE(ROUND(AVG(
                EXTRACT(EPOCH FROM (o.data_fechamento::TIMESTAMPTZ - o.created_at)) / 86400
            ), 1), 0)
            FROM outcomes_pool o
            WHERE o.status_comercial = 'ganho'
              AND o.data_fechamento IS NOT NULL
              AND o.data_fechamento::TIMESTAMPTZ > o.created_at
        ),
        'viagens_vendidas', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho')
    ) INTO result;

    RETURN result;
END;
$$;

-- 2) analytics_revenue_timeseries — WHERE by mode, GROUP BY always data_fechamento
CREATE OR REPLACE FUNCTION analytics_revenue_timeseries(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_granularity TEXT DEFAULT 'month',
    p_product TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'activity'
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
      AND CASE
          WHEN p_mode = 'cohort' THEN
              c.created_at >= p_date_start AND c.created_at < p_date_end
          ELSE
              c.data_fechamento::TIMESTAMPTZ >= p_date_start
              AND c.data_fechamento::TIMESTAMPTZ < p_date_end
      END
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

-- 3) analytics_team_performance — unified date expression
CREATE OR REPLACE FUNCTION analytics_team_performance(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_phase TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'activity'
)
RETURNS TABLE(
    user_id UUID,
    user_nome TEXT,
    phase TEXT,
    total_cards BIGINT,
    won_cards BIGINT,
    lost_cards BIGINT,
    open_cards BIGINT,
    conversion_rate NUMERIC,
    total_receita NUMERIC,
    ticket_medio NUMERIC,
    ciclo_medio_dias NUMERIC,
    active_cards BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- SDR metrics (by sdr_owner_id)
    SELECT
        p.id AS user_id,
        p.nome AS user_nome,
        'SDR'::TEXT AS phase,
        COUNT(c.id)::BIGINT AS total_cards,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::BIGINT AS won_cards,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'perdido')::BIGINT AS lost_cards,
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT AS open_cards,
        CASE WHEN COUNT(c.id) > 0
            THEN ROUND(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::NUMERIC / COUNT(c.id)::NUMERIC * 100, 1)
            ELSE 0 END AS conversion_rate,
        COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0)::NUMERIC AS total_receita,
        CASE WHEN COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho') > 0
            THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho') / COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0)
            ELSE 0 END AS ticket_medio,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.data_fechamento::TIMESTAMPTZ - c.created_at)) / 86400)
            FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL), 1), 0) AS ciclo_medio_dias,
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT AS active_cards
    FROM profiles p
    INNER JOIN cards c ON c.sdr_owner_id = p.id
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
    WHERE (p_phase IS NULL OR p_phase = 'SDR')
    GROUP BY p.id, p.nome

    UNION ALL

    -- Planner metrics (by vendas_owner_id)
    SELECT
        p.id,
        p.nome,
        'Vendas'::TEXT,
        COUNT(c.id)::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'perdido')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT,
        CASE WHEN COUNT(c.id) > 0
            THEN ROUND(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::NUMERIC / COUNT(c.id)::NUMERIC * 100, 1)
            ELSE 0 END,
        COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0)::NUMERIC,
        CASE WHEN COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho') > 0
            THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho') / COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0)
            ELSE 0 END,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.data_fechamento::TIMESTAMPTZ - c.created_at)) / 86400)
            FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL), 1), 0),
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT
    FROM profiles p
    INNER JOIN cards c ON c.vendas_owner_id = p.id
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
    WHERE (p_phase IS NULL OR p_phase = 'Vendas')
    GROUP BY p.id, p.nome

    UNION ALL

    -- Pos-Venda metrics (by pos_owner_id)
    SELECT
        p.id,
        p.nome,
        'Pos-Venda'::TEXT,
        COUNT(c.id)::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial = 'perdido')::BIGINT,
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT,
        CASE WHEN COUNT(c.id) > 0
            THEN ROUND(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho')::NUMERIC / COUNT(c.id)::NUMERIC * 100, 1)
            ELSE 0 END,
        COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0)::NUMERIC,
        CASE WHEN COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho') > 0
            THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho') / COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0)
            ELSE 0 END,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.data_fechamento::TIMESTAMPTZ - c.created_at)) / 86400)
            FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL), 1), 0),
        COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT
    FROM profiles p
    INNER JOIN cards c ON c.pos_owner_id = p.id
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
    WHERE (p_phase IS NULL OR p_phase = 'Pos-Venda')
    GROUP BY p.id, p.nome

    ORDER BY total_cards DESC;
END;
$$;

-- 4) analytics_funnel_conversion — unified date expression
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
    JOIN pipeline_phases pp ON pp.id = s.phase_id
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

-- 5) analytics_loss_reasons — cohort=created_at, activity=data_fechamento
CREATE OR REPLACE FUNCTION analytics_loss_reasons(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'activity'
)
RETURNS TABLE(
    motivo TEXT,
    count BIGINT,
    percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_lost BIGINT;
BEGIN
    SELECT COUNT(*) INTO total_lost
    FROM cards c
    WHERE c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
      AND CASE
          WHEN p_mode = 'cohort' THEN
              c.created_at >= p_date_start AND c.created_at < p_date_end
          ELSE
              c.data_fechamento IS NOT NULL
              AND c.data_fechamento::TIMESTAMPTZ >= p_date_start
              AND c.data_fechamento::TIMESTAMPTZ < p_date_end
      END
      AND (p_product IS NULL OR c.produto::TEXT = p_product);

    RETURN QUERY
    SELECT
        COALESCE(mp.nome, 'Sem motivo informado') AS motivo,
        COUNT(c.id)::BIGINT AS count,
        CASE WHEN total_lost > 0
            THEN ROUND(COUNT(c.id)::NUMERIC / total_lost::NUMERIC * 100, 1)
            ELSE 0 END AS percentage
    FROM cards c
    LEFT JOIN motivos_perda mp ON c.motivo_perda_id = mp.id
    WHERE c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
      AND CASE
          WHEN p_mode = 'cohort' THEN
              c.created_at >= p_date_start AND c.created_at < p_date_end
          ELSE
              c.data_fechamento IS NOT NULL
              AND c.data_fechamento::TIMESTAMPTZ >= p_date_start
              AND c.data_fechamento::TIMESTAMPTZ < p_date_end
      END
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
    GROUP BY mp.nome
    ORDER BY count DESC;
END;
$$;

-- 6) analytics_financial_breakdown — WHERE by mode, GROUP BY always data_fechamento
CREATE OR REPLACE FUNCTION analytics_financial_breakdown(
    p_date_start  DATE DEFAULT NULL,
    p_date_end    DATE DEFAULT NULL,
    p_granularity TEXT DEFAULT 'month',
    p_product     TEXT DEFAULT NULL,
    p_mode        TEXT DEFAULT 'activity'
)
RETURNS TABLE(
    period         TEXT,
    valor_final_sum NUMERIC,
    receita_sum     NUMERIC,
    count_won       BIGINT,
    ticket_medio    NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE p_granularity
            WHEN 'day'   THEN TO_CHAR(c.data_fechamento, 'YYYY-MM-DD')
            WHEN 'week'  THEN TO_CHAR(DATE_TRUNC('week', c.data_fechamento), 'YYYY-MM-DD')
            ELSE TO_CHAR(DATE_TRUNC('month', c.data_fechamento), 'YYYY-MM')
        END AS period,
        COALESCE(SUM(c.valor_final), 0)  AS valor_final_sum,
        COALESCE(SUM(c.receita), 0)      AS receita_sum,
        COUNT(*)                          AS count_won,
        CASE WHEN COUNT(*) > 0
             THEN ROUND(COALESCE(SUM(c.valor_final), 0) / COUNT(*), 2)
             ELSE 0
        END AS ticket_medio
    FROM cards c
    WHERE c.status_comercial = 'ganho'
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.data_fechamento IS NOT NULL
      AND CASE
          WHEN p_mode = 'cohort' THEN
              (p_date_start IS NULL OR c.created_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.created_at < (p_date_end + 1)::TIMESTAMPTZ)
          ELSE
              (p_date_start IS NULL OR c.data_fechamento >= p_date_start)
              AND (p_date_end IS NULL OR c.data_fechamento <= p_date_end)
      END
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
    GROUP BY 1
    ORDER BY 1;
END;
$$;

-- 7) analytics_top_destinations — cohort=created_at, activity=data_fechamento
CREATE OR REPLACE FUNCTION analytics_top_destinations(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_limit      INT  DEFAULT 10,
    p_mode       TEXT DEFAULT 'activity'
)
RETURNS TABLE(
    destino       TEXT,
    total_cards   BIGINT,
    receita_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH won_cards AS (
        SELECT c.id, c.receita, c.pessoa_principal_id
        FROM cards c
        WHERE c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND CASE
              WHEN p_mode = 'cohort' THEN
                  (p_date_start IS NULL OR c.created_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.created_at < (p_date_end + 1)::TIMESTAMPTZ)
              ELSE
                  (p_date_start IS NULL OR c.data_fechamento >= p_date_start)
                  AND (p_date_end IS NULL OR c.data_fechamento <= p_date_end)
          END
    ),
    dest_expanded AS (
        SELECT
            d.elem->>'name' AS dest_name,
            wc.id AS card_id,
            wc.receita
        FROM won_cards wc
        JOIN contact_stats cs ON cs.contact_id = wc.pessoa_principal_id
        CROSS JOIN LATERAL jsonb_array_elements(cs.top_destinations) AS d(elem)
        WHERE cs.top_destinations IS NOT NULL
          AND jsonb_typeof(cs.top_destinations) = 'array'
    )
    SELECT
        de.dest_name                         AS destino,
        COUNT(DISTINCT de.card_id)           AS total_cards,
        COALESCE(SUM(de.receita), 0)         AS receita_total
    FROM dest_expanded de
    WHERE de.dest_name IS NOT NULL AND de.dest_name != ''
    GROUP BY de.dest_name
    ORDER BY receita_total DESC
    LIMIT p_limit;
END;
$$;

-- 8) analytics_revenue_by_product — cohort=created_at, activity=data_fechamento
CREATE OR REPLACE FUNCTION analytics_revenue_by_product(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_mode       TEXT DEFAULT 'activity'
)
RETURNS TABLE(
    produto       TEXT,
    count_won     BIGINT,
    valor_total   NUMERIC,
    receita_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.produto::TEXT               AS produto,
        COUNT(*)                      AS count_won,
        COALESCE(SUM(c.valor_final), 0)  AS valor_total,
        COALESCE(SUM(c.receita), 0)      AS receita_total
    FROM cards c
    WHERE c.status_comercial = 'ganho'
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND CASE
          WHEN p_mode = 'cohort' THEN
              (p_date_start IS NULL OR c.created_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.created_at < (p_date_end + 1)::TIMESTAMPTZ)
          ELSE
              (p_date_start IS NULL OR c.data_fechamento >= p_date_start)
              AND (p_date_end IS NULL OR c.data_fechamento <= p_date_end)
      END
    GROUP BY c.produto
    ORDER BY receita_total DESC;
END;
$$;

-- 9) analytics_operations_summary — cohort=created_at, activity=data_fechamento
CREATE OR REPLACE FUNCTION analytics_operations_summary(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'activity'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
BEGIN
    WITH won_cards AS (
        SELECT c.*
        FROM cards c
        WHERE c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND CASE
              WHEN p_mode = 'cohort' THEN
                  c.created_at >= v_start::TIMESTAMPTZ
                  AND c.created_at < (v_end + 1)::TIMESTAMPTZ
              ELSE
                  c.data_fechamento >= v_start
                  AND c.data_fechamento <= v_end
          END
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    kpis AS (
        SELECT
            COUNT(*) AS viagens_realizadas,
            COALESCE(SUM(c.valor_final), 0) AS valor_total,
            COALESCE(AVG(c.valor_final), 0) AS ticket_medio
        FROM won_cards c
    ),
    sub_cards AS (
        SELECT
            sc.parent_card_id,
            sc.id,
            sc.sub_card_mode,
            sc.sub_card_status,
            sc.created_at,
            sc.updated_at
        FROM cards sc
        WHERE sc.card_type = 'sub_card'
          AND sc.deleted_at IS NULL
          AND sc.parent_card_id IN (SELECT id FROM won_cards)
    ),
    sub_stats AS (
        SELECT
            COUNT(*) AS total_sub_cards,
            COUNT(DISTINCT parent_card_id) AS cards_with_changes,
            ROUND(
                CASE WHEN (SELECT COUNT(*) FROM won_cards) > 0
                     THEN COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM won_cards)
                     ELSE 0
                END, 2
            ) AS changes_per_trip
        FROM sub_cards
    ),
    per_planner AS (
        SELECT
            p.nome AS planner_nome,
            COUNT(DISTINCT wc.id) AS viagens,
            COUNT(sc.id) AS mudancas,
            CASE WHEN COUNT(DISTINCT wc.id) > 0
                 THEN ROUND(COUNT(sc.id)::NUMERIC / COUNT(DISTINCT wc.id), 2)
                 ELSE 0
            END AS mudancas_por_viagem,
            COALESCE(SUM(wc.valor_final), 0) AS receita
        FROM won_cards wc
        LEFT JOIN cards sc ON sc.parent_card_id = wc.id
            AND sc.card_type = 'sub_card'
            AND sc.deleted_at IS NULL
        LEFT JOIN profiles p ON p.id = wc.vendas_owner_id
        WHERE wc.vendas_owner_id IS NOT NULL
        GROUP BY p.nome, wc.vendas_owner_id
        ORDER BY viagens DESC
    ),
    timeline AS (
        SELECT
            TO_CHAR(DATE_TRUNC('week', sc.created_at::TIMESTAMPTZ), 'YYYY-MM-DD') AS week,
            COUNT(*) AS count
        FROM sub_cards sc
        GROUP BY 1
        ORDER BY 1
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k) FROM kpis k),
        'sub_card_stats', (SELECT row_to_json(s) FROM sub_stats s),
        'per_planner', (SELECT COALESCE(jsonb_agg(row_to_json(pp)), '[]'::jsonb) FROM per_planner pp),
        'timeline', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM timeline t)
    ) INTO result;

    RETURN result;
END;
$$;

-- Grants (re-grant for all updated functions)
GRANT EXECUTE ON FUNCTION analytics_overview_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_revenue_timeseries TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_team_performance TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_loss_reasons TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_financial_breakdown TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_destinations TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_revenue_by_product TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_operations_summary TO authenticated;
