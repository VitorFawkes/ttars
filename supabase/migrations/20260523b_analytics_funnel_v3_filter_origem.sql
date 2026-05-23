-- Adiciona p_origens nas RPCs analytics_funnel_conversion_v3 e analytics_funnel_velocity_v3.
-- Necessário porque FunnelView usa as versões _v3 (em useFunnelData.ts), não as legacy
-- modificadas em 20260523a.
--
-- AUDITORIA (memory/feedback_function_rebase_cuidado.md):
-- analytics_funnel_conversion_v3 → versão MAIS RECENTE em 20260422b (fix cohort created)
--   preserva: 20260422a (criação original)
-- analytics_funnel_velocity_v3 → versão única em 20260422a (sem patches posteriores)
--
-- Adiciona: p_origens text[] DEFAULT NULL + filtro no CTE population/transicoes/atuais.

-- ═══ 0. Drop overloads antigos ═══
DO $cleanup$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT n.nspname AS schema, p.proname AS name,
               pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('analytics_funnel_conversion_v3','analytics_funnel_velocity_v3')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.schema) || '.' || quote_ident(r.name) || '(' || r.args || ') CASCADE';
    END LOOP;
END $cleanup$;

-- ═══ 1. analytics_funnel_conversion_v3 ═════════════════════

