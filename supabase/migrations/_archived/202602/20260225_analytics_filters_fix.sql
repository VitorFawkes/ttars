-- ============================================================
-- Analytics: Fix all RPCs to respect global filters
-- Adds missing date range, product, and mode parameters
-- ============================================================

-- 1) analytics_funnel_live (NEW)
--    Replaces REST query to view_dashboard_funil with full filter support
-- ============================================================
DROP FUNCTION IF EXISTS analytics_funnel_live(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);

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
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND c.status_comercial NOT IN ('ganho', 'perdido')
        AND c.created_at >= p_date_start
        AND c.created_at < p_date_end
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
    WHERE s.ativo = true
    GROUP BY s.id, s.nome, s.fase, s.ordem
    ORDER BY s.ordem;
END;
$$;

-- 2) analytics_sla_violations — add date range + mode (historical)
-- ============================================================
DROP FUNCTION IF EXISTS analytics_sla_violations(TEXT, INT);

CREATE OR REPLACE FUNCTION analytics_sla_violations(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'activity',
    p_limit      INT DEFAULT 50
)
RETURNS TABLE(
    card_id            UUID,
    titulo             TEXT,
    stage_nome         TEXT,
    owner_nome         TEXT,
    dias_na_etapa      NUMERIC,
    sla_hours          INT,
    sla_exceeded_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS card_id,
        c.titulo,
        s.nome AS stage_nome,
        p.nome AS owner_nome,
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400, 1) AS dias_na_etapa,
        COALESCE(s.sla_hours, 0)::INT AS sla_hours,
        ROUND(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600
            - COALESCE(s.sla_hours, 0),
        1) AS sla_exceeded_hours
    FROM cards c
    INNER JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN profiles p ON p.id = c.dono_atual_id
    WHERE c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status_comercial NOT IN ('ganho', 'perdido')
      AND s.sla_hours IS NOT NULL
      AND s.sla_hours > 0
      AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 > s.sla_hours
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND c.created_at >= p_date_start
      AND c.created_at < p_date_end
    ORDER BY sla_exceeded_hours DESC
    LIMIT p_limit;
END;
$$;

-- 3) analytics_sla_summary — add date range + mode (historical)
-- ============================================================
DROP FUNCTION IF EXISTS analytics_sla_summary(TEXT);

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
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND c.status_comercial NOT IN ('ganho', 'perdido')
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND c.created_at >= p_date_start
        AND c.created_at < p_date_end
    WHERE s.ativo = true
    GROUP BY s.id, s.nome, s.sla_hours, s.ordem
    ORDER BY s.ordem;
END;
$$;

-- 4) analytics_whatsapp_metrics — add product filter
-- ============================================================
DROP FUNCTION IF EXISTS analytics_whatsapp_metrics(DATE, DATE);

