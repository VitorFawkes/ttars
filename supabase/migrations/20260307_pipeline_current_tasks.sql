-- ============================================================
-- Pipeline Atual v4: Métricas de tarefas dos cards abertos
-- - Totais + by_type (v4a)
-- - by_stage, by_owner, total_overdue (v4b)
-- ============================================================

DROP FUNCTION IF EXISTS analytics_pipeline_current(TEXT, UUID[], UUID[]);
DROP FUNCTION IF EXISTS analytics_pipeline_current(TEXT, UUID[], UUID[], TEXT, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION analytics_pipeline_current(
    p_product    TEXT     DEFAULT NULL,
    p_owner_ids  UUID[]   DEFAULT NULL,
    p_tag_ids    UUID[]   DEFAULT NULL,
    p_date_ref   TEXT     DEFAULT 'stage',   -- 'stage' | 'created'
    p_value_min  NUMERIC  DEFAULT NULL,
    p_value_max  NUMERIC  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH open_cards AS (
        SELECT
            c.id,
            c.titulo,
            c.pipeline_stage_id,
            c.dono_atual_id,
            COALESCE(c.valor_final, c.valor_estimado, 0) AS valor,
            COALESCE(c.receita, 0) AS receita_val,
            c.produto,
            c.created_at,
            c.stage_entered_at,
            CASE WHEN p_date_ref = 'created'
                 THEN EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400.0
                 ELSE EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400.0
            END AS days_in_stage,
            s.nome AS stage_nome,
            s.ordem,
            s.sla_hours,
            pp.label AS fase,
            pp.slug AS fase_slug,
            pp.order_index AS fase_order,
            p.nome AS owner_nome,
            co.nome AS pessoa_nome
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.data_fechamento IS NULL
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
          AND s.ativo = true
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (p_value_min IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) >= p_value_min)
          AND (p_value_max IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) <= p_value_max)
    ),
    -- KPIs
    kpis AS (
        SELECT jsonb_build_object(
            'total_open', COUNT(*),
            'total_value', COALESCE(SUM(valor), 0),
            'total_receita', COALESCE(SUM(receita_val), 0),
            'avg_ticket', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(valor), 0) / COUNT(*)::NUMERIC, 0) ELSE 0 END,
            'avg_receita_ticket', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(receita_val), 0) / COUNT(*)::NUMERIC, 0) ELSE 0 END,
            'avg_age_days', ROUND(COALESCE(AVG(days_in_stage), 0)::NUMERIC, 1),
            'sla_breach_count', COUNT(*) FILTER (
                WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours
            ),
            'sla_breach_pct', ROUND(
                CASE WHEN COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0) > 0
                THEN COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours)::NUMERIC
                     / COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0)::NUMERIC * 100
                ELSE 0 END, 1
            )
        ) AS val
        FROM open_cards
    ),
    -- Distribuição por stage
    stages AS (
        SELECT jsonb_agg(row_data ORDER BY fase_order, ordem) AS val
        FROM (
            SELECT
                jsonb_build_object(
                    'stage_id', pipeline_stage_id,
                    'stage_nome', stage_nome,
                    'fase', fase,
                    'fase_slug', fase_slug,
                    'produto', produto,
                    'ordem', ordem,
                    'card_count', COUNT(*),
                    'valor_total', COALESCE(SUM(valor), 0),
                    'receita_total', COALESCE(SUM(receita_val), 0),
                    'avg_days', ROUND(AVG(days_in_stage)::NUMERIC, 1),
                    'sla_breach_count', COUNT(*) FILTER (
                        WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours
                    )
                ) AS row_data,
                MIN(fase_order) AS fase_order,
                MIN(ordem) AS ordem
            FROM open_cards
            GROUP BY pipeline_stage_id, stage_nome, fase, fase_slug, produto, open_cards.ordem
        ) sub
    ),
    -- Aging heatmap
    aging AS (
        SELECT jsonb_agg(row_data ORDER BY fase_order, ordem) AS val
        FROM (
            SELECT
                jsonb_build_object(
                    'stage_id', pipeline_stage_id,
                    'stage_nome', stage_nome,
                    'fase', fase,
                    'fase_slug', fase_slug,
                    'bucket_0_3', COUNT(*) FILTER (WHERE days_in_stage <= 3),
                    'bucket_3_7', COUNT(*) FILTER (WHERE days_in_stage > 3 AND days_in_stage <= 7),
                    'bucket_7_14', COUNT(*) FILTER (WHERE days_in_stage > 7 AND days_in_stage <= 14),
                    'bucket_14_plus', COUNT(*) FILTER (WHERE days_in_stage > 14)
                ) AS row_data,
                MIN(fase_order) AS fase_order,
                MIN(ordem) AS ordem
            FROM open_cards
            GROUP BY pipeline_stage_id, stage_nome, fase, fase_slug
        ) sub
    ),
    -- Carga por consultor
    owners AS (
        SELECT jsonb_agg(row_data ORDER BY total_cards DESC) AS val
        FROM (
            SELECT
                jsonb_build_object(
                    'owner_id', dono_atual_id,
                    'owner_nome', COALESCE(owner_nome, 'Não atribuído'),
                    'total_cards', COUNT(*),
                    'total_value', COALESCE(SUM(valor), 0),
                    'total_receita', COALESCE(SUM(receita_val), 0),
                    'avg_age_days', ROUND(AVG(days_in_stage)::NUMERIC, 1),
                    'sla_breach', COUNT(*) FILTER (
                        WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours
                    ),
                    'by_phase', jsonb_build_object(
                        'sdr', COUNT(*) FILTER (WHERE fase_slug = 'sdr'),
                        'planner', COUNT(*) FILTER (WHERE fase_slug = 'planner'),
                        'pos-venda', COUNT(*) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'resolucao'))
                    ),
                    'by_phase_value', jsonb_build_object(
                        'sdr', COALESCE(SUM(valor) FILTER (WHERE fase_slug = 'sdr'), 0),
                        'planner', COALESCE(SUM(valor) FILTER (WHERE fase_slug = 'planner'), 0),
                        'pos-venda', COALESCE(SUM(valor) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'resolucao')), 0)
                    ),
                    'by_phase_receita', jsonb_build_object(
                        'sdr', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug = 'sdr'), 0),
                        'planner', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug = 'planner'), 0),
                        'pos-venda', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'resolucao')), 0)
                    )
                ) AS row_data,
                COUNT(*) AS total_cards
            FROM open_cards
            GROUP BY dono_atual_id, owner_nome
        ) sub
    ),
    -- Top deals em risco
    top_deals AS (
        SELECT jsonb_agg(row_data ORDER BY dis DESC) AS val
        FROM (
            SELECT
                jsonb_build_object(
                    'card_id', id,
                    'titulo', titulo,
                    'stage_nome', stage_nome,
                    'fase', fase,
                    'fase_slug', fase_slug,
                    'owner_nome', COALESCE(owner_nome, 'Não atribuído'),
                    'owner_id', dono_atual_id,
                    'valor_total', valor,
                    'receita', receita_val,
                    'days_in_stage', ROUND(days_in_stage::NUMERIC, 1),
                    'sla_hours', sla_hours,
                    'is_sla_breach', (sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
                    'pessoa_nome', pessoa_nome
                ) AS row_data,
                days_in_stage AS dis
            FROM open_cards
            ORDER BY days_in_stage DESC
            LIMIT 15
        ) sub
    ),
    -- Métricas de tarefas dos cards abertos
    tasks AS (
        SELECT jsonb_build_object(
            'total_created',   COUNT(t.id),
            'total_completed', COUNT(t.id) FILTER (WHERE t.concluida = true),
            'total_pending',   COUNT(t.id) FILTER (WHERE t.concluida = false),
            'total_overdue',   COUNT(t.id) FILTER (WHERE t.concluida = false AND t.data_vencimento < NOW()),
            'completion_rate', ROUND(
                CASE WHEN COUNT(t.id) > 0
                THEN COUNT(t.id) FILTER (WHERE t.concluida = true)::NUMERIC
                     / COUNT(t.id)::NUMERIC * 100
                ELSE 0 END, 1
            ),
            'by_type', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'tipo', sub.tipo,
                    'total', sub.type_total,
                    'completed', sub.type_completed,
                    'pending', sub.type_pending,
                    'overdue', sub.type_overdue
                ) ORDER BY sub.type_total DESC)
                FROM (
                    SELECT
                        t2.tipo,
                        COUNT(*)                                                                           AS type_total,
                        COUNT(*) FILTER (WHERE t2.concluida = true)                                        AS type_completed,
                        COUNT(*) FILTER (WHERE t2.concluida = false)                                       AS type_pending,
                        COUNT(*) FILTER (WHERE t2.concluida = false AND t2.data_vencimento < NOW())         AS type_overdue
                    FROM tarefas t2
                    INNER JOIN open_cards oc2 ON oc2.id = t2.card_id
                    WHERE t2.deleted_at IS NULL
                    GROUP BY t2.tipo
                ) sub
            ), '[]'::jsonb),
            'by_stage', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'stage_id', sub.pipeline_stage_id,
                    'stage_nome', sub.stage_nome,
                    'fase', sub.fase,
                    'fase_slug', sub.fase_slug,
                    'card_count', sub.card_count,
                    'total', sub.stage_total,
                    'completed', sub.stage_completed,
                    'pending', sub.stage_pending,
                    'overdue', sub.stage_overdue
                ) ORDER BY sub.fase_order, sub.ordem)
                FROM (
                    SELECT
                        oc3.pipeline_stage_id,
                        oc3.stage_nome,
                        oc3.fase,
                        oc3.fase_slug,
                        MIN(oc3.fase_order) AS fase_order,
                        MIN(oc3.ordem) AS ordem,
                        COUNT(DISTINCT oc3.id)                                                              AS card_count,
                        COUNT(t3.id)                                                                        AS stage_total,
                        COUNT(t3.id) FILTER (WHERE t3.concluida = true)                                     AS stage_completed,
                        COUNT(t3.id) FILTER (WHERE t3.concluida = false)                                    AS stage_pending,
                        COUNT(t3.id) FILTER (WHERE t3.concluida = false AND t3.data_vencimento < NOW())      AS stage_overdue
                    FROM open_cards oc3
                    LEFT JOIN tarefas t3 ON t3.card_id = oc3.id AND t3.deleted_at IS NULL
                    GROUP BY oc3.pipeline_stage_id, oc3.stage_nome, oc3.fase, oc3.fase_slug
                ) sub
            ), '[]'::jsonb),
            'by_owner', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'owner_id', sub.dono_atual_id,
                    'owner_nome', COALESCE(sub.owner_nome, 'Não atribuído'),
                    'card_count', sub.card_count,
                    'total', sub.owner_total,
                    'completed', sub.owner_completed,
                    'pending', sub.owner_pending,
                    'overdue', sub.owner_overdue
                ) ORDER BY sub.owner_total DESC)
                FROM (
                    SELECT
                        oc4.dono_atual_id,
                        oc4.owner_nome,
                        COUNT(DISTINCT oc4.id)                                                              AS card_count,
                        COUNT(t4.id)                                                                        AS owner_total,
                        COUNT(t4.id) FILTER (WHERE t4.concluida = true)                                     AS owner_completed,
                        COUNT(t4.id) FILTER (WHERE t4.concluida = false)                                    AS owner_pending,
                        COUNT(t4.id) FILTER (WHERE t4.concluida = false AND t4.data_vencimento < NOW())      AS owner_overdue
                    FROM open_cards oc4
                    LEFT JOIN tarefas t4 ON t4.card_id = oc4.id AND t4.deleted_at IS NULL
                    GROUP BY oc4.dono_atual_id, oc4.owner_nome
                ) sub
            ), '[]'::jsonb)
        ) AS val
        FROM tarefas t
        INNER JOIN open_cards oc ON oc.id = t.card_id
        WHERE t.deleted_at IS NULL
    )
    SELECT jsonb_build_object(
        'kpis',      (SELECT val FROM kpis),
        'stages',    COALESCE((SELECT val FROM stages), '[]'::jsonb),
        'aging',     COALESCE((SELECT val FROM aging), '[]'::jsonb),
        'owners',    COALESCE((SELECT val FROM owners), '[]'::jsonb),
        'top_deals', COALESCE((SELECT val FROM top_deals), '[]'::jsonb),
        'tasks',     COALESCE((SELECT val FROM tasks), '{}'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;