CREATE OR REPLACE FUNCTION public.analytics_funnel_conversion_v3(
    p_date_start  timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end    timestamptz DEFAULT now(),
    p_product     text   DEFAULT NULL,
    p_date_ref    text   DEFAULT 'stage',
    p_status      text[] DEFAULT NULL,
    p_ganho_fase  text   DEFAULT NULL,
    p_stage_id    uuid   DEFAULT NULL,
    p_owner_id    uuid   DEFAULT NULL,
    p_owner_ids   uuid[] DEFAULT NULL,
    p_tag_ids     uuid[] DEFAULT NULL,
    p_origens     text[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id           uuid,
    stage_nome         text,
    phase_slug         text,
    ordem              integer,
    current_count      bigint,
    period_count       bigint,
    period_valor       numeric,
    period_receita     numeric,
    p50_days_in_stage  numeric,
    p75_days_in_stage  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_has_status boolean := p_status IS NOT NULL AND array_length(p_status, 1) > 0;
    v_has_origens boolean := p_origens IS NOT NULL AND array_length(p_origens, 1) > 0;
BEGIN
    RETURN QUERY
    WITH
    population AS (
        SELECT
            c.id,
            c.pipeline_stage_id,
            c.created_at,
            c.valor_final,
            c.valor_estimado,
            c.receita,
            c.status_comercial
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (NOT v_has_status OR c.status_comercial::TEXT = ANY(p_status))
          AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
          AND (
              p_ganho_fase IS NULL
              OR (p_ganho_fase = 'sdr'     AND c.ganho_sdr = true
                  AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end)
              OR (p_ganho_fase = 'planner' AND c.ganho_planner = true
                  AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end)
              OR (p_ganho_fase = 'pos'     AND c.ganho_pos = true
                  AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end)
          )
    ),
    cohort_created AS (
        SELECT pop.id, pop.pipeline_stage_id, pop.created_at
        FROM population pop
        WHERE p_date_ref = 'created'
          AND pop.created_at >= p_date_start AND pop.created_at < p_date_end
    ),
    period_entries_stage AS (
        SELECT (a.metadata->>'new_stage_id')::UUID AS entered_stage_id, a.card_id
        FROM activities a
        WHERE p_date_ref = 'stage'
          AND a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND a.card_id IN (SELECT id FROM population)
        UNION
        SELECT
            COALESCE(
                (SELECT (a2.metadata->>'old_stage_id')::UUID
                 FROM activities a2
                 WHERE a2.card_id = pop.id AND a2.tipo = 'stage_changed'
                 ORDER BY a2.created_at ASC LIMIT 1),
                pop.pipeline_stage_id
            ) AS entered_stage_id,
            pop.id AS card_id
        FROM population pop
        WHERE p_date_ref = 'stage'
          AND pop.created_at >= p_date_start AND pop.created_at < p_date_end
    ),
    period_entries_created AS (
        SELECT
            COALESCE(
                (SELECT (a2.metadata->>'old_stage_id')::UUID
                 FROM activities a2
                 WHERE a2.card_id = co.id AND a2.tipo = 'stage_changed'
                 ORDER BY a2.created_at ASC LIMIT 1),
                co.pipeline_stage_id
            ) AS entered_stage_id,
            co.id AS card_id
        FROM cohort_created co
        WHERE p_date_ref = 'created'
        UNION
        SELECT (a.metadata->>'new_stage_id')::UUID AS entered_stage_id, a.card_id
        FROM activities a
        WHERE p_date_ref = 'created'
          AND a.tipo = 'stage_changed'
          AND a.card_id IN (SELECT id FROM cohort_created)
    ),
    period_entries AS (
        SELECT entered_stage_id, card_id FROM period_entries_stage
        UNION
        SELECT entered_stage_id, card_id FROM period_entries_created
    ),
    root_passes AS (
        SELECT DISTINCT card_id FROM (
            SELECT a.card_id
            FROM activities a
            WHERE a.tipo = 'stage_changed'
              AND (a.metadata->>'new_stage_id')::UUID = p_stage_id
              AND a.card_id IN (SELECT id FROM population)
            UNION
            SELECT pop.id AS card_id
            FROM population pop
            WHERE (
                SELECT (a2.metadata->>'old_stage_id')::UUID
                FROM activities a2
                WHERE a2.card_id = pop.id AND a2.tipo = 'stage_changed'
                ORDER BY a2.created_at ASC LIMIT 1
            ) = p_stage_id
               OR pop.pipeline_stage_id = p_stage_id
        ) _passes
    ),
    period_entries_filtered AS (
        SELECT pe.entered_stage_id, pe.card_id
        FROM period_entries pe
        WHERE p_stage_id IS NULL
           OR pe.card_id IN (SELECT card_id FROM root_passes)
    ),
    stage_cards_unique AS (
        SELECT DISTINCT entered_stage_id, card_id
        FROM period_entries_filtered
    ),
    stage_totals AS (
        SELECT
            sc.entered_stage_id,
            COUNT(*)::BIGINT AS period_count,
            COALESCE(SUM(COALESCE(pop.valor_final, pop.valor_estimado, 0)), 0)::NUMERIC AS period_valor,
            COALESCE(SUM(pop.receita), 0)::NUMERIC AS period_receita
        FROM stage_cards_unique sc
        JOIN population pop ON pop.id = sc.card_id
        GROUP BY sc.entered_stage_id
    ),
    stage_durations AS (
        SELECT
            (a.metadata->>'old_stage_id')::UUID AS exited_stage_id,
            LEAST(
                EXTRACT(EPOCH FROM (
                    a.created_at - GREATEST(
                        CASE WHEN p_date_ref = 'stage' THEN p_date_start
                             ELSE '2000-01-01'::timestamptz END,
                        COALESCE(
                            (SELECT prev.created_at FROM activities prev
                             WHERE prev.card_id = a.card_id
                               AND prev.tipo = 'stage_changed'
                               AND prev.created_at < a.created_at
                             ORDER BY prev.created_at DESC LIMIT 1),
                            (SELECT c.created_at FROM cards c WHERE c.id = a.card_id)
                        )
                    )
                )) / 86400.0,
                365
            ) AS dias
        FROM activities a
        WHERE a.tipo = 'stage_changed'
          AND a.card_id IN (
              SELECT id FROM cohort_created WHERE p_date_ref = 'created'
              UNION ALL
              SELECT id FROM population WHERE p_date_ref = 'stage'
          )
          AND CASE WHEN p_date_ref = 'stage'
                   THEN a.created_at >= p_date_start AND a.created_at < p_date_end
                   ELSE TRUE END
          AND (p_stage_id IS NULL OR a.card_id IN (SELECT card_id FROM root_passes))
    ),
    stage_percentiles AS (
        SELECT
            exited_stage_id,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias)::NUMERIC  AS p50_days,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY dias)::NUMERIC AS p75_days
        FROM stage_durations
        GROUP BY exited_stage_id
    ),
    live_snapshot AS (
        SELECT
            c.pipeline_stage_id AS live_stage_id,
            COUNT(*)::BIGINT    AS current_count
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.status_comercial = 'aberto'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
        GROUP BY c.pipeline_stage_id
    )
    SELECT
        s.id          AS stage_id,
        s.nome        AS stage_nome,
        pp.slug       AS phase_slug,
        s.ordem::INT  AS ordem,
        COALESCE(ls.current_count, 0)::BIGINT         AS current_count,
        COALESCE(st.period_count, 0)::BIGINT          AS period_count,
        COALESCE(st.period_valor, 0)::NUMERIC         AS period_valor,
        COALESCE(st.period_receita, 0)::NUMERIC       AS period_receita,
        COALESCE(sp.p50_days, 0)::NUMERIC             AS p50_days_in_stage,
        COALESCE(sp.p75_days, 0)::NUMERIC             AS p75_days_in_stage
    FROM pipeline_stages s
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
    LEFT JOIN stage_totals st      ON st.entered_stage_id = s.id
    LEFT JOIN stage_percentiles sp ON sp.exited_stage_id = s.id
    LEFT JOIN live_snapshot ls     ON ls.live_stage_id = s.id
    WHERE s.ativo = true
      AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    ORDER BY pp.order_index, s.ordem;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_funnel_conversion_v3 TO authenticated;

