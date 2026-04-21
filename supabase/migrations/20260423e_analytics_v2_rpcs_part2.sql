-- Analytics v2 — Fase 1 parte 2 (RPCs _v2 restantes)
-- Plano: Blocos 1 e 2 (continuacao de 20260423d).
--
-- Cria as 8 RPCs _v2 que faltavam: funnel_live_v2, funnel_velocity_v2,
-- loss_reasons_v2, top_destinations_v2, team_leaderboard_v2,
-- retention_cohort_v2, retention_kpis_v2, pipeline_current_v2.
--
-- Todas aceitam os 4 filtros universais (p_origem, p_phase_slugs,
-- p_lead_entry_path, p_destinos) e p_owner_context (default 'dono') quando
-- faz sentido.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) analytics_funnel_live_v2
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_funnel_live_v2(
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
    stage_id UUID, stage_nome TEXT, fase TEXT, ordem INT,
    total_cards BIGINT, valor_total NUMERIC, receita_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
              AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                          p_owner_context, p_owner_id, p_owner_ids)
              AND public._a_tag_ok(c.id, p_tag_ids)
              AND public._a_origem_ok(c.origem, p_origem)
              AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
              AND public._a_destino_ok(c.produto_data, p_destinos)
              AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
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
              AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                          p_owner_context, p_owner_id, p_owner_ids)
              AND public._a_tag_ok(c.id, p_tag_ids)
              AND public._a_origem_ok(c.origem, p_origem)
              AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
              AND public._a_destino_ok(c.produto_data, p_destinos)
              AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
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
          AND (p_phase_slugs IS NULL OR array_length(p_phase_slugs, 1) IS NULL OR pp.slug = ANY(p_phase_slugs))
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
        transition_entries AS (
            SELECT (a.metadata->>'new_stage_id')::UUID AS entered_stage_id, a.card_id
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
            s.id, s.nome, s.fase, s.ordem::INT,
            COUNT(ae.card_id)::BIGINT,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC,
            COALESCE(SUM(c.receita), 0)::NUMERIC
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
          AND (p_phase_slugs IS NULL OR array_length(p_phase_slugs, 1) IS NULL OR pp.slug = ANY(p_phase_slugs))
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index
        ORDER BY pp.order_index, s.ordem;
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) analytics_funnel_velocity_v2 — tempo medio/p90 por etapa
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_funnel_velocity_v2(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
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
    cards_passaram BIGINT, cards_atuais BIGINT,
    mediana_dias NUMERIC, p90_dias NUMERIC, media_dias NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH stages AS (
        SELECT s.id, s.nome, s.ordem, pp.slug AS phase_slug, pp.order_index AS phase_order
        FROM pipeline_stages s
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE s.ativo = true
          AND (p_phase_slugs IS NULL OR array_length(p_phase_slugs, 1) IS NULL OR pp.slug = ANY(p_phase_slugs))
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
          AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                      p_owner_context, NULL, p_owner_ids)
          AND public._a_tag_ok(c.id, p_tag_ids)
          AND public._a_origem_ok(c.origem, p_origem)
          AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
          AND public._a_destino_ok(c.produto_data, p_destinos)
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
          AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                      p_owner_context, NULL, p_owner_ids)
          AND public._a_tag_ok(c.id, p_tag_ids)
          AND public._a_origem_ok(c.origem, p_origem)
          AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
          AND public._a_destino_ok(c.produto_data, p_destinos)
          AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    ),
    metricas AS (
        SELECT
            s.id AS stage_id, s.nome AS stage_nome, s.phase_slug, s.ordem::INT AS ordem, s.phase_order,
            (SELECT COUNT(*) FROM transicoes t WHERE t.stage_id = s.id)::BIGINT AS cards_passaram,
            (SELECT COUNT(*) FROM atuais a WHERE a.stage_id = s.id)::BIGINT AS cards_atuais,
            COALESCE((SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_na_etapa)
                       FROM transicoes t WHERE t.stage_id = s.id), 0)::NUMERIC AS mediana_dias,
            COALESCE((SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dias_na_etapa)
                       FROM transicoes t WHERE t.stage_id = s.id), 0)::NUMERIC AS p90_dias,
            COALESCE((SELECT AVG(dias_na_etapa) FROM transicoes t WHERE t.stage_id = s.id), 0)::NUMERIC AS media_dias
        FROM stages s
    )
    SELECT m.stage_id, m.stage_nome, m.phase_slug, m.ordem,
           m.cards_passaram, m.cards_atuais,
           ROUND(m.mediana_dias, 1), ROUND(m.p90_dias, 1), ROUND(m.media_dias, 1)
    FROM metricas m
    ORDER BY m.phase_order NULLS LAST, m.ordem;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) analytics_loss_reasons_v2
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_loss_reasons_v2(
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
RETURNS TABLE(motivo TEXT, count BIGINT, percentage NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    total_lost BIGINT;
BEGIN
    SELECT COUNT(*) INTO total_lost
    FROM cards c
    WHERE c.org_id = requesting_org_id() AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
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
    WHERE c.org_id = requesting_org_id() AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
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
    GROUP BY mp.nome
    ORDER BY count DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) analytics_top_destinations_v2
--    Filtro p_destinos faz sentido aqui? Sim, como "sub-filtro" (top entre
--    esses destinos). Aplicamos.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_top_destinations_v2(
    p_date_start DATE DEFAULT NULL,
    p_date_end DATE DEFAULT NULL,
    p_limit INT DEFAULT 10,
    p_mode TEXT DEFAULT 'entries',
    p_product TEXT DEFAULT NULL,
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
RETURNS TABLE(destino TEXT, total_cards BIGINT, receita_total NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_start TIMESTAMPTZ := COALESCE(p_date_start::TIMESTAMPTZ, '2020-01-01'::TIMESTAMPTZ);
    v_end   TIMESTAMPTZ := COALESCE((p_date_end + 1)::TIMESTAMPTZ, NOW() + INTERVAL '1 day');
BEGIN
    RETURN QUERY
    WITH won_cards AS (
        SELECT c.id, c.produto_data,
               COALESCE(c.receita, c.valor_final, c.valor_estimado, 0) AS valor
          FROM cards c
         WHERE c.org_id = v_org
           AND c.status_comercial = 'ganho'
           AND c.deleted_at IS NULL
           AND c.archived_at IS NULL
           AND COALESCE(c.card_type, 'standard') != 'sub_card'
           AND (p_product IS NULL OR c.produto::TEXT = p_product)
           AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                       p_owner_context, p_owner_id, p_owner_ids)
           AND public._a_tag_ok(c.id, p_tag_ids)
           AND public._a_origem_ok(c.origem, p_origem)
           AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
           AND public._a_destino_ok(c.produto_data, p_destinos)
           AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
           AND CASE
               WHEN p_date_start IS NULL AND p_date_end IS NULL THEN TRUE
               ELSE COALESCE(c.data_fechamento, c.created_at) >= v_start
                    AND COALESCE(c.data_fechamento, c.created_at) < v_end
           END
    ),
    dest_expanded AS (
        SELECT TRIM(elem::TEXT, '"') AS destino_nome, wc.id AS card_id, wc.valor
          FROM won_cards wc
          CROSS JOIN LATERAL jsonb_array_elements(wc.produto_data->'destinos') AS elem
         WHERE jsonb_typeof(wc.produto_data->'destinos') = 'array'
        UNION ALL
        SELECT (wc.produto_data->>'destino')::TEXT, wc.id, wc.valor
          FROM won_cards wc
         WHERE jsonb_typeof(wc.produto_data->'destinos') IS DISTINCT FROM 'array'
           AND wc.produto_data->>'destino' IS NOT NULL
           AND wc.produto_data->>'destino' != ''
        UNION ALL
        SELECT (wc.produto_data->>'destino_roteiro')::TEXT, wc.id, wc.valor
          FROM won_cards wc
         WHERE jsonb_typeof(wc.produto_data->'destinos') IS DISTINCT FROM 'array'
           AND wc.produto_data->>'destino' IS NULL
           AND wc.produto_data->>'destino_roteiro' IS NOT NULL
           AND wc.produto_data->>'destino_roteiro' != ''
    )
    SELECT
        TRIM(de.destino_nome) AS destino,
        COUNT(DISTINCT de.card_id)::BIGINT AS total_cards,
        COALESCE(SUM(de.valor), 0)::NUMERIC AS receita_total
    FROM dest_expanded de
    WHERE de.destino_nome IS NOT NULL
      AND TRIM(de.destino_nome) != ''
    GROUP BY TRIM(de.destino_nome)
    ORDER BY COUNT(DISTINCT de.card_id) DESC, receita_total DESC
    LIMIT p_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) analytics_team_leaderboard_v2 — com filtros universais
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_team_leaderboard_v2(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID, user_nome TEXT, user_avatar_url TEXT,
    fases TEXT[], cards_envolvidos BIGINT, cards_ganhos BIGINT,
    cards_perdidos BIGINT, cards_abertos BIGINT, win_rate NUMERIC,
    receita_total NUMERIC, ticket_medio NUMERIC,
    tarefas_abertas BIGINT, tarefas_vencidas BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH card_base AS (
        SELECT c.id, c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id,
               c.status_comercial, c.valor_final, c.receita
          FROM cards c
         WHERE c.org_id = v_org
           AND c.deleted_at IS NULL AND c.archived_at IS NULL
           AND COALESCE(c.card_type, 'standard') != 'sub_card'
           AND c.created_at >= p_date_start AND c.created_at < p_date_end
           AND public._a_tag_ok(c.id, p_tag_ids)
           AND public._a_origem_ok(c.origem, p_origem)
           AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
           AND public._a_destino_ok(c.produto_data, p_destinos)
           AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    ),
    envolvimentos AS (
        SELECT cb.id AS card_id, cb.sdr_owner_id AS u_id, 'sdr'::TEXT AS fase,
               cb.status_comercial, cb.valor_final, cb.receita
          FROM card_base cb WHERE cb.sdr_owner_id IS NOT NULL
        UNION ALL
        SELECT cb.id, cb.vendas_owner_id, 'planner',
               cb.status_comercial, cb.valor_final, cb.receita
          FROM card_base cb WHERE cb.vendas_owner_id IS NOT NULL
        UNION ALL
        SELECT cb.id, cb.pos_owner_id, 'pos_venda',
               cb.status_comercial, cb.valor_final, cb.receita
          FROM card_base cb WHERE cb.pos_owner_id IS NOT NULL
    ),
    envolvimentos_dedup AS (
        SELECT DISTINCT ON (e.card_id, e.u_id)
            e.card_id, e.u_id, e.status_comercial, e.valor_final, e.receita
          FROM envolvimentos e
         WHERE (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
                OR e.u_id = ANY(p_owner_ids))
    ),
    fases_por_pessoa AS (
        SELECT e.u_id, ARRAY_AGG(DISTINCT e.fase ORDER BY e.fase) AS fases
          FROM envolvimentos e
         WHERE (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
                OR e.u_id = ANY(p_owner_ids))
         GROUP BY e.u_id
    ),
    por_pessoa AS (
        SELECT
            ed.u_id, fp.fases,
            COUNT(*)::BIGINT AS cards_envolvidos,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'ganho')::BIGINT AS cards_ganhos,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'perdido')::BIGINT AS cards_perdidos,
            COUNT(*) FILTER (WHERE ed.status_comercial NOT IN ('ganho','perdido'))::BIGINT AS cards_abertos,
            COALESCE(SUM(ed.receita) FILTER (WHERE ed.status_comercial = 'ganho'), 0)::NUMERIC AS receita_total,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'ganho')::BIGINT AS ganhos_n,
            COALESCE(SUM(ed.valor_final) FILTER (WHERE ed.status_comercial = 'ganho'), 0)::NUMERIC AS valor_won
        FROM envolvimentos_dedup ed
        JOIN fases_por_pessoa fp ON fp.u_id = ed.u_id
        GROUP BY ed.u_id, fp.fases
    ),
    tarefas_counts AS (
        SELECT
            t.responsavel_id AS u_id,
            COUNT(*) FILTER (WHERE t.concluida = false) AS tarefas_abertas,
            COUNT(*) FILTER (
                WHERE t.concluida = false
                  AND t.data_vencimento IS NOT NULL
                  AND t.data_vencimento < NOW()
            ) AS tarefas_vencidas
          FROM tarefas t
         WHERE t.org_id = v_org AND t.deleted_at IS NULL AND t.responsavel_id IS NOT NULL
         GROUP BY t.responsavel_id
    )
    SELECT
        pp.u_id, pr.nome, pr.avatar_url,
        pp.fases, pp.cards_envolvidos,
        pp.cards_ganhos, pp.cards_perdidos, pp.cards_abertos,
        CASE WHEN (pp.cards_ganhos + pp.cards_perdidos) > 0
            THEN ROUND(pp.cards_ganhos::NUMERIC / (pp.cards_ganhos + pp.cards_perdidos)::NUMERIC * 100, 1)
            ELSE 0
        END,
        pp.receita_total,
        CASE WHEN pp.ganhos_n > 0
            THEN ROUND(pp.valor_won / pp.ganhos_n, 0)
            ELSE 0
        END,
        COALESCE(tc.tarefas_abertas, 0)::BIGINT,
        COALESCE(tc.tarefas_vencidas, 0)::BIGINT
    FROM por_pessoa pp
    JOIN profiles pr ON pr.id = pp.u_id
    LEFT JOIN tarefas_counts tc ON tc.u_id = pp.u_id
    ORDER BY pp.receita_total DESC, pp.cards_ganhos DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) analytics_retention_cohort_v2 — filtros aplicados ao card de entrada
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_retention_cohort_v2(
    p_date_start DATE DEFAULT NULL,
    p_date_end DATE DEFAULT NULL,
    p_product TEXT DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE(
    cohort_month TEXT, month_offset INT, total_contacts BIGINT,
    retained BIGINT, retention_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '12 months');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
    v_has_tags BOOLEAN := p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) IS NOT NULL;