CREATE OR REPLACE FUNCTION analytics_whatsapp_metrics(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_product    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    v_start TIMESTAMPTZ := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   TIMESTAMPTZ := COALESCE(p_date_end, CURRENT_DATE) + INTERVAL '1 day';
BEGIN
    WITH msg_base AS (
        SELECT
            m.id,
            m.card_id,
            m.lado,
            m.data_hora,
            m.remetente_interno_id
        FROM mensagens m
        WHERE m.canal = 'whatsapp'
          AND m.data_hora >= v_start
          AND m.data_hora < v_end
          AND (p_product IS NULL OR EXISTS (
              SELECT 1 FROM cards c
              WHERE c.id = m.card_id
                AND c.produto::TEXT = p_product
                AND c.deleted_at IS NULL
          ))
    ),
    volume AS (
        SELECT
            COUNT(*) AS total_msgs,
            COUNT(*) FILTER (WHERE lado = 'cliente') AS inbound,
            COUNT(*) FILTER (WHERE lado = 'consultor') AS outbound,
            COUNT(DISTINCT card_id) AS active_conversations
        FROM msg_base
    ),
    daily AS (
        SELECT
            data_hora::date AS dia,
            COUNT(*) FILTER (WHERE lado = 'cliente') AS inbound,
            COUNT(*) FILTER (WHERE lado = 'consultor') AS outbound
        FROM msg_base
        WHERE data_hora IS NOT NULL
        GROUP BY data_hora::date
        ORDER BY dia
    ),
    last_inbound AS (
        SELECT DISTINCT ON (card_id)
            card_id,
            data_hora AS last_inbound_at
        FROM msg_base
        WHERE lado = 'cliente'
        ORDER BY card_id, data_hora DESC
    ),
    unanswered AS (
        SELECT
            li.card_id,
            li.last_inbound_at,
            EXTRACT(EPOCH FROM (NOW() - li.last_inbound_at)) / 3600.0 AS hours_waiting
        FROM last_inbound li
        WHERE NOT EXISTS (
            SELECT 1 FROM msg_base m2
            WHERE m2.card_id = li.card_id
              AND m2.lado = 'consultor'
              AND m2.data_hora > li.last_inbound_at
        )
    ),
    aging AS (
        SELECT
            COUNT(*) FILTER (WHERE hours_waiting < 1) AS lt_1h,
            COUNT(*) FILTER (WHERE hours_waiting >= 1 AND hours_waiting < 4) AS h1_4,
            COUNT(*) FILTER (WHERE hours_waiting >= 4 AND hours_waiting < 24) AS h4_24,
            COUNT(*) FILTER (WHERE hours_waiting >= 24) AS gt_24h,
            COUNT(*) AS total_unanswered
        FROM unanswered
    ),
    response_times AS (
        SELECT
            m_in.card_id,
            m_in.data_hora AS inbound_at,
            MIN(m_out.data_hora) AS first_reply_at
        FROM msg_base m_in
        JOIN msg_base m_out
            ON m_out.card_id = m_in.card_id
            AND m_out.lado = 'consultor'
            AND m_out.data_hora > m_in.data_hora
        WHERE m_in.lado = 'cliente'
        GROUP BY m_in.card_id, m_in.data_hora
    ),
    rt_stats AS (
        SELECT
            ROUND(AVG(EXTRACT(EPOCH FROM (first_reply_at - inbound_at)) / 60.0)::NUMERIC, 1) AS avg_response_minutes,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_reply_at - inbound_at)) / 60.0)::NUMERIC, 1) AS median_response_minutes
        FROM response_times
        WHERE first_reply_at IS NOT NULL
    ),
    per_user AS (
        SELECT
            p.nome AS user_nome,
            ROUND(AVG(EXTRACT(EPOCH FROM (rt.first_reply_at - rt.inbound_at)) / 60.0)::NUMERIC, 1) AS avg_minutes,
            COUNT(*) AS total_replies
        FROM response_times rt
        JOIN msg_base m ON m.card_id = rt.card_id AND m.data_hora = rt.first_reply_at
        JOIN profiles p ON p.id = m.remetente_interno_id
        WHERE rt.first_reply_at IS NOT NULL
        GROUP BY p.nome
        ORDER BY avg_minutes
    )
    SELECT jsonb_build_object(
        'volume', (SELECT row_to_json(v) FROM volume v),
        'daily', (SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb) FROM daily d),
        'aging', (SELECT row_to_json(a) FROM aging a),
        'response_time', (SELECT row_to_json(r) FROM rt_stats r),
        'per_user', (SELECT COALESCE(jsonb_agg(row_to_json(u)), '[]'::jsonb) FROM per_user u)
    ) INTO result;

    RETURN result;
END;
$$;

-- 5) analytics_top_destinations — add product filter
-- ============================================================
DROP FUNCTION IF EXISTS analytics_top_destinations(DATE, DATE, INT, TEXT);

