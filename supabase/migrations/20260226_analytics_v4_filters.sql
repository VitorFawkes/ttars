-- ============================================================
-- Analytics v4 — Funil sempre por entradas + filtro por consultor
--
-- Mudanças:
--   1. funnel_live e funnel_conversion: TODOS os modos agora mostram
--      ENTRADAS (stage transitions), não posição atual. O modo define
--      apenas a POPULAÇÃO de cards.
--   2. p_owner_id UUID adicionado a todas as 13 RPCs.
--   3. funnel_conversion ganha p75_days_in_stage.
--
-- Backward compat: 'activity' cai no ELSE (created_at).
-- ============================================================

-- ── 1. analytics_funnel_live ───────────────────────────────
-- Agora: 2 branches (entries time-scoped vs population-based)
DROP FUNCTION IF EXISTS analytics_funnel_live(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_funnel_live(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_funnel_live(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL
)
RETURNS TABLE(
    stage_id      UUID,
    stage_nome    TEXT,
    fase          TEXT,
    ordem         INT,
    total_cards   BIGINT,
    valor_total   NUMERIC,
    receita_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        -- ENTRADAS: quantos cards ENTRARAM em cada etapa no período
        -- Filtro temporal nas activities + cards.created_at
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.created_at >= p_date_start AND c.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id            AS stage_id,
            s.nome          AS stage_nome,
            s.fase,
            s.ordem::INT,
            COUNT(ae.card_id)::BIGINT AS total_cards,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;

    ELSE
        -- TODOS OS OUTROS MODOS: primeiro define a POPULAÇÃO, depois conta ENTRADAS
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
        ),
        transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            WHERE a.tipo = 'stage_changed'
              AND a.card_id IN (SELECT pop.card_id FROM population pop)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.id IN (SELECT pop.card_id FROM population pop)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id            AS stage_id,
            s.nome          AS stage_nome,
            s.fase,
            s.ordem::INT,
            COUNT(ae.card_id)::BIGINT AS total_cards,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;
    END IF;
END;
$$;

-- ── 2. analytics_funnel_conversion ─────────────────────────
-- Mesma lógica de entries para todos os modos + p75_days_in_stage
DROP FUNCTION IF EXISTS analytics_funnel_conversion(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_funnel_conversion(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_funnel_conversion(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL
)
RETURNS TABLE(
    stage_id           UUID,
    stage_nome         TEXT,
    phase_slug         TEXT,
    ordem              INT,
    current_count      BIGINT,
    total_valor        NUMERIC,
    avg_days_in_stage  NUMERIC,
    p75_days_in_stage  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        -- ENTRADAS: contagem por etapa no período
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.created_at >= p_date_start AND c.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        ),
        stage_times AS (
            SELECT c.pipeline_stage_id AS sid,
                EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400 AS days
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND c.status_comercial NOT IN ('ganho', 'perdido')
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        )
        SELECT
            s.id AS stage_id,
            s.nome AS stage_nome,
            COALESCE(s.fase, 'SDR') AS phase_slug,
            s.ordem::INT,
            COUNT(DISTINCT ae.card_id)::BIGINT AS current_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS total_valor,
            COALESCE(ROUND(AVG(st.days), 1), 0)::NUMERIC AS avg_days_in_stage,
            COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY st.days)::NUMERIC, 1), 0)::NUMERIC AS p75_days_in_stage
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN stage_times st ON st.sid = s.id
        WHERE s.ativo = true
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;

    ELSE
        -- POPULAÇÃO-BASED: entradas de cards no cohort selecionado
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
        ),
        transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            WHERE a.tipo = 'stage_changed'
              AND a.card_id IN (SELECT pop.card_id FROM population pop)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.id IN (SELECT pop.card_id FROM population pop)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        ),
        stage_times AS (
            SELECT c.pipeline_stage_id AS sid,
                EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400 AS days
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND c.status_comercial NOT IN ('ganho', 'perdido')
              AND c.id IN (SELECT pop.card_id FROM population pop)
        )
        SELECT
            s.id AS stage_id,
            s.nome AS stage_nome,
            COALESCE(s.fase, 'SDR') AS phase_slug,
            s.ordem::INT,
            COUNT(DISTINCT ae.card_id)::BIGINT AS current_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS total_valor,
            COALESCE(ROUND(AVG(st.days), 1), 0)::NUMERIC AS avg_days_in_stage,
            COALESCE(ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY st.days)::NUMERIC, 1), 0)::NUMERIC AS p75_days_in_stage
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN stage_times st ON st.sid = s.id
        WHERE s.ativo = true
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;
    END IF;
