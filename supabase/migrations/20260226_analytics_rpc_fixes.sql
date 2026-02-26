-- =====================================================
-- FIX: analytics_team_performance + analytics_sla_violations
-- Errors:
--   1) team_performance: "invalid UNION/INTERSECT/EXCEPT ORDER BY clause"
--      → ORDER BY after UNION ALL needs column position, not alias
--   2) sla_violations: "column reference card_id is ambiguous"
--      → RETURNS TABLE column name conflicts with subquery column
-- =====================================================

-- ── 1. FIX analytics_team_performance ──────────────────
-- Problem: ORDER BY total_cards DESC after UNION ALL — PostgreSQL requires
-- column position reference (not alias) after UNION ALL
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
    SELECT * FROM (
        -- SDR metrics
        SELECT
            p.id AS user_id, p.nome AS user_nome, 'SDR'::TEXT AS phase,
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
            AND c.deleted_at IS NULL AND c.archived_at IS NULL
            AND (p_product IS NULL OR c.produto::TEXT = p_product)
            AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
            AND CASE
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
    ) sub
    ORDER BY sub.total_cards DESC;
END;
$$;

-- ── 2. FIX analytics_sla_violations ────────────────────
-- Problem: RETURNS TABLE defines "card_id" which conflicts with
-- the "card_id" column returned by get_card_ids_by_stage_entry subquery.
-- Fix: rename RETURNS TABLE column to avoid PL/pgSQL variable collision,
-- and also remove dependency on get_card_ids_by_stage_entry (use inline logic).
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
    SELECT
        v.cid,
        v.ctitulo,
        v.snome,
        v.pnome,
        v.dias,
        v.sla,
        v.exceeded
    FROM (
        SELECT
            c.id AS cid,
            c.titulo AS ctitulo,
            s.nome AS snome,
            p.nome AS pnome,
            ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400, 1) AS dias,
            COALESCE(s.sla_hours, 0)::INT AS sla,
            ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 3600 - COALESCE(s.sla_hours, 0), 1) AS exceeded
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
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
              ELSE
                  c.created_at >= p_date_start AND c.created_at < p_date_end
          END
        ORDER BY exceeded DESC
        LIMIT p_limit
    ) v;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION analytics_team_performance TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_violations TO authenticated;
