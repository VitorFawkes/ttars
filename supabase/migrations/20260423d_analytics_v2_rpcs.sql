-- Analytics v2 — Fase 1 (RPCs _v2)
-- Plano: Blocos 1 (filtros universais) e 2 (attribution fix).
--
-- Cria 5 RPCs _v2 paralelas as originais. Originais permanecem intocadas
-- (dashboards legados continuam funcionando). Frontend da Fase 3 passara a
-- chamar as _v2.
--
-- Parametros novos (aplicados a todas as _v2 desta migration):
--   p_origem          TEXT[]   filtro universal origem (array)
--   p_phase_slugs     TEXT[]   filtro universal phase (array de slugs)
--   p_lead_entry_path TEXT     filtro universal lead entry path
--   p_destinos        TEXT[]   filtro universal destinos
--   p_owner_context   TEXT     attribution fix: 'dono'/'sdr'/'vendas'/'pos'
--                              (default 'dono' = comportamento legado)
--
-- Restantes 7 RPCs (_v2) ficam para proxima sessao (funnel_live, funnel_velocity,
-- loss_reasons, top_destinations, team_leaderboard, retention_cohort,
-- retention_kpis, pipeline_current). Ver memory/project_analytics_v2.md.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) analytics_overview_kpis_v2
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_overview_kpis_v2(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01 00:00:00+00'::TIMESTAMPTZ,
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL,
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    -- Analytics v2
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL,
    p_owner_context TEXT DEFAULT 'dono'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    result JSON;
    v_taxa_paga_id UUID;
    v_briefing_id UUID;
    v_proposta_id UUID;
    v_viagem_id UUID;
    v_pipeline_id UUID;
BEGIN
    IF p_product IS NOT NULL THEN
        SELECT p.id INTO v_pipeline_id FROM pipelines p WHERE p.produto::TEXT = p_product LIMIT 1;
    END IF;

    SELECT s.id INTO v_taxa_paga_id FROM pipeline_stages s
     WHERE s.ativo = true AND s.milestone_key = 'taxa_paga'
       AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    SELECT s.id INTO v_briefing_id FROM pipeline_stages s
     WHERE s.ativo = true AND s.milestone_key = 'briefing'
       AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    SELECT s.id INTO v_proposta_id FROM pipeline_stages s
     WHERE s.ativo = true AND s.milestone_key = 'proposta'
       AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    SELECT s.id INTO v_viagem_id FROM pipeline_stages s
     WHERE s.ativo = true AND s.milestone_key = 'viagem_confirmada'
       AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;

    WITH leads_pool AS (
        SELECT c.id, c.pipeline_stage_id, c.status_comercial,
               c.valor_final, c.receita, c.data_fechamento, c.created_at
          FROM cards c
         WHERE c.deleted_at IS NULL
           AND c.archived_at IS NULL
           AND (p_product IS NULL OR c.produto::TEXT = p_product)
           AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                      p_owner_context, p_owner_id, p_owner_ids)
           AND public._a_tag_ok(c.id, p_tag_ids)
           AND public._a_origem_ok(c.origem, p_origem)
           AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
           AND public._a_destino_ok(c.produto_data, p_destinos)
           AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
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
        SELECT c.id, c.status_comercial, c.valor_final, c.receita, c.data_fechamento, c.created_at
          FROM cards c
         WHERE c.deleted_at IS NULL
           AND c.archived_at IS NULL
           AND c.status_comercial IN ('ganho', 'perdido')
           AND (p_product IS NULL OR c.produto::TEXT = p_product)
           AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                      p_owner_context, p_owner_id, p_owner_ids)
           AND public._a_tag_ok(c.id, p_tag_ids)
           AND public._a_origem_ok(c.origem, p_origem)
           AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
           AND public._a_destino_ok(c.produto_data, p_destinos)
           AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
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
        'total_won',   (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'total_lost',  (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'perdido'),
        'total_open',  (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE status_comercial NOT IN ('ganho', 'perdido')),
        'conversao_venda_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0
            THEN ROUND((SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho')::NUMERIC
                       / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'receita_total', (SELECT COALESCE(SUM(valor_final), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'margem_total',  (SELECT COALESCE(SUM(receita), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'ticket_medio',  CASE
            WHEN (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho') > 0
            THEN (SELECT ROUND(SUM(valor_final) / COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho')
            ELSE 0
        END,
        'ciclo_medio_dias', (
            SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (o.data_fechamento::TIMESTAMPTZ - o.created_at)) / 86400), 1), 0)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) analytics_funnel_conversion_v2
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_funnel_conversion_v2(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01 00:00:00+00'::TIMESTAMPTZ,
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL,
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL,
    p_owner_context TEXT DEFAULT 'dono'
)
RETURNS TABLE(
    stage_id UUID, stage_nome TEXT, phase_slug TEXT, ordem INT,
    current_count BIGINT, total_valor NUMERIC, receita_total NUMERIC,
    avg_days_in_stage NUMERIC, p75_days_in_stage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
        AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                   p_owner_context, p_owner_id, p_owner_ids)
        AND public._a_tag_ok(c.id, p_tag_ids)
        AND public._a_origem_ok(c.origem, p_origem)
        AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
        AND public._a_destino_ok(c.produto_data, p_destinos)
    WHERE (p_product IS NULL OR pip.produto::TEXT = p_product)
      AND (p_phase_slugs IS NULL OR array_length(p_phase_slugs, 1) IS NULL OR pp.slug = ANY(p_phase_slugs))
    GROUP BY s.id, s.nome, pp.slug, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) analytics_revenue_timeseries_v2
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_revenue_timeseries_v2(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01 00:00:00+00'::TIMESTAMPTZ,
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_granularity TEXT DEFAULT 'month',
    p_product TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL,
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL,
    p_owner_context TEXT DEFAULT 'dono'
)
RETURNS TABLE(
    period TEXT, period_start TIMESTAMPTZ,
    total_valor NUMERIC, total_receita NUMERIC, count_won BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN p_granularity = 'week' THEN TO_CHAR(date_trunc('week', c.data_fechamento::TIMESTAMPTZ), 'DD/MM')
            WHEN p_granularity = 'day'  THEN TO_CHAR(date_trunc('day',  c.data_fechamento::TIMESTAMPTZ), 'DD/MM')
            ELSE TO_CHAR(date_trunc('month', c.data_fechamento::TIMESTAMPTZ), 'MMM YYYY')
        END AS period,
        date_trunc(
            CASE WHEN p_granularity = 'day' THEN 'day' WHEN p_granularity = 'week' THEN 'week' ELSE 'month' END,
            c.data_fechamento::TIMESTAMPTZ
        ) AS period_start,
        COALESCE(SUM(c.valor_final), 0)::NUMERIC AS total_valor,
        COALESCE(SUM(c.receita), 0)::NUMERIC    AS total_receita,
        COUNT(*)::BIGINT                        AS count_won
    FROM cards c
    WHERE c.org_id = requesting_org_id()
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status_comercial = 'ganho'
      AND c.data_fechamento IS NOT NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                 p_owner_context, p_owner_id, p_owner_ids)
      AND public._a_tag_ok(c.id, p_tag_ids)
      AND public._a_origem_ok(c.origem, p_origem)
      AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND public._a_destino_ok(c.produto_data, p_destinos)
      AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
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
            WHEN p_granularity = 'day'  THEN TO_CHAR(date_trunc('day',  c.data_fechamento::TIMESTAMPTZ), 'DD/MM')
            ELSE TO_CHAR(date_trunc('month', c.data_fechamento::TIMESTAMPTZ), 'MMM YYYY')
        END
    ORDER BY period_start;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) analytics_team_performance_v2 — attribution fix nativo por phase
--    A versao legacy ja segmenta por SDR/Planner/Pos, mas filtrava tudo
--    por _a_owner_ok(dono_atual_id,...). A _v2 remove esse filtro cruzado
--    (cada segmento usa seu owner contextual nativamente) e aceita os 4
--    filtros universais novos.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_team_performance_v2(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01 00:00:00+00'::TIMESTAMPTZ,
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_phase TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL,
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID, user_nome TEXT, phase TEXT,
    total_cards BIGINT, won_cards BIGINT, lost_cards BIGINT, open_cards BIGINT,
    conversion_rate NUMERIC, total_receita NUMERIC, ticket_medio NUMERIC,
    ciclo_medio_dias NUMERIC, active_cards BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM (
        -- SDR: atribui por sdr_owner_id, conta handoff (ganho_sdr) como "won"
        SELECT
            p.id AS user_id, p.nome AS user_nome, 'SDR'::TEXT AS phase,
            COUNT(c.id)::BIGINT AS total_cards,
            COUNT(c.id) FILTER (WHERE c.ganho_sdr = true)::BIGINT AS won_cards,
            COUNT(c.id) FILTER (WHERE c.status_comercial = 'perdido')::BIGINT AS lost_cards,
            COUNT(c.id) FILTER (WHERE c.ganho_sdr = false AND c.status_comercial NOT IN ('ganho','perdido'))::BIGINT AS open_cards,
            CASE WHEN COUNT(c.id) > 0
                THEN ROUND(COUNT(c.id) FILTER (WHERE c.ganho_sdr = true)::NUMERIC / COUNT(c.id)::NUMERIC * 100, 1)
                ELSE 0 END AS conversion_rate,
            COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0)::NUMERIC AS total_receita,
            CASE WHEN COUNT(c.id) FILTER (WHERE c.ganho_sdr = true) > 0
                THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho')
                            / NULLIF(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0), 0)
                ELSE 0 END AS ticket_medio,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.ganho_sdr_at - c.created_at)) / 86400)
                FILTER (WHERE c.ganho_sdr = true), 1), 0) AS ciclo_medio_dias,
            COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT AS active_cards
        FROM profiles p
        INNER JOIN cards c ON c.sdr_owner_id = p.id
            AND c.org_id = requesting_org_id() AND c.deleted_at IS NULL AND c.archived_at IS NULL
            AND (p_product IS NULL OR c.produto::TEXT = p_product)
            AND public._a_owner_ok(c.sdr_owner_id, p_owner_id, p_owner_ids)
            AND public._a_tag_ok(c.id, p_tag_ids)
            AND public._a_origem_ok(c.origem, p_origem)
            AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
            AND public._a_destino_ok(c.produto_data, p_destinos)
            AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
            AND CASE
                WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                    c.id IN (SELECT se.card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product) AS se(card_id))
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

        -- Planner: atribui por vendas_owner_id; won=status_comercial=ganho
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
                THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho')
                            / NULLIF(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0), 0)
                ELSE 0 END,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.data_fechamento::TIMESTAMPTZ - c.created_at)) / 86400)
                FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL), 1), 0),
            COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT
        FROM profiles p
        INNER JOIN cards c ON c.vendas_owner_id = p.id
            AND c.org_id = requesting_org_id() AND c.deleted_at IS NULL AND c.archived_at IS NULL
            AND (p_product IS NULL OR c.produto::TEXT = p_product)
            AND public._a_owner_ok(c.vendas_owner_id, p_owner_id, p_owner_ids)
            AND public._a_tag_ok(c.id, p_tag_ids)
            AND public._a_origem_ok(c.origem, p_origem)
            AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
            AND public._a_destino_ok(c.produto_data, p_destinos)
            AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
            AND CASE
                WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                    c.id IN (SELECT se.card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product) AS se(card_id))
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

        -- Pos-Venda: atribui por pos_owner_id; "won"=ganho_pos (entrega concluida)
        SELECT
            p.id, p.nome, 'Pos-Venda'::TEXT,
            COUNT(c.id)::BIGINT,
            COUNT(c.id) FILTER (WHERE c.ganho_pos = true)::BIGINT,
            COUNT(c.id) FILTER (WHERE c.status_comercial = 'perdido')::BIGINT,
            COUNT(c.id) FILTER (WHERE c.ganho_pos = false AND c.status_comercial NOT IN ('ganho','perdido'))::BIGINT,
            CASE WHEN COUNT(c.id) > 0
                THEN ROUND(COUNT(c.id) FILTER (WHERE c.ganho_pos = true)::NUMERIC / COUNT(c.id)::NUMERIC * 100, 1)
                ELSE 0 END,
            COALESCE(SUM(c.receita) FILTER (WHERE c.status_comercial = 'ganho'), 0)::NUMERIC,
            CASE WHEN COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho') > 0
                THEN ROUND(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho')
                            / NULLIF(COUNT(c.id) FILTER (WHERE c.status_comercial = 'ganho'), 0), 0)
                ELSE 0 END,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (c.ganho_pos_at - c.ganho_planner_at)) / 86400)
                FILTER (WHERE c.ganho_pos = true AND c.ganho_planner_at IS NOT NULL), 1), 0),
            COUNT(c.id) FILTER (WHERE c.status_comercial NOT IN ('ganho','perdido'))::BIGINT
        FROM profiles p
        INNER JOIN cards c ON c.pos_owner_id = p.id
            AND c.org_id = requesting_org_id() AND c.deleted_at IS NULL AND c.archived_at IS NULL
            AND (p_product IS NULL OR c.produto::TEXT = p_product)
            AND public._a_owner_ok(c.pos_owner_id, p_owner_id, p_owner_ids)
            AND public._a_tag_ok(c.id, p_tag_ids)
            AND public._a_origem_ok(c.origem, p_origem)
            AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
            AND public._a_destino_ok(c.produto_data, p_destinos)
            AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
            AND CASE
                WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                    c.id IN (SELECT se.card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product) AS se(card_id))
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
    ) combined
    ORDER BY combined.total_cards DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) analytics_team_sla_compliance_v2 — usa business hours + attribution ctx
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_team_sla_compliance_v2(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids UUID[] DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL,
    p_owner_context TEXT DEFAULT 'dono'
)
RETURNS TABLE(
    user_id UUID, user_nome TEXT,
    total_transicoes BIGINT, sla_cumpridas BIGINT, sla_violadas BIGINT,
    compliance_rate NUMERIC, tempo_medio_horas NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH transicoes AS (
        SELECT
            CASE p_owner_context
                WHEN 'sdr'     THEN c.sdr_owner_id
                WHEN 'vendas'  THEN c.vendas_owner_id
                WHEN 'planner' THEN c.vendas_owner_id
                WHEN 'pos'     THEN c.pos_owner_id
                WHEN 'pos_venda' THEN c.pos_owner_id
                ELSE c.dono_atual_id
            END AS user_id,
            a.card_id,
            c.org_id,
            s.sla_hours,
            public.fn_business_minutes_between(
                COALESCE(
                    (SELECT prev.created_at FROM activities prev
                      WHERE prev.card_id = a.card_id
                        AND prev.tipo = 'stage_changed'
                        AND prev.created_at < a.created_at
                      ORDER BY prev.created_at DESC LIMIT 1),
                    c.created_at
                ),
                a.created_at,
                c.org_id
            ) / 60.0 AS horas_gastas
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        LEFT JOIN pipeline_stages s ON s.id = (a.metadata->>'old_stage_id')::UUID
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start
          AND a.created_at < p_date_end
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                     p_owner_context, NULL, p_owner_ids)
          AND public._a_origem_ok(c.origem, p_origem)
          AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
          AND public._a_destino_ok(c.produto_data, p_destinos)
          AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    )
    SELECT
        t.user_id,
        p.nome AS user_nome,
        COUNT(*)::BIGINT AS total_transicoes,
        COUNT(*) FILTER (
            WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0 AND t.horas_gastas <= t.sla_hours
        )::BIGINT AS sla_cumpridas,
        COUNT(*) FILTER (
            WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0 AND t.horas_gastas > t.sla_hours
        )::BIGINT AS sla_violadas,
        CASE
            WHEN COUNT(*) FILTER (WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0) > 0
            THEN ROUND(
                COUNT(*) FILTER (WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0 AND t.horas_gastas <= t.sla_hours)::NUMERIC
                / COUNT(*) FILTER (WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0)::NUMERIC * 100, 1)
            ELSE NULL
        END AS compliance_rate,
        ROUND(AVG(t.horas_gastas)::NUMERIC, 1) AS tempo_medio_horas
    FROM transicoes t
    JOIN profiles p ON p.id = t.user_id
    WHERE t.user_id IS NOT NULL
    GROUP BY t.user_id, p.nome
    ORDER BY compliance_rate DESC NULLS LAST, total_transicoes DESC;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.analytics_overview_kpis_v2(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,UUID,UUID,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_funnel_conversion_v2(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,UUID,UUID,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_revenue_timeseries_v2(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,UUID,UUID,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_team_performance_v2(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,UUID,UUID,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_team_sla_compliance_v2(TIMESTAMPTZ,TIMESTAMPTZ,UUID[],TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;

COMMIT;