-- ═══ 2. analytics_funnel_velocity_v3 ═══════════════════════

CREATE FUNCTION public.analytics_funnel_velocity_v3(
    p_date_start timestamptz DEFAULT (now() - interval '90 days'),
    p_date_end   timestamptz DEFAULT now(),
    p_product    text   DEFAULT NULL,
    p_owner_ids  uuid[] DEFAULT NULL,
    p_tag_ids    uuid[] DEFAULT NULL,
    p_origens    text[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id        uuid,
    stage_nome      text,
    phase_slug      text,
    ordem           integer,
    cards_passaram  bigint,
    cards_atuais    bigint,
    mediana_dias    numeric,
    p90_dias        numeric,
    media_dias      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_has_origens boolean := p_origens IS NOT NULL AND array_length(p_origens, 1) > 0;
BEGIN
    RETURN QUERY
    WITH stages AS (
        SELECT s.id, s.nome, s.ordem, pp.slug AS phase_slug, pp.order_index AS phase_order
        FROM pipeline_stages s
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    ),
    transicoes AS (
        SELECT
            (a.metadata->>'old_stage_id')::UUID AS stage_id,
            a.card_id,
            LEAST(
                EXTRACT(EPOCH FROM (
                    a.created_at - GREATEST(
                        p_date_start,
                        COALESCE(
                            (SELECT prev.created_at FROM activities prev
                             WHERE prev.card_id = a.card_id
                               AND prev.tipo = 'stage_changed'
                               AND prev.created_at < a.created_at
                             ORDER BY prev.created_at DESC LIMIT 1),
                            (SELECT c.created_at FROM cards c WHERE c.id = a.card_id)
                        )
                    )
                )) / 86400.0,
                365
            ) AS dias_na_etapa
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start
          AND a.created_at < p_date_end
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
    ),
    atuais AS (
        SELECT
            c.pipeline_stage_id AS stage_id,
            c.id AS card_id,
            LEAST(EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0, 365) AS dias_na_etapa
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.stage_entered_at IS NOT NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
    ),
    metricas AS (
        SELECT
            s.id AS stage_id,
            s.nome AS stage_nome,
            s.phase_slug,
            s.ordem::INT AS ordem,
            s.phase_order,
            (SELECT COUNT(*) FROM transicoes t WHERE t.stage_id = s.id)::BIGINT AS cards_passaram,
            (SELECT COUNT(*) FROM atuais a WHERE a.stage_id = s.id)::BIGINT AS cards_atuais,
            COALESCE(
                (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS mediana_dias,
            COALESCE(
                (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS p90_dias,
            COALESCE(
                (SELECT AVG(dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS media_dias
        FROM stages s
    )
    SELECT m.stage_id, m.stage_nome, m.phase_slug, m.ordem,
           m.cards_passaram, m.cards_atuais,
           ROUND(m.mediana_dias, 1), ROUND(m.p90_dias, 1), ROUND(m.media_dias, 1)
    FROM metricas m
    ORDER BY m.phase_order NULLS LAST, m.ordem;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_funnel_velocity_v3 TO authenticated;