END;
$$;

-- ── 3. analytics_overview_kpis ─────────────────────────────
DROP FUNCTION IF EXISTS analytics_overview_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_overview_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_overview_kpis(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    WITH leads_pool AS (
        SELECT c.*
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
    ),
    outcomes_pool AS (
        SELECT c.*
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial IN ('ganho', 'perdido')
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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

-- ── 4. analytics_revenue_timeseries ────────────────────────
DROP FUNCTION IF EXISTS analytics_revenue_timeseries(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_revenue_timeseries(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_revenue_timeseries(
    p_date_start  TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end    TIMESTAMPTZ DEFAULT NOW(),
    p_granularity TEXT DEFAULT 'month',
    p_product     TEXT DEFAULT NULL,
    p_mode        TEXT DEFAULT 'entries',
    p_stage_id    UUID DEFAULT NULL,
    p_owner_id    UUID DEFAULT NULL
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
      AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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

-- ── 5. analytics_team_performance ──────────────────────────
DROP FUNCTION IF EXISTS analytics_team_performance(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_team_performance(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_team_performance(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_phase      TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID, user_nome TEXT, phase TEXT,
    total_cards BIGINT, won_cards BIGINT, lost_cards BIGINT, open_cards BIGINT,
    conversion_rate NUMERIC, total_receita NUMERIC, ticket_medio NUMERIC,
    ciclo_medio_dias NUMERIC, active_cards BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- SDR metrics
    SELECT
        p.id AS user_id, p.nome AS user_nome, 'SDR'::TEXT AS phase,
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
    INNER JOIN cards c ON c.sdr_owner_id = p.id
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
    WHERE (p_phase IS NULL OR p_phase = 'SDR')
    GROUP BY p.id, p.nome

    UNION ALL

    -- Planner metrics
    SELECT
        p.id, p.nome, 'Vendas'::TEXT,
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
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
    WHERE (p_phase IS NULL OR p_phase = 'Vendas')
    GROUP BY p.id, p.nome

    UNION ALL

    -- Pos-Venda metrics
    SELECT
        p.id, p.nome, 'Pos-Venda'::TEXT,
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
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
    WHERE (p_phase IS NULL OR p_phase = 'Pos-Venda')
    GROUP BY p.id, p.nome

    ORDER BY total_cards DESC;
END;
$$;

-- ── 6. analytics_loss_reasons ──────────────────────────────
DROP FUNCTION IF EXISTS analytics_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_loss_reasons(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL
)
RETURNS TABLE(motivo TEXT, count BIGINT, percentage NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_lost BIGINT;
BEGIN
    SELECT COUNT(*) INTO total_lost
    FROM cards c
    WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
      END;

    RETURN QUERY
    SELECT
        COALESCE(mp.nome, 'Sem motivo informado') AS motivo,
        COUNT(c.id)::BIGINT AS count,
        CASE WHEN total_lost > 0
            THEN ROUND(COUNT(c.id)::NUMERIC / total_lost::NUMERIC * 100, 1)
            ELSE 0 END AS percentage
    FROM cards c
    LEFT JOIN motivos_perda mp ON c.motivo_perda_id = mp.id
    WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
    GROUP BY mp.nome
    ORDER BY count DESC;
END;
$$;

-- ── 7. analytics_financial_breakdown (DATE params) ─────────
DROP FUNCTION IF EXISTS analytics_financial_breakdown(DATE, DATE, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_financial_breakdown(DATE, DATE, TEXT, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_financial_breakdown(
    p_date_start  DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_granularity TEXT DEFAULT 'month', p_product TEXT DEFAULT NULL,
    p_mode        TEXT DEFAULT 'entries', p_stage_id UUID DEFAULT NULL,
    p_owner_id    UUID DEFAULT NULL
)
RETURNS TABLE(period TEXT, valor_final_sum NUMERIC, receita_sum NUMERIC, count_won BIGINT, ticket_medio NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE p_granularity
            WHEN 'day'  THEN TO_CHAR(c.data_fechamento, 'YYYY-MM-DD')
            WHEN 'week' THEN TO_CHAR(DATE_TRUNC('week', c.data_fechamento), 'YYYY-MM-DD')
            ELSE TO_CHAR(DATE_TRUNC('month', c.data_fechamento), 'YYYY-MM')
        END AS period,
        COALESCE(SUM(c.valor_final), 0), COALESCE(SUM(c.receita), 0),
        COUNT(*),
        CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(c.valor_final), 0) / COUNT(*), 2) ELSE 0 END
    FROM cards c
    WHERE c.status_comercial = 'ganho' AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.data_fechamento IS NOT NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                  p_stage_id, COALESCE(p_date_start, '2020-01-01'::DATE)::TIMESTAMPTZ,
                  COALESCE(p_date_end + 1, '2099-01-01'::DATE)::TIMESTAMPTZ, p_product))
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true
              AND (p_date_start IS NULL OR c.ganho_sdr_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_sdr_at < (p_date_end + 1)::TIMESTAMPTZ)
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true
              AND (p_date_start IS NULL OR c.ganho_planner_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_planner_at < (p_date_end + 1)::TIMESTAMPTZ)
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true
              AND (p_date_start IS NULL OR c.ganho_pos_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_pos_at < (p_date_end + 1)::TIMESTAMPTZ)
          ELSE
              (p_date_start IS NULL OR c.created_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.created_at < (p_date_end + 1)::TIMESTAMPTZ)
      END
    GROUP BY 1 ORDER BY 1;
END;
$$;

-- ── 8. analytics_top_destinations (DATE params) ────────────
DROP FUNCTION IF EXISTS analytics_top_destinations(DATE, DATE, INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_top_destinations(DATE, DATE, INT, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_top_destinations(
    p_date_start DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_limit INT DEFAULT 10, p_mode TEXT DEFAULT 'entries',
    p_product TEXT DEFAULT NULL, p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL
)
RETURNS TABLE(destino TEXT, total_cards BIGINT, receita_total NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH won_cards AS (
        SELECT c.id, c.receita, c.pessoa_principal_id
        FROM cards c
        WHERE c.status_comercial = 'ganho' AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                      p_stage_id, COALESCE(p_date_start, '2020-01-01'::DATE)::TIMESTAMPTZ,
                      COALESCE(p_date_end + 1, '2099-01-01'::DATE)::TIMESTAMPTZ, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true
                  AND (p_date_start IS NULL OR c.ganho_sdr_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.ganho_sdr_at < (p_date_end + 1)::TIMESTAMPTZ)
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true
                  AND (p_date_start IS NULL OR c.ganho_planner_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.ganho_planner_at < (p_date_end + 1)::TIMESTAMPTZ)
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true
                  AND (p_date_start IS NULL OR c.ganho_pos_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.ganho_pos_at < (p_date_end + 1)::TIMESTAMPTZ)
              ELSE
                  (p_date_start IS NULL OR c.created_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.created_at < (p_date_end + 1)::TIMESTAMPTZ)
          END
    ),
    dest_expanded AS (
        SELECT d.elem->>'name' AS dest_name, wc.id AS card_id, wc.receita
        FROM won_cards wc
        JOIN contact_stats cs ON cs.contact_id = wc.pessoa_principal_id
        CROSS JOIN LATERAL jsonb_array_elements(cs.top_destinations) AS d(elem)
        WHERE cs.top_destinations IS NOT NULL AND jsonb_typeof(cs.top_destinations) = 'array'
    )
    SELECT de.dest_name, COUNT(DISTINCT de.card_id), COALESCE(SUM(de.receita), 0)
    FROM dest_expanded de
    WHERE de.dest_name IS NOT NULL AND de.dest_name != ''
    GROUP BY de.dest_name ORDER BY receita_total DESC LIMIT p_limit;
END;
$$;

-- ── 9. analytics_revenue_by_product (DATE params) ──────────
DROP FUNCTION IF EXISTS analytics_revenue_by_product(DATE, DATE, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_revenue_by_product(DATE, DATE, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_revenue_by_product(
    p_date_start DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_mode TEXT DEFAULT 'entries', p_product TEXT DEFAULT NULL,
    p_stage_id UUID DEFAULT NULL, p_owner_id UUID DEFAULT NULL
)
RETURNS TABLE(produto TEXT, count_won BIGINT, valor_total NUMERIC, receita_total NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.produto::TEXT, COUNT(*), COALESCE(SUM(c.valor_final), 0), COALESCE(SUM(c.receita), 0)
    FROM cards c
    WHERE c.status_comercial = 'ganho' AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                  p_stage_id, COALESCE(p_date_start, '2020-01-01'::DATE)::TIMESTAMPTZ,
                  COALESCE(p_date_end + 1, '2099-01-01'::DATE)::TIMESTAMPTZ, p_product))
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true
              AND (p_date_start IS NULL OR c.ganho_sdr_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_sdr_at < (p_date_end + 1)::TIMESTAMPTZ)
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true
              AND (p_date_start IS NULL OR c.ganho_planner_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_planner_at < (p_date_end + 1)::TIMESTAMPTZ)
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true
              AND (p_date_start IS NULL OR c.ganho_pos_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.ganho_pos_at < (p_date_end + 1)::TIMESTAMPTZ)
          ELSE
              (p_date_start IS NULL OR c.created_at >= p_date_start::TIMESTAMPTZ)
              AND (p_date_end IS NULL OR c.created_at < (p_date_end + 1)::TIMESTAMPTZ)
      END
    GROUP BY c.produto ORDER BY receita_total DESC;
END;
$$;

-- ── 10. analytics_operations_summary (DATE params) ─────────
DROP FUNCTION IF EXISTS analytics_operations_summary(DATE, DATE, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_operations_summary(DATE, DATE, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_operations_summary(
    p_date_start DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_product TEXT DEFAULT NULL, p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL, p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
BEGIN
    WITH won_cards AS (
        SELECT c.*
        FROM cards c
        WHERE c.status_comercial = 'ganho' AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                      p_stage_id, v_start::TIMESTAMPTZ, (v_end + 1)::TIMESTAMPTZ, p_product))
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
        SELECT COUNT(*) AS viagens_realizadas,
            COALESCE(SUM(c.valor_final), 0) AS valor_total,
            COALESCE(AVG(c.valor_final), 0) AS ticket_medio
        FROM won_cards c
    ),
    sub_cards AS (
        SELECT sc.parent_card_id, sc.id, sc.created_at
        FROM cards sc
        WHERE sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
          AND sc.parent_card_id IN (SELECT id FROM won_cards)
    ),
    sub_stats AS (
        SELECT COUNT(*) AS total_sub_cards,
            COUNT(DISTINCT parent_card_id) AS cards_with_changes,
            ROUND(CASE WHEN (SELECT COUNT(*) FROM won_cards) > 0
                 THEN COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM won_cards) ELSE 0 END, 2) AS changes_per_trip
        FROM sub_cards
    ),
    per_planner AS (
        SELECT p.nome AS planner_nome, COUNT(DISTINCT wc.id) AS viagens,
            COUNT(sc.id) AS mudancas,
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

-- ── 11. analytics_sla_violations ───────────────────────────
DROP FUNCTION IF EXISTS analytics_sla_violations(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INT, UUID);
DROP FUNCTION IF EXISTS analytics_sla_violations(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_sla_violations(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01', p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL, p_mode TEXT DEFAULT 'entries',
    p_limit INT DEFAULT 50, p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL
)
RETURNS TABLE(card_id UUID, titulo TEXT, stage_nome TEXT, owner_nome TEXT,
    dias_na_etapa NUMERIC, sla_hours INT, sla_exceeded_hours NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.titulo, s.nome, p.nome,
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400, 1),
        COALESCE(s.sla_hours, 0)::INT,
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 - COALESCE(s.sla_hours, 0), 1)
    FROM cards c
    INNER JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN profiles p ON p.id = c.dono_atual_id
    WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial NOT IN ('ganho', 'perdido')
      AND s.sla_hours IS NOT NULL AND s.sla_hours > 0
      AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 > s.sla_hours
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
    ORDER BY sla_exceeded_hours DESC LIMIT p_limit;
END;
$$;

-- ── 12. analytics_sla_summary ──────────────────────────────
DROP FUNCTION IF EXISTS analytics_sla_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_sla_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS analytics_sla_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_sla_summary(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01', p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL, p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL, p_owner_id UUID DEFAULT NULL
)
RETURNS TABLE(stage_nome TEXT, sla_hours INT, total_cards BIGINT, compliant_cards BIGINT,
    violating_cards BIGINT, compliance_rate NUMERIC, avg_hours_in_stage NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT s.nome, COALESCE(s.sla_hours, 0)::INT,
        COUNT(c.id)::BIGINT,
        COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 <= s.sla_hours)::BIGINT,
        COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 > s.sla_hours)::BIGINT,
        CASE WHEN COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0) > 0
            THEN ROUND(
                COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0
                    AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 <= s.sla_hours)::NUMERIC
                / COUNT(c.id) FILTER (WHERE s.sla_hours IS NOT NULL AND s.sla_hours > 0)::NUMERIC * 100, 1)
            ELSE NULL END,
        COALESCE(ROUND(AVG(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600
        ), 1), 0)::NUMERIC
    FROM pipeline_stages s
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND c.status_comercial NOT IN ('ganho', 'perdido')
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
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
    WHERE s.ativo = true
    GROUP BY s.id, s.nome, s.sla_hours, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

-- ── 13. analytics_whatsapp_metrics (DATE params) ───────────
DROP FUNCTION IF EXISTS analytics_whatsapp_metrics(DATE, DATE, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS analytics_whatsapp_metrics(DATE, DATE, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_whatsapp_metrics(
    p_date_start DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_product TEXT DEFAULT NULL, p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL, p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    v_start TIMESTAMPTZ := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   TIMESTAMPTZ := COALESCE(p_date_end, CURRENT_DATE) + INTERVAL '1 day';
BEGIN
    WITH msg_base AS (
        SELECT m.id, m.card_id, m.lado, m.data_hora, m.remetente_interno_id
        FROM mensagens m
        WHERE m.canal = 'whatsapp'
          AND m.data_hora >= v_start AND m.data_hora < v_end
          AND (p_product IS NULL OR EXISTS (
              SELECT 1 FROM cards c WHERE c.id = m.card_id AND c.produto::TEXT = p_product AND c.deleted_at IS NULL
          ))
          AND (p_owner_id IS NULL OR EXISTS (
              SELECT 1 FROM cards c WHERE c.id = m.card_id AND c.dono_atual_id = p_owner_id AND c.deleted_at IS NULL
          ))
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  m.card_id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, v_start, v_end, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  m.card_id IN (SELECT id FROM cards WHERE ganho_sdr = true AND ganho_sdr_at >= v_start AND ganho_sdr_at < v_end AND deleted_at IS NULL)
              WHEN p_mode = 'ganho_planner' THEN
                  m.card_id IN (SELECT id FROM cards WHERE ganho_planner = true AND ganho_planner_at >= v_start AND ganho_planner_at < v_end AND deleted_at IS NULL)
              WHEN p_mode = 'ganho_total' THEN
                  m.card_id IN (SELECT id FROM cards WHERE ganho_pos = true AND ganho_pos_at >= v_start AND ganho_pos_at < v_end AND deleted_at IS NULL)
              ELSE TRUE
          END
    ),
    volume AS (
        SELECT COUNT(*) AS total_msgs,
            COUNT(*) FILTER (WHERE lado = 'cliente') AS inbound,
            COUNT(*) FILTER (WHERE lado = 'consultor') AS outbound,
            COUNT(DISTINCT card_id) AS active_conversations
        FROM msg_base
    ),
    daily AS (
        SELECT data_hora::date AS dia,
            COUNT(*) FILTER (WHERE lado = 'cliente') AS inbound,
            COUNT(*) FILTER (WHERE lado = 'consultor') AS outbound
        FROM msg_base WHERE data_hora IS NOT NULL
        GROUP BY data_hora::date ORDER BY dia
    ),
    last_inbound AS (
        SELECT DISTINCT ON (card_id) card_id, data_hora AS last_inbound_at
        FROM msg_base WHERE lado = 'cliente'
        ORDER BY card_id, data_hora DESC
    ),
    unanswered AS (
        SELECT li.card_id, li.last_inbound_at,
            EXTRACT(EPOCH FROM (NOW() - li.last_inbound_at)) / 3600.0 AS hours_waiting
        FROM last_inbound li
        WHERE NOT EXISTS (
            SELECT 1 FROM msg_base m2
            WHERE m2.card_id = li.card_id AND m2.lado = 'consultor' AND m2.data_hora > li.last_inbound_at
        )
    ),
    aging AS (
        SELECT COUNT(*) FILTER (WHERE hours_waiting < 1) AS lt_1h,
            COUNT(*) FILTER (WHERE hours_waiting >= 1 AND hours_waiting < 4) AS h1_4,
            COUNT(*) FILTER (WHERE hours_waiting >= 4 AND hours_waiting < 24) AS h4_24,
            COUNT(*) FILTER (WHERE hours_waiting >= 24) AS gt_24h,
            COUNT(*) AS total_unanswered
        FROM unanswered
    ),
    response_times AS (
        SELECT m_in.card_id, m_in.data_hora AS inbound_at, MIN(m_out.data_hora) AS first_reply_at
        FROM msg_base m_in
        JOIN msg_base m_out ON m_out.card_id = m_in.card_id AND m_out.lado = 'consultor' AND m_out.data_hora > m_in.data_hora
        WHERE m_in.lado = 'cliente'
        GROUP BY m_in.card_id, m_in.data_hora
    ),
    rt_stats AS (
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_reply_at - inbound_at)) / 60.0)::NUMERIC, 1) AS avg_response_minutes,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_reply_at - inbound_at)) / 60.0)::NUMERIC, 1) AS median_response_minutes
        FROM response_times WHERE first_reply_at IS NOT NULL
    ),
    per_user AS (
        SELECT p.nome AS user_nome,
            ROUND(AVG(EXTRACT(EPOCH FROM (rt.first_reply_at - rt.inbound_at)) / 60.0)::NUMERIC, 1) AS avg_minutes,
            COUNT(*) AS total_replies
        FROM response_times rt
        JOIN msg_base m ON m.card_id = rt.card_id AND m.data_hora = rt.first_reply_at
        JOIN profiles p ON p.id = m.remetente_interno_id
        WHERE rt.first_reply_at IS NOT NULL
        GROUP BY p.nome ORDER BY avg_minutes
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

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION analytics_funnel_live TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_overview_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_revenue_timeseries TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_team_performance TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_loss_reasons TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_financial_breakdown TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_destinations TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_revenue_by_product TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_operations_summary TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_violations TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_summary TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_whatsapp_metrics TO authenticated;
