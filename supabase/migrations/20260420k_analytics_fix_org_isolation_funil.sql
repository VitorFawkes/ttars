-- Fix crítico: analytics_funnel_live, analytics_funnel_conversion,
-- analytics_funnel_by_owner e analytics_sla_summary estavam vazando stages
-- de OUTRAS orgs (qualquer org com o mesmo produto). Causa:
--   - JOIN pipelines pip ON pip.id = s.pipeline_id  (sem filtro de org)
--   - Nos CTEs com FROM cards c, também faltava c.org_id = v_org
-- Resultado visual: Funil mostrava "Novo Lead" 4×, "Qualificação" 3× etc.
-- (50 stages em vez de 18, porque havia 5 orgs com produto TRIPS).
--
-- Patch: declara v_org := requesting_org_id() em cada função e adiciona
-- AND pip.org_id = v_org no JOIN + AND c.org_id = v_org nos CTEs de cards.

-- ═══ 1. analytics_funnel_live ═══════════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_funnel_live(
    p_date_start timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end timestamptz DEFAULT now(),
    p_product text DEFAULT NULL,
    p_mode text DEFAULT 'entries',
    p_stage_id uuid DEFAULT NULL,
    p_owner_id uuid DEFAULT NULL,
    p_owner_ids uuid[] DEFAULT NULL,
    p_tag_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(stage_id uuid, stage_nome text, fase text, ordem integer,
              total_cards bigint, valor_total numeric, receita_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
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
              AND c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
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
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;

    ELSE
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
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
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_funnel_live TO authenticated;

-- ═══ 2. analytics_funnel_conversion ═════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_funnel_conversion(
    p_date_start timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end timestamptz DEFAULT now(),
    p_product text DEFAULT NULL,
    p_mode text DEFAULT 'entries',
    p_stage_id uuid DEFAULT NULL,
    p_owner_id uuid DEFAULT NULL,
    p_owner_ids uuid[] DEFAULT NULL,
    p_tag_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(stage_id uuid, stage_nome text, phase_slug text, ordem integer,
              current_count bigint, total_valor numeric, receita_total numeric,
              avg_days_in_stage numeric, p75_days_in_stage numeric)
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
    JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
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

GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;

-- ═══ 3. analytics_funnel_by_owner ═══════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_funnel_by_owner(
    p_date_start timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end timestamptz DEFAULT now(),
    p_product text DEFAULT NULL,
    p_mode text DEFAULT 'entries',
    p_stage_id uuid DEFAULT NULL,
    p_owner_id uuid DEFAULT NULL,
    p_owner_ids uuid[] DEFAULT NULL,
    p_tag_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(stage_id uuid, stage_nome text, fase text, ordem integer,
              owner_id uuid, owner_name text, card_count bigint,
              valor_total numeric, receita_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
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
              AND c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id                                        AS stage_id,
            s.nome                                      AS stage_nome,
            s.fase,
            s.ordem::INT,
            c.dono_atual_id                             AS owner_id,
            COALESCE(p.nome, 'Não atribuído')           AS owner_name,
            COUNT(ae.card_id)::BIGINT                   AS card_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC        AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index, c.dono_atual_id, p.nome
        ORDER BY pp.order_index, s.ordem, p.nome NULLS LAST;

    ELSE
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
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
            s.id                                        AS stage_id,
            s.nome                                      AS stage_nome,
            s.fase,
            s.ordem::INT,
            c.dono_atual_id                             AS owner_id,
            COALESCE(p.nome, 'Não atribuído')           AS owner_name,
            COUNT(ae.card_id)::BIGINT                   AS card_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC        AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index, c.dono_atual_id, p.nome
        ORDER BY pp.order_index, s.ordem, p.nome NULLS LAST;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_funnel_by_owner TO authenticated;

-- ═══ 4. analytics_sla_summary ═══════════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_sla_summary(
    p_date_start timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end timestamptz DEFAULT now(),
    p_product text DEFAULT NULL,
    p_mode text DEFAULT 'entries',
    p_stage_id uuid DEFAULT NULL,
    p_owner_id uuid DEFAULT NULL,
    p_owner_ids uuid[] DEFAULT NULL,
    p_tag_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(stage_nome text, sla_hours integer, total_cards bigint,
              compliant_cards bigint, violating_cards bigint,
              compliance_rate numeric, avg_hours_in_stage numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org UUID := requesting_org_id();
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
    JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.org_id = v_org
        AND c.deleted_at IS NULL AND c.archived_at IS NULL
        AND c.status_comercial NOT IN ('ganho', 'perdido')
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
        AND _a_tag_ok(c.id, p_tag_ids)
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
      AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    GROUP BY s.id, s.nome, s.sla_hours, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_sla_summary TO authenticated;
