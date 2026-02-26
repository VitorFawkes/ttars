-- ============================================================
-- Analytics Phase 3: WhatsApp + Financial + Retention RPCs
-- ============================================================

-- 1) analytics_whatsapp_metrics
--    Volume de mensagens, aging de conversas sem resposta, response time inferido
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_whatsapp_metrics(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL
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
    ),
    -- Volume total
    volume AS (
        SELECT
            COUNT(*) AS total_msgs,
            COUNT(*) FILTER (WHERE lado = 'cliente') AS inbound,
            COUNT(*) FILTER (WHERE lado = 'consultor') AS outbound,
            COUNT(DISTINCT card_id) AS active_conversations
        FROM msg_base
    ),
    -- Volume por dia
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
    -- Ultima msg inbound por card (sem resposta outbound depois)
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
    -- Response time inferido (diff entre inbound e proximo outbound no mesmo card)
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
    -- Response time por consultor
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

-- 2) analytics_financial_breakdown
--    Receita vs margem por periodo, ticket medio
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_financial_breakdown(
    p_date_start  DATE DEFAULT NULL,
    p_date_end    DATE DEFAULT NULL,
    p_granularity TEXT DEFAULT 'month',
    p_product     TEXT DEFAULT NULL
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
      AND (p_date_start IS NULL OR c.data_fechamento >= p_date_start)
      AND (p_date_end IS NULL   OR c.data_fechamento <= p_date_end)
      AND (p_product IS NULL    OR c.produto::TEXT = p_product)
    GROUP BY 1
    ORDER BY 1;
END;
$$;

-- 3) analytics_top_destinations
--    Destinos mais rentaveis (agrega de contact_stats.top_destinations)
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_top_destinations(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_limit      INT  DEFAULT 10
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
    -- top_destinations e um JSONB array tipo [{"name":"Roma","count":2}, ...]
    -- Vamos agregar de cards ganhos que tem contatos com top_destinations
    RETURN QUERY
    WITH won_cards AS (
        SELECT c.id, c.receita, c.pessoa_principal_id
        FROM cards c
        WHERE c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND (p_date_start IS NULL OR c.data_fechamento >= p_date_start)
          AND (p_date_end IS NULL   OR c.data_fechamento <= p_date_end)
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

-- 4) analytics_revenue_by_product
--    Receita por produto (TRIPS, WEDDING, CORP)
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_revenue_by_product(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL
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
      AND (p_date_start IS NULL OR c.data_fechamento >= p_date_start)
      AND (p_date_end IS NULL   OR c.data_fechamento <= p_date_end)
    GROUP BY c.produto
    ORDER BY receita_total DESC;
END;
$$;

-- 5) analytics_retention_cohort
--    Analise de cohort por mes de primeira compra
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_retention_cohort(
    p_months_back INT DEFAULT 12
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
BEGIN
    RETURN QUERY
    WITH cohorts AS (
        -- Contatos que tem primeira venda
        SELECT
            co.id AS contact_id,
            DATE_TRUNC('month', co.primeira_venda_data::TIMESTAMPTZ) AS cohort_date
        FROM contatos co
        WHERE co.primeira_venda_data IS NOT NULL
          AND co.deleted_at IS NULL
          AND co.primeira_venda_data >= (CURRENT_DATE - (p_months_back || ' months')::INTERVAL)
    ),
    cohort_sizes AS (
        SELECT
            cohort_date,
            COUNT(*) AS total
        FROM cohorts
        GROUP BY cohort_date
    ),
    -- Para cada contato no cohort, ver se teve compra X meses depois
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

-- 6) analytics_operations_summary
--    Viagens realizadas, solicitacoes de mudanca, qualidade por planner
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_operations_summary(
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
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
BEGIN
    WITH won_cards AS (
        SELECT c.*
        FROM cards c
        WHERE c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND (c.data_fechamento >= v_start)
          AND (c.data_fechamento <= v_end)
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    -- KPIs gerais
    kpis AS (
        SELECT
            COUNT(*) AS viagens_realizadas,
            COALESCE(SUM(c.valor_final), 0) AS valor_total,
            COALESCE(AVG(c.valor_final), 0) AS ticket_medio
        FROM won_cards c
    ),
    -- Sub-cards (solicitacoes de mudanca)
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
    -- Qualidade por planner (vendas_owner = quem montou a viagem)
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
    -- Timeline de sub-cards por semana
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

-- 7) analytics_retention_kpis
--    KPIs de recorrencia: taxa recompra, churn estimado, clientes fieis
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_retention_kpis()
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
