-- ============================================================
-- Analytics Tag Filter — p_tag_ids UUID[] em 5 RPCs prioritárias
--
-- Adiciona p_tag_ids UUID[] DEFAULT NULL às 5 RPCs de analytics
-- que cobrem ~90% dos casos de uso (Phase 1).
-- Quando p_tag_ids é fornecido e não-vazio, filtra apenas cards
-- que possuem pelo menos uma das tags indicadas.
--
-- Helper: _a_tag_ok(card_id UUID, tag_ids UUID[])
-- Depende de: card_tag_assignments (20260303_card_tags_system.sql)
-- ============================================================

-- ── Helper ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _a_tag_ok(
    card_id UUID, tag_ids UUID[]
) RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
SELECT
    tag_ids IS NULL
    OR array_length(tag_ids, 1) IS NULL
    OR EXISTS (
        SELECT 1
        FROM card_tag_assignments cta
        WHERE cta.card_id = $1
          AND cta.tag_id = ANY($2)
    );
$$;

-- ── Drop overloads das 5 RPCs que vamos recriar ──────────────
DO $$
DECLARE
    fn_names TEXT[] := ARRAY[
        'analytics_funnel_live',
        'analytics_funnel_conversion',
        'analytics_overview_kpis',
        'analytics_team_performance',
        'analytics_financial_breakdown'
    ];
    fn TEXT;
    r RECORD;
BEGIN
    FOREACH fn IN ARRAY fn_names LOOP
        FOR r IN
            SELECT oid::regprocedure::text AS sig
            FROM pg_proc
            WHERE proname = fn
              AND pronamespace = 'public'::regnamespace
        LOOP
            EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
        END LOOP;
    END LOOP;
END $$;

-- ── 1. analytics_funnel_live ─────────────────────────────────

CREATE OR REPLACE FUNCTION analytics_funnel_live(
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
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;

    ELSE
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
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
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;
    END IF;
END;
$$;

-- ── 2. analytics_funnel_conversion ───────────────────────────

CREATE OR REPLACE FUNCTION analytics_funnel_conversion(
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
    avg_days_in_stage  NUMERIC,
    p75_days_in_stage  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
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
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
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
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
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

-- ── 3. analytics_overview_kpis ───────────────────────────────

CREATE OR REPLACE FUNCTION analytics_overview_kpis(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    v_taxa_paga_id UUID;
    v_briefing_id UUID;
    v_proposta_id UUID;
    v_viagem_id UUID;
BEGIN
    SELECT s.id INTO v_taxa_paga_id FROM pipeline_stages s WHERE s.ativo = true AND s.milestone_key = 'taxa_paga' LIMIT 1;
    SELECT s.id INTO v_briefing_id FROM pipeline_stages s WHERE s.ativo = true AND s.milestone_key = 'briefing' LIMIT 1;
    SELECT s.id INTO v_proposta_id FROM pipeline_stages s WHERE s.ativo = true AND s.milestone_key = 'proposta' LIMIT 1;
    SELECT s.id INTO v_viagem_id FROM pipeline_stages s WHERE s.ativo = true AND s.milestone_key = 'viagem_confirmada' LIMIT 1;

    WITH leads_pool AS (
        SELECT c.id, c.pipeline_stage_id, c.status_comercial,
               c.valor_final, c.receita, c.data_fechamento, c.created_at
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
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
    outcomes_pool AS (
        SELECT c.id, c.status_comercial, c.valor_final, c.receita,
               c.data_fechamento, c.created_at
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial IN ('ganho', 'perdido')
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
    milestone_proof AS (
        SELECT DISTINCT a.card_id, (a.metadata->>'new_stage_id')::UUID AS proved_stage_id
        FROM activities a
        WHERE a.tipo = 'stage_changed'
          AND a.card_id IN (SELECT lp.id FROM leads_pool lp)
          AND (a.metadata->>'new_stage_id')::UUID IN (v_taxa_paga_id, v_briefing_id, v_proposta_id, v_viagem_id)
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
        'viagens_vendidas', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'taxa_paga_count', CASE WHEN v_taxa_paga_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_taxa_paga_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_taxa_paga_id)
        ) ELSE 0 END,
        'taxa_paga_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_taxa_paga_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_taxa_paga_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_taxa_paga_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'briefing_count', CASE WHEN v_briefing_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_briefing_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_briefing_id)
        ) ELSE 0 END,
        'briefing_agendado_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_briefing_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_briefing_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_briefing_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'proposta_count', CASE WHEN v_proposta_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_proposta_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_proposta_id)
        ) ELSE 0 END,
        'proposta_enviada_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_proposta_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_proposta_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_proposta_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'viagem_confirmada_count', CASE WHEN v_viagem_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_viagem_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_viagem_id)
        ) ELSE 0 END,
        'viagem_confirmada_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_viagem_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_viagem_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_viagem_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END
    ) INTO result;

    RETURN result;
END;
$$;

-- ── 4. analytics_team_performance ────────────────────────────

CREATE OR REPLACE FUNCTION analytics_team_performance(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_phase      TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
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
    WHERE (p_phase IS NULL OR p_phase = 'Pos-Venda')
    GROUP BY p.id, p.nome

    ORDER BY total_cards DESC;
END;
$$;

-- ── 5. analytics_financial_breakdown ─────────────────────────

CREATE OR REPLACE FUNCTION analytics_financial_breakdown(
    p_date_start  DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_granularity TEXT DEFAULT 'month', p_product TEXT DEFAULT NULL,
    p_mode        TEXT DEFAULT 'entries', p_stage_id UUID DEFAULT NULL,
    p_owner_id    UUID DEFAULT NULL, p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids     UUID[] DEFAULT NULL
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
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
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