BEGIN
    RETURN QUERY
    WITH cohorts AS (
        SELECT
            co.id AS contact_id,
            DATE_TRUNC('month', co.primeira_venda_data::TIMESTAMPTZ) AS cohort_date
          FROM contatos co
         WHERE co.primeira_venda_data IS NOT NULL
           AND co.deleted_at IS NULL
           AND co.primeira_venda_data::DATE >= v_start
           AND co.primeira_venda_data::DATE <= v_end
           AND EXISTS (
               SELECT 1 FROM cards_contatos cc
               JOIN cards c ON c.id = cc.card_id
                WHERE cc.contato_id = co.id
                  AND c.status_comercial = 'ganho'
                  AND c.org_id = requesting_org_id()
                  AND c.deleted_at IS NULL
                  AND (p_product IS NULL OR c.produto::TEXT = p_product)
                  AND public._a_origem_ok(c.origem, p_origem)
                  AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
                  AND public._a_destino_ok(c.produto_data, p_destinos)
                  AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
           )
           AND (NOT v_has_tags OR EXISTS (
               SELECT 1 FROM cards_contatos cc2
               JOIN card_tag_assignments cta ON cta.card_id = cc2.card_id
                WHERE cc2.contato_id = co.id AND cta.tag_id = ANY(p_tag_ids)
           ))
    ),
    cohort_sizes AS (
        SELECT cohort_date, COUNT(*) AS total FROM cohorts GROUP BY cohort_date
    ),
    repeat_purchases AS (
        SELECT ch.contact_id, ch.cohort_date,
               DATE_TRUNC('month', c.data_fechamento::TIMESTAMPTZ) AS purchase_month
          FROM cohorts ch
          JOIN cards_contatos cc ON cc.contato_id = ch.contact_id
          JOIN cards c ON c.id = cc.card_id
         WHERE c.status_comercial = 'ganho' AND c.org_id = requesting_org_id() AND c.deleted_at IS NULL
           AND c.data_fechamento IS NOT NULL
           AND DATE_TRUNC('month', c.data_fechamento::TIMESTAMPTZ) > ch.cohort_date
           AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    offsets AS (
        SELECT rp.cohort_date,
               (EXTRACT(YEAR FROM rp.purchase_month) * 12 + EXTRACT(MONTH FROM rp.purchase_month))
               - (EXTRACT(YEAR FROM rp.cohort_date) * 12 + EXTRACT(MONTH FROM rp.cohort_date)) AS m_offset,
               rp.contact_id
          FROM repeat_purchases rp
    ),
    aggregated AS (
        SELECT o.cohort_date, o.m_offset::INT AS m_offset,
               COUNT(DISTINCT o.contact_id) AS retained_count
          FROM offsets o WHERE o.m_offset BETWEEN 1 AND 12
         GROUP BY o.cohort_date, o.m_offset
    )
    SELECT
        TO_CHAR(cs.cohort_date, 'YYYY-MM') AS cohort_month,
        COALESCE(a.m_offset, 0) AS month_offset,
        cs.total AS total_contacts,
        COALESCE(a.retained_count, 0) AS retained,
        CASE WHEN cs.total > 0
             THEN ROUND(COALESCE(a.retained_count, 0)::NUMERIC / cs.total * 100, 1)
             ELSE 0
        END AS retention_rate
    FROM cohort_sizes cs
    LEFT JOIN aggregated a ON a.cohort_date = cs.cohort_date
    ORDER BY cs.cohort_date, a.m_offset;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) analytics_retention_kpis_v2
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_retention_kpis_v2(
    p_date_start DATE DEFAULT NULL,
    p_date_end DATE DEFAULT NULL,
    p_product TEXT DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    result JSONB;
    v_has_tags BOOLEAN := p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) IS NOT NULL;
