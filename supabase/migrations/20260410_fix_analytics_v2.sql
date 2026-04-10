-- Fix analytics_operations_summary e analytics_funnel_conversion
-- DROP + CREATE para evitar conflito de return type

-- 1. DROP + Recriar analytics_funnel_conversion
DROP FUNCTION IF EXISTS analytics_funnel_conversion(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID[], UUID[]);

CREATE FUNCTION analytics_funnel_conversion(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id           UUID,
    stage_nome         TEXT,
    phase_slug         TEXT,
    ordem              INT,
    current_count      BIGINT,
    total_valor        NUMERIC,
    receita_total      NUMERIC,
    avg_days_in_stage  NUMERIC,
    p75_days_in_stage  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    SELECT
        s.id AS stage_id,
        s.nome AS stage_nome,
        pp.slug AS phase_slug,
        s.ordem,
        COUNT(c.id) AS current_count,
        COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)), 0) AS total_valor,
        COALESCE(SUM(c.receita), 0) AS receita_total,
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0)::NUMERIC, 0) AS avg_days_in_stage,
        COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0)::NUMERIC, 0) AS p75_days_in_stage
    FROM pipeline_stages s
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    JOIN pipelines pip ON pip.id = s.pipeline_id
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.org_id = v_org
        AND c.status_comercial = 'aberto'
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND COALESCE(c.card_type, 'standard') != 'sub_card'
        AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
        AND _a_tag_ok(c.id, p_tag_ids)
    WHERE (p_product IS NULL OR pip.produto::TEXT = p_product)
    GROUP BY s.id, s.nome, pp.slug, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

-- 2. DROP + Recriar analytics_operations_summary
DROP FUNCTION IF EXISTS analytics_operations_summary(DATE, DATE, TEXT, TEXT, UUID, UUID, UUID[]);
DROP FUNCTION IF EXISTS analytics_operations_summary(DATE, DATE, TEXT, TEXT, UUID, UUID, UUID[], UUID[]);

CREATE FUNCTION analytics_operations_summary(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
    v_org UUID := requesting_org_id();
BEGIN
    WITH won_cards AS (
        SELECT c.*
        FROM cards c
        WHERE c.org_id = v_org
          AND c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= v_start::TIMESTAMPTZ AND c.ganho_sdr_at < (v_end + 1)::TIMESTAMPTZ
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= v_start::TIMESTAMPTZ AND c.ganho_planner_at < (v_end + 1)::TIMESTAMPTZ
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= v_start::TIMESTAMPTZ AND c.ganho_pos_at < (v_end + 1)::TIMESTAMPTZ
              ELSE
                  c.created_at >= v_start::TIMESTAMPTZ AND c.created_at < (v_end + 1)::TIMESTAMPTZ
          END
    ),
    kpis AS (
        SELECT
            COUNT(*) AS viagens_realizadas,
            COALESCE(SUM(valor_final), 0) AS valor_total,
            CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(valor_final), 0) / COUNT(*), 2) ELSE 0 END AS ticket_medio,
            COALESCE(SUM(receita), 0) AS receita
        FROM won_cards
    ),
    sub_cards AS (
        SELECT sc.*
        FROM cards sc
        JOIN won_cards wc ON sc.parent_card_id = wc.id
        WHERE sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
    ),
    sub_stats AS (
        SELECT
            COUNT(*) AS total_sub_cards,
            0 AS additions_count,
            0 AS changes_count,
            COUNT(DISTINCT parent_card_id) AS cards_with_changes,
            CASE WHEN COUNT(DISTINCT parent_card_id) > 0
                 THEN ROUND(COUNT(*)::NUMERIC / COUNT(DISTINCT parent_card_id), 2) ELSE 0 END AS changes_per_trip
        FROM sub_cards
    ),
    per_planner AS (
        SELECT p.nome AS planner_nome,
            wc.vendas_owner_id AS planner_id,
            COUNT(DISTINCT wc.id) AS viagens,
            COUNT(sc.id) AS mudancas,
            0 AS additions,
            0 AS changes,
            CASE WHEN COUNT(DISTINCT wc.id) > 0
                 THEN ROUND(COUNT(sc.id)::NUMERIC / COUNT(DISTINCT wc.id), 2) ELSE 0 END AS mudancas_por_viagem,
            COALESCE(SUM(wc.valor_final), 0) AS receita
        FROM won_cards wc
        LEFT JOIN cards sc ON sc.parent_card_id = wc.id AND sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
        LEFT JOIN profiles p ON p.id = wc.vendas_owner_id
        WHERE wc.vendas_owner_id IS NOT NULL
        GROUP BY p.nome, wc.vendas_owner_id ORDER BY viagens DESC
    ),
    timeline AS (
        SELECT TO_CHAR(DATE_TRUNC('week', sc.created_at::TIMESTAMPTZ), 'YYYY-MM-DD') AS week, COUNT(*) AS count
        FROM sub_cards sc GROUP BY 1 ORDER BY 1
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

GRANT EXECUTE ON FUNCTION analytics_operations_summary TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;