CREATE OR REPLACE FUNCTION analytics_top_destinations(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_limit      INT  DEFAULT 10,
    p_mode       TEXT DEFAULT 'activity',
    p_product    TEXT DEFAULT NULL
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
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
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

-- 6) analytics_revenue_by_product — add product filter
-- ============================================================
DROP FUNCTION IF EXISTS analytics_revenue_by_product(DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION analytics_revenue_by_product(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_mode       TEXT DEFAULT 'activity',
    p_product    TEXT DEFAULT NULL
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
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
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

-- 7) analytics_retention_cohort — change to date range + product
-- ============================================================
DROP FUNCTION IF EXISTS analytics_retention_cohort(INT);

CREATE OR REPLACE FUNCTION analytics_retention_cohort(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_product    TEXT DEFAULT NULL
)
RETURNS TABLE(
    cohort_month    TEXT,
    month_offset    INT,
    total_contacts  BIGINT,
    retained        BIGINT,
    retention_rate  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '12 months');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
BEGIN
    RETURN QUERY
    WITH cohorts AS (
        SELECT
            co.id AS contact_id,
            DATE_TRUNC('month', co.primeira_venda_data::TIMESTAMPTZ) AS cohort_date
        FROM contatos co
        WHERE co.primeira_venda_data IS NOT NULL
          AND co.deleted_at IS NULL
          AND co.primeira_venda_data::DATE >= v_start
          AND co.primeira_venda_data::DATE <= v_end
          AND (p_product IS NULL OR EXISTS (
              SELECT 1 FROM cards_contatos cc
              JOIN cards c ON c.id = cc.card_id
              WHERE cc.contato_id = co.id
                AND c.status_comercial = 'ganho'
                AND c.produto::TEXT = p_product
                AND c.deleted_at IS NULL
          ))
    ),
    cohort_sizes AS (
        SELECT
            cohort_date,
            COUNT(*) AS total
        FROM cohorts
        GROUP BY cohort_date
    ),
    repeat_purchases AS (
        SELECT
            ch.contact_id,
            ch.cohort_date,
            DATE_TRUNC('month', c.data_fechamento::TIMESTAMPTZ) AS purchase_month
        FROM cohorts ch
        JOIN cards_contatos cc ON cc.contato_id = ch.contact_id
        JOIN cards c ON c.id = cc.card_id
        WHERE c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL
          AND c.data_fechamento IS NOT NULL
          AND DATE_TRUNC('month', c.data_fechamento::TIMESTAMPTZ) > ch.cohort_date
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    offsets AS (
        SELECT
            rp.cohort_date,
            (EXTRACT(YEAR FROM rp.purchase_month) * 12 + EXTRACT(MONTH FROM rp.purchase_month))
            - (EXTRACT(YEAR FROM rp.cohort_date) * 12 + EXTRACT(MONTH FROM rp.cohort_date))
            AS m_offset,
            rp.contact_id
        FROM repeat_purchases rp
    ),
    aggregated AS (
        SELECT
            o.cohort_date,
            o.m_offset::INT AS m_offset,
            COUNT(DISTINCT o.contact_id) AS retained_count
        FROM offsets o
        WHERE o.m_offset BETWEEN 1 AND 12
        GROUP BY o.cohort_date, o.m_offset
    )
    SELECT
        TO_CHAR(cs.cohort_date, 'YYYY-MM') AS cohort_month,
        COALESCE(a.m_offset, 0)            AS month_offset,
        cs.total                           AS total_contacts,
        COALESCE(a.retained_count, 0)      AS retained,
        CASE WHEN cs.total > 0
             THEN ROUND(COALESCE(a.retained_count, 0)::NUMERIC / cs.total * 100, 1)
             ELSE 0
        END AS retention_rate
    FROM cohort_sizes cs
    LEFT JOIN aggregated a ON a.cohort_date = cs.cohort_date
    ORDER BY cs.cohort_date, a.m_offset;
END;
$$;

-- 8) analytics_retention_kpis — add date range + product
-- ============================================================
DROP FUNCTION IF EXISTS analytics_retention_kpis();

CREATE OR REPLACE FUNCTION analytics_retention_kpis(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_product    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    WITH base AS (
        SELECT
            co.id,
            cs.total_trips,
            co.primeira_venda_data,
            co.ultima_venda_data
        FROM contatos co
        LEFT JOIN contact_stats cs ON cs.contact_id = co.id
        WHERE co.deleted_at IS NULL
          AND co.primeira_venda_data IS NOT NULL
          AND (p_date_start IS NULL OR co.primeira_venda_data::DATE >= p_date_start)
          AND (p_date_end IS NULL   OR co.primeira_venda_data::DATE <= p_date_end)
          AND (p_product IS NULL OR EXISTS (
              SELECT 1 FROM cards_contatos cc
              JOIN cards c ON c.id = cc.card_id
              WHERE cc.contato_id = co.id
                AND c.status_comercial = 'ganho'
                AND c.produto::TEXT = p_product
                AND c.deleted_at IS NULL
          ))
    ),
    stats AS (
        SELECT
            COUNT(*) AS total_with_purchase,
            COUNT(*) FILTER (WHERE COALESCE(total_trips, 0) > 1) AS repeat_buyers,
            COUNT(*) FILTER (
                WHERE ultima_venda_data IS NOT NULL
                  AND ultima_venda_data::DATE < (CURRENT_DATE - INTERVAL '18 months')
            ) AS churned,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(
                     COUNT(*) FILTER (WHERE COALESCE(total_trips, 0) > 1)::NUMERIC / COUNT(*) * 100, 1
                 )
                 ELSE 0
            END AS repurchase_rate,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(
                     COUNT(*) FILTER (
                         WHERE ultima_venda_data IS NOT NULL
                           AND ultima_venda_data::DATE < (CURRENT_DATE - INTERVAL '18 months')
                     )::NUMERIC / COUNT(*) * 100, 1
                 )
                 ELSE 0
            END AS churn_rate
        FROM base
    )
    SELECT row_to_json(s)::JSONB INTO result FROM stats s;

    RETURN result;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION analytics_funnel_live TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_violations TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_summary TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_whatsapp_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_destinations TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_revenue_by_product TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_retention_cohort TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_retention_kpis TO authenticated;