BEGIN
    WITH base AS (
        SELECT co.id, cs.total_trips, co.primeira_venda_data, co.ultima_venda_data
          FROM contatos co
          LEFT JOIN contact_stats cs ON cs.contact_id = co.id
         WHERE co.deleted_at IS NULL
           AND co.primeira_venda_data IS NOT NULL
           AND (p_date_start IS NULL OR co.primeira_venda_data::DATE >= p_date_start)
           AND (p_date_end   IS NULL OR co.primeira_venda_data::DATE <= p_date_end)
           AND EXISTS (
               SELECT 1 FROM cards_contatos cc
               JOIN cards c ON c.id = cc.card_id
                WHERE cc.contato_id = co.id
                  AND c.status_comercial = 'ganho'
                  AND c.org_id = requesting_org_id()
                  AND c.deleted_at IS NULL
                  AND (p_product IS NULL OR c.produto::TEXT = p_product)
                  AND public._a_origem_ok(c.origem, p_origem)
                  AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
                  AND public._a_destino_ok(c.produto_data, p_destinos)
                  AND public._a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
           )
           AND (NOT v_has_tags OR EXISTS (
               SELECT 1 FROM cards_contatos cc2
               JOIN card_tag_assignments cta ON cta.card_id = cc2.card_id
                WHERE cc2.contato_id = co.id AND cta.tag_id = ANY(p_tag_ids)
           ))
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
                 THEN ROUND(COUNT(*) FILTER (WHERE COALESCE(total_trips, 0) > 1)::NUMERIC / COUNT(*) * 100, 1)
                 ELSE 0 END AS repurchase_rate,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(COUNT(*) FILTER (
                     WHERE ultima_venda_data IS NOT NULL
                       AND ultima_venda_data::DATE < (CURRENT_DATE - INTERVAL '18 months')
                 )::NUMERIC / COUNT(*) * 100, 1)
                 ELSE 0 END AS churn_rate
        FROM base
    )
    SELECT row_to_json(s)::JSONB INTO result FROM stats s;
    RETURN result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) analytics_pipeline_current_v2 — snapshot com filtros + owner_context
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_pipeline_current_v2(
    p_product TEXT DEFAULT NULL,
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    p_date_ref TEXT DEFAULT 'stage',
    p_value_min NUMERIC DEFAULT NULL,
    p_value_max NUMERIC DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL,
    p_owner_context TEXT DEFAULT 'dono'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH open_cards AS (
        SELECT
            c.id, c.titulo, c.pipeline_stage_id, c.dono_atual_id,
            COALESCE(c.valor_final, c.valor_estimado, 0) AS valor,
            COALESCE(c.receita, 0) AS receita_val,
            c.produto, c.created_at, c.stage_entered_at,
            CASE WHEN p_date_ref = 'created'
                 THEN EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400.0
                 ELSE EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400.0
            END AS days_in_stage,
            s.nome AS stage_nome, s.ordem, s.sla_hours,
            pp.label AS fase, pp.slug AS fase_slug, pp.order_index AS fase_order,
            p.nome AS owner_nome,
            co.nome AS pessoa_nome
          FROM cards c
          JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
          LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
          LEFT JOIN profiles p ON p.id = c.dono_atual_id
          LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
         WHERE c.org_id = requesting_org_id()
           AND c.deleted_at IS NULL
           AND c.archived_at IS NULL
           AND c.data_fechamento IS NULL
           AND COALESCE(s.is_won, false) = false
           AND COALESCE(s.is_lost, false) = false
           AND s.ativo = true
           AND (p_product IS NULL OR c.produto::TEXT = p_product)
           AND public._a_ctx_owner_ok(c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
                                       p_owner_context, NULL, p_owner_ids)
           AND public._a_tag_ok(c.id, p_tag_ids)
           AND public._a_origem_ok(c.origem, p_origem)
           AND public._a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
           AND public._a_destino_ok(c.produto_data, p_destinos)
           AND (p_phase_slugs IS NULL OR array_length(p_phase_slugs, 1) IS NULL OR pp.slug = ANY(p_phase_slugs))
           AND (p_value_min IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) >= p_value_min)
           AND (p_value_max IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) <= p_value_max)
    ),
    kpis AS (
        SELECT jsonb_build_object(
            'total_open', COUNT(*),
            'total_value', COALESCE(SUM(valor), 0),
            'total_receita', COALESCE(SUM(receita_val), 0),
            'avg_ticket', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(valor), 0) / COUNT(*)::NUMERIC, 0) ELSE 0 END,
            'avg_receita_ticket', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(receita_val), 0) / COUNT(*)::NUMERIC, 0) ELSE 0 END,
            'avg_age_days', ROUND(COALESCE(AVG(days_in_stage), 0)::NUMERIC, 1),
            'sla_breach_count', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
            'sla_breach_pct', ROUND(
                CASE WHEN COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0) > 0
                THEN COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours)::NUMERIC
                     / COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0)::NUMERIC * 100
                ELSE 0 END, 1
            )
        ) AS val
        FROM open_cards
    ),
    stages AS (
        SELECT jsonb_agg(row_data ORDER BY fase_order, ordem) AS val FROM (
            SELECT jsonb_build_object(
                'stage_id', pipeline_stage_id, 'stage_nome', stage_nome,
                'fase', fase, 'fase_slug', fase_slug, 'produto', produto,
                'ordem', ordem,
                'card_count', COUNT(*),
                'valor_total', COALESCE(SUM(valor), 0),
                'receita_total', COALESCE(SUM(receita_val), 0),
                'avg_days', ROUND(AVG(days_in_stage)::NUMERIC, 1),
                'sla_breach_count', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours)
            ) AS row_data,
            MIN(fase_order) AS fase_order, MIN(ordem) AS ordem
            FROM open_cards
            GROUP BY pipeline_stage_id, stage_nome, fase, fase_slug, produto, open_cards.ordem
        ) sub
    ),
    aging AS (
        SELECT jsonb_agg(row_data ORDER BY fase_order, ordem) AS val FROM (
            SELECT jsonb_build_object(
                'stage_id', pipeline_stage_id, 'stage_nome', stage_nome, 'fase', fase, 'fase_slug', fase_slug,
                'bucket_0_3', COUNT(*) FILTER (WHERE days_in_stage <= 3),
                'bucket_3_7', COUNT(*) FILTER (WHERE days_in_stage > 3 AND days_in_stage <= 7),
                'bucket_7_14', COUNT(*) FILTER (WHERE days_in_stage > 7 AND days_in_stage <= 14),
                'bucket_14_plus', COUNT(*) FILTER (WHERE days_in_stage > 14)
            ) AS row_data,
            MIN(fase_order) AS fase_order, MIN(ordem) AS ordem
            FROM open_cards
            GROUP BY pipeline_stage_id, stage_nome, fase, fase_slug
        ) sub
    ),
    owners AS (
        SELECT jsonb_agg(row_data ORDER BY total_cards DESC) AS val FROM (
            SELECT jsonb_build_object(
                'owner_id', dono_atual_id,
                'owner_nome', COALESCE(owner_nome, 'Não atribuído'),
                'total_cards', COUNT(*),
                'total_value', COALESCE(SUM(valor), 0),
                'total_receita', COALESCE(SUM(receita_val), 0),
                'avg_age_days', ROUND(AVG(days_in_stage)::NUMERIC, 1),
                'sla_breach', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
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
    top_deals AS (
        SELECT jsonb_agg(row_data ORDER BY dis DESC) AS val FROM (
            SELECT jsonb_build_object(
                'card_id', id, 'titulo', titulo, 'stage_nome', stage_nome,
                'fase', fase, 'fase_slug', fase_slug,
                'owner_nome', COALESCE(owner_nome, 'Não atribuído'),
                'owner_id', dono_atual_id,
                'valor_total', valor, 'receita', receita_val,
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
                    'tipo', sub.tipo, 'total', sub.type_total,
                    'completed', sub.type_completed,
                    'pending', sub.type_pending,
                    'overdue', sub.type_overdue
                ) ORDER BY sub.type_total DESC)
                FROM (
                    SELECT t2.tipo,
                           COUNT(*)                                                                  AS type_total,
                           COUNT(*) FILTER (WHERE t2.concluida = true)                               AS type_completed,
                           COUNT(*) FILTER (WHERE t2.concluida = false)                              AS type_pending,
                           COUNT(*) FILTER (WHERE t2.concluida = false AND t2.data_vencimento < NOW()) AS type_overdue
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
                    'fase', sub.fase, 'fase_slug', sub.fase_slug,
                    'card_count', sub.card_count,
                    'total', sub.stage_total, 'completed', sub.stage_completed,
                    'pending', sub.stage_pending, 'overdue', sub.stage_overdue
                ) ORDER BY sub.fase_order, sub.ordem)
                FROM (
                    SELECT
                        oc3.pipeline_stage_id, oc3.stage_nome, oc3.fase, oc3.fase_slug,
                        MIN(oc3.fase_order) AS fase_order, MIN(oc3.ordem) AS ordem,
                        COUNT(DISTINCT oc3.id)                                                       AS card_count,
                        COUNT(t3.id)                                                                  AS stage_total,
                        COUNT(t3.id) FILTER (WHERE t3.concluida = true)                              AS stage_completed,
                        COUNT(t3.id) FILTER (WHERE t3.concluida = false)                             AS stage_pending,
                        COUNT(t3.id) FILTER (WHERE t3.concluida = false AND t3.data_vencimento < NOW()) AS stage_overdue
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
                    'total', sub.owner_total, 'completed', sub.owner_completed,
                    'pending', sub.owner_pending, 'overdue', sub.owner_overdue
                ) ORDER BY sub.owner_total DESC)
                FROM (
                    SELECT oc4.dono_atual_id, oc4.owner_nome,
                           COUNT(DISTINCT oc4.id) AS card_count,
                           COUNT(t4.id)           AS owner_total,
                           COUNT(t4.id) FILTER (WHERE t4.concluida = true)                          AS owner_completed,
                           COUNT(t4.id) FILTER (WHERE t4.concluida = false)                         AS owner_pending,
                           COUNT(t4.id) FILTER (WHERE t4.concluida = false AND t4.data_vencimento < NOW()) AS owner_overdue
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

-- Grants
GRANT EXECUTE ON FUNCTION public.analytics_funnel_live_v2(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,UUID,UUID,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_funnel_velocity_v2(TIMESTAMPTZ,TIMESTAMPTZ,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_loss_reasons_v2(TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,UUID,UUID,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_top_destinations_v2(DATE,DATE,INT,TEXT,TEXT,UUID,UUID,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_team_leaderboard_v2(TIMESTAMPTZ,TIMESTAMPTZ,UUID[],UUID[],TEXT[],TEXT[],TEXT,TEXT[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_retention_cohort_v2(DATE,DATE,TEXT,UUID[],TEXT[],TEXT[],TEXT,TEXT[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_retention_kpis_v2(DATE,DATE,TEXT,UUID[],TEXT[],TEXT[],TEXT,TEXT[]) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_pipeline_current_v2(TEXT,UUID[],UUID[],TEXT,NUMERIC,NUMERIC,TEXT[],TEXT[],TEXT,TEXT[],TEXT) TO authenticated, anon, service_role;

COMMIT;
