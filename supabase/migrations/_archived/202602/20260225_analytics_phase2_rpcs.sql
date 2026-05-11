-- ============================================================
-- Analytics Phase 2: Team Performance + Funnel + SLA + Loss Reasons
-- ============================================================

-- RPC 3: analytics_team_performance
-- Retorna métricas por consultor, filtrado por fase
CREATE OR REPLACE FUNCTION analytics_team_performance(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_phase TEXT DEFAULT NULL -- 'SDR', 'Vendas', 'Pos-Venda' ou NULL para todos
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
        AND c.created_at >= p_date_start
        AND c.created_at < p_date_end
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
        AND c.created_at >= p_date_start
        AND c.created_at < p_date_end
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
        AND c.created_at >= p_date_start
        AND c.created_at < p_date_end
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
    WHERE (p_phase IS NULL OR p_phase = 'Pos-Venda')
    GROUP BY p.id, p.nome

    ORDER BY total_cards DESC;
END;
$$;

-- RPC 4: analytics_funnel_conversion
-- Retorna funil completo com contagens e taxas de conversão
CREATE OR REPLACE FUNCTION analytics_funnel_conversion(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL
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
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND c.created_at >= p_date_start
        AND c.created_at < p_date_end
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
    WHERE s.ativo = true
    GROUP BY s.id, s.nome, s.fase, s.ordem
    ORDER BY s.ordem;
END;
$$;

-- RPC 5: analytics_sla_violations
-- Retorna cards que estão violando SLA
CREATE OR REPLACE FUNCTION analytics_sla_violations(
    p_product TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50
)
RETURNS TABLE(
    card_id UUID,
    titulo TEXT,
    stage_nome TEXT,
    owner_nome TEXT,
    dias_na_etapa NUMERIC,
    sla_hours INT,
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
    ORDER BY sla_exceeded_hours DESC
    LIMIT p_limit;
END;
$$;

-- RPC 6: analytics_sla_summary
-- Retorna resumo de compliance por etapa
CREATE OR REPLACE FUNCTION analytics_sla_summary(
    p_product TEXT DEFAULT NULL
)
RETURNS TABLE(
    stage_nome TEXT,
    sla_hours INT,
    total_cards BIGINT,
    compliant_cards BIGINT,
    violating_cards BIGINT,
    compliance_rate NUMERIC,
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
    WHERE s.ativo = true
    GROUP BY s.id, s.nome, s.sla_hours, s.ordem
    ORDER BY s.ordem;
END;
$$;

-- RPC 7: analytics_loss_reasons
-- Retorna motivos de perda agregados
CREATE OR REPLACE FUNCTION analytics_loss_reasons(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL
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
      AND c.created_at >= p_date_start
      AND c.created_at < p_date_end
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
      AND c.created_at >= p_date_start
      AND c.created_at < p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
    GROUP BY mp.nome
    ORDER BY count DESC;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION analytics_team_performance TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_violations TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_sla_summary TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_loss_reasons TO authenticated;
