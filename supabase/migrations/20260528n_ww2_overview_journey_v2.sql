-- ============================================================================
-- ww2_overview v2 e ww2_journey v2 — alinhados com vw_ww_card_marcos (cache AC)
--
-- Mudanças vs versões anteriores:
--   - "reunioes" agora = SDR fez reunião (campo 17 AC ≠ "Não teve reunião")
--     em vez de COUNT por stage_changed com nome %reuni%
--   - "fechados" agora = ganho (AC field 87 preenchido via cache)
--     em vez de status_comercial='ganho' OR phase_slug='pos_venda'
--   - ww2_journey: 6 passos do funil alinhados com a view canônica
--     (substitui "Pagou taxa" e "Fechou contrato" antigos por
--      "Fez Closer" e "Ganho")
--
-- Shape JSON mantido idêntico — frontend não precisa mudar.
-- ============================================================================

-- ── ww2_overview v2 ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ww2_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_window INTERVAL := p_date_end - p_date_start;
    v_prev_start TIMESTAMPTZ := p_date_start - v_window;
    v_prev_end TIMESTAMPTZ := p_date_start;
    v_kpis JSON; v_funnel JSON; v_conv JSON; v_alertas JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines
     WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_pool ON COMMIT DROP AS
    SELECT c.id, c.created_at, c.pipeline_stage_id, c.status_comercial, c.valor_final,
           c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id, c.updated_at,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_convidados(c.produto_data->>'ww_mkt_convidados_form') AS convidados,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino,
           c.produto_data->>'ww_tipo_casamento' AS tipo,
           _ww2_norm_origem(c.marketing_data) AS origem,
           m.marcou_sdr, m.fez_sdr, m.marcou_closer, m.fez_closer, m.ganho,
           m.ganho_at, m.sdr_agendou_at, m.closer_agendou_at
      FROM cards c
      LEFT JOIN vw_ww_card_marcos m ON m.card_id = c.id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING' AND c.org_id = v_org_id;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_pool WHERE origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_pool WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww2_pool
         WHERE (sdr_owner_id IS NULL OR sdr_owner_id != ALL(p_consultor_ids))
            AND (vendas_owner_id IS NULL OR vendas_owner_id != ALL(p_consultor_ids))
            AND (pos_owner_id IS NULL OR pos_owner_id != ALL(p_consultor_ids))
            AND (dono_atual_id IS NULL OR dono_atual_id != ALL(p_consultor_ids));
    END IF;

    CREATE INDEX ON _ww2_pool (pipeline_stage_id);
    CREATE INDEX ON _ww2_pool (created_at);

    -- ── KPIs ─────────────────────────────────────────────────────────────
    IF p_date_mode = 'throughput' THEN
        WITH base AS (
            SELECT
                COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end) AS leads,
                COUNT(*) FILTER (WHERE created_at >= v_prev_start AND created_at <  v_prev_end) AS leads_prev,
                COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at IS NOT NULL AND sdr_agendou_at BETWEEN p_date_start AND p_date_end) AS reunioes,
                COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at IS NOT NULL AND sdr_agendou_at BETWEEN v_prev_start AND v_prev_end) AS reunioes_prev,
                COUNT(*) FILTER (WHERE marcou_closer AND closer_agendou_at IS NOT NULL AND closer_agendou_at BETWEEN p_date_start AND p_date_end) AS propostas,
                COUNT(*) FILTER (WHERE marcou_closer AND closer_agendou_at IS NOT NULL AND closer_agendou_at BETWEEN v_prev_start AND v_prev_end) AS propostas_prev,
                COUNT(*) FILTER (WHERE ganho AND ganho_at IS NOT NULL AND ganho_at BETWEEN p_date_start AND p_date_end) AS fechados,
                COUNT(*) FILTER (WHERE ganho AND ganho_at IS NOT NULL AND ganho_at BETWEEN v_prev_start AND v_prev_end) AS fechados_prev
            FROM _ww2_pool
        )
        SELECT json_build_object(
            'mode', 'throughput',
            'leads', leads, 'leads_prev', leads_prev,
            'reunioes', reunioes, 'reunioes_prev', reunioes_prev,
            'propostas', propostas, 'propostas_prev', propostas_prev,
            'fechados', fechados, 'fechados_prev', fechados_prev
        ) INTO v_kpis FROM base;
    ELSE
        WITH cohort AS (
            SELECT * FROM _ww2_pool WHERE created_at >= p_date_start AND created_at <= p_date_end
        ),
        cohort_prev AS (
            SELECT * FROM _ww2_pool WHERE created_at >= v_prev_start AND created_at < v_prev_end
        )
        SELECT json_build_object(
            'mode', 'cohort',
            'leads',           (SELECT COUNT(*) FROM cohort),
            'leads_prev',      (SELECT COUNT(*) FROM cohort_prev),
            'reunioes',        (SELECT COUNT(*) FROM cohort WHERE fez_sdr),
            'reunioes_prev',   (SELECT COUNT(*) FROM cohort_prev WHERE fez_sdr),
            'propostas',       (SELECT COUNT(*) FROM cohort WHERE marcou_closer),
            'propostas_prev',  (SELECT COUNT(*) FROM cohort_prev WHERE marcou_closer),
            'fechados',        (SELECT COUNT(*) FROM cohort WHERE ganho),
            'fechados_prev',   (SELECT COUNT(*) FROM cohort_prev WHERE ganho),
            'ticket_medio',    (SELECT ROUND(COALESCE(AVG(valor_final) FILTER (WHERE ganho AND valor_final > 0), 0)::NUMERIC, 0) FROM cohort),
            'receita',         (SELECT ROUND(COALESCE(SUM(valor_final) FILTER (WHERE ganho), 0)::NUMERIC, 0) FROM cohort)
        ) INTO v_kpis;
    END IF;

    -- ── Funil (cards × etapa atual, mantém shape) ────────────────────────
    SELECT json_agg(json_build_object(
        'phase_label', phase_label, 'phase_order', phase_order, 'phase_slug', phase_slug,
        'stage_id', stage_id, 'stage_name', stage_name, 'stage_order', stage_order,
        'stage_active', stage_active, 'is_won', is_won, 'is_lost', is_lost,
        'leads_count', leads_count
    ) ORDER BY phase_order NULLS LAST, stage_order NULLS LAST) INTO v_funnel
    FROM (
        SELECT COALESCE(ph.label, ph.name) AS phase_label, ph.order_index AS phase_order, ph.slug AS phase_slug,
               s.id AS stage_id, s.nome AS stage_name, s.ordem AS stage_order, s.ativo AS stage_active,
               s.is_won, s.is_lost,
               COUNT(p.id) FILTER (WHERE p.created_at >= p_date_start AND p.created_at <= p_date_end) AS leads_count
          FROM pipeline_phases ph
          JOIN pipeline_stages s ON s.phase_id = ph.id
          LEFT JOIN _ww2_pool p ON p.pipeline_stage_id = s.id
         WHERE s.pipeline_id = v_pipeline_id
         GROUP BY ph.id, ph.label, ph.name, ph.order_index, ph.slug, s.id, s.nome, s.ordem, s.ativo, s.is_won, s.is_lost
        HAVING s.ativo = TRUE OR COUNT(p.id) FILTER (WHERE p.created_at >= p_date_start AND p.created_at <= p_date_end) > 0
    ) sc;

    -- ── Conversões entre fases ───────────────────────────────────────────
    SELECT json_agg(json_build_object(
        'phase_label', phase_label, 'phase_order', phase_order,
        'leads', leads, 'taxa_vs_anterior', taxa
    ) ORDER BY phase_order) INTO v_conv
    FROM (
        WITH pool AS (
            SELECT p.id, COALESCE(ph.order_index, 999) AS phase_order, COALESCE(ph.label, ph.name) AS phase_label
              FROM _ww2_pool p
              LEFT JOIN pipeline_stages s ON s.id = p.pipeline_stage_id
              LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
             WHERE p.created_at >= p_date_start AND p.created_at <= p_date_end
        ),
        phases_with_count AS (
            SELECT ph.order_index AS phase_order, COALESCE(ph.label, ph.name) AS phase_label,
                   (SELECT COUNT(*) FROM pool WHERE pool.phase_order >= ph.order_index) AS leads
              FROM pipeline_phases ph
             WHERE ph.id IN (SELECT DISTINCT phase_id FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND phase_id IS NOT NULL)
        )
        SELECT phase_order, phase_label, leads,
               CASE WHEN LAG(leads) OVER (ORDER BY phase_order) > 0
                    THEN ROUND(100.0 * leads / LAG(leads) OVER (ORDER BY phase_order), 1)
                    ELSE NULL END AS taxa
          FROM phases_with_count
         ORDER BY phase_order
    ) c;

    -- ── Alertas ──────────────────────────────────────────────────────────
    SELECT json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'stage_name', stage_name,
        'phase_label', phase_label, 'dias_parado', dias_parado, 'valor_estimado', valor_estimado
    ) ORDER BY dias_parado DESC) INTO v_alertas
    FROM (
        SELECT c.id AS card_id, c.titulo, s.nome AS stage_name, COALESCE(ph.label, ph.name) AS phase_label,
               EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado,
               c.valor_estimado
          FROM cards c
          JOIN _ww2_pool p ON p.id = c.id
          LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
          LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE c.status_comercial != 'perdido' AND s.ativo = TRUE
           AND s.is_won = FALSE AND s.is_lost = FALSE
           AND NOW() - GREATEST(c.updated_at, c.created_at) > INTERVAL '7 days'
         ORDER BY dias_parado DESC LIMIT 8
    ) a;

    DROP TABLE _ww2_pool;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'prev_start', v_prev_start, 'prev_end', v_prev_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'conversoes', COALESCE(v_conv, '[]'::JSON),
        'alertas', COALESCE(v_alertas, '[]'::JSON),
        'fonte_marcos', 'ww_ac_deal_funnel_cache (v2)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

COMMENT ON FUNCTION public.ww2_overview IS
  'v2 (2026-05-28): reunioes/propostas/fechados vêm de vw_ww_card_marcos (cache AC). Regra canônica AC.';

-- ── ww2_journey v2 ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ww2_journey(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_funil_real JSON;
    v_tempos JSON;
    v_orcamento_real JSON;
    v_destino_mudou JSON;
    v_ranking_lentos JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines
     WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_j ON COMMIT DROP AS
    SELECT c.id, c.created_at, c.valor_final, c.status_comercial,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa_entrada,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino_entrada,
           _ww2_norm_convidados(c.produto_data->>'ww_mkt_convidados_form') AS convidados_entrada,
           _ww2_norm_destino(c.produto_data->>'ww_destino') AS destino_final,
           NULLIF(c.produto_data->>'ww_tipo_casamento', '') AS tipo,
           _ww2_norm_origem(c.marketing_data) AS origem,
           m.marcou_sdr, m.fez_sdr, m.marcou_closer, m.fez_closer, m.ganho,
           m.sdr_agendou_at AS sdr_data_reuniao,
           m.closer_agendou_at AS closer_data_reuniao,
           m.ganho_at
      FROM cards c
      LEFT JOIN vw_ww_card_marcos m ON m.card_id = c.id
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING' AND c.org_id = v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_j WHERE origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_j WHERE faixa_entrada IS NULL OR faixa_entrada != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_j WHERE destino_entrada IS NULL OR destino_entrada != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_j WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    -- ── 1) Funil REAL canônico (6 passos, cache AC) ───────────────────────
    SELECT json_agg(json_build_object(
        'passo', passo, 'ordem', ordem, 'cards', cards,
        'pct_total', pct_total, 'pct_anterior', pct_anterior
    ) ORDER BY ordem) INTO v_funil_real
    FROM (
        WITH counts AS (
            SELECT
                (SELECT COUNT(*) FROM _ww2_j) AS total,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_sdr) AS c_marcou_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_sdr) AS c_fez_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_closer) AS c_marcou_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_closer) AS c_fez_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE ganho) AS c_ganho
        )
        SELECT '1. Entrou' AS passo, 1 AS ordem, total AS cards, 100.0 AS pct_total, NULL::NUMERIC AS pct_anterior FROM counts
        UNION ALL
        SELECT '2. Marcou reunião SDR', 2, c_marcou_sdr,
               ROUND(100.0 * c_marcou_sdr / NULLIF(total, 0), 1),
               ROUND(100.0 * c_marcou_sdr / NULLIF(total, 0), 1) FROM counts
        UNION ALL
        SELECT '3. Fez reunião SDR', 3, c_fez_sdr,
               ROUND(100.0 * c_fez_sdr / NULLIF(total, 0), 1),
               ROUND(100.0 * c_fez_sdr / NULLIF(c_marcou_sdr, 0), 1) FROM counts
        UNION ALL
        SELECT '4. Marcou reunião Closer', 4, c_marcou_closer,
               ROUND(100.0 * c_marcou_closer / NULLIF(total, 0), 1),
               ROUND(100.0 * c_marcou_closer / NULLIF(c_fez_sdr, 0), 1) FROM counts
        UNION ALL
        SELECT '5. Fez reunião Closer', 5, c_fez_closer,
               ROUND(100.0 * c_fez_closer / NULLIF(total, 0), 1),
               ROUND(100.0 * c_fez_closer / NULLIF(c_marcou_closer, 0), 1) FROM counts
        UNION ALL
        SELECT '6. Ganho', 6, c_ganho,
               ROUND(100.0 * c_ganho / NULLIF(total, 0), 1),
               ROUND(100.0 * c_ganho / NULLIF(c_fez_closer, 0), 1) FROM counts
    ) x;

    -- ── 2) Tempos ─────────────────────────────────────────────────────────
    SELECT json_build_object(
        'lead_para_reuniao_sdr', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE sdr_data_reuniao IS NOT NULL),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sdr_data_reuniao - created_at))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sdr_data_reuniao - created_at))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL))::NUMERIC, 1),
            'avg_dias', ROUND(AVG(EXTRACT(EPOCH FROM (sdr_data_reuniao - created_at))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL)::NUMERIC, 1)
        ),
        'reuniao_sdr_para_reuniao_closer', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - sdr_data_reuniao))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - sdr_data_reuniao))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao))::NUMERIC, 1)
        ),
        'lead_para_closer', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE closer_data_reuniao IS NOT NULL),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - created_at))/86400) FILTER (WHERE closer_data_reuniao IS NOT NULL))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - created_at))/86400) FILTER (WHERE closer_data_reuniao IS NOT NULL))::NUMERIC, 1)
        ),
        'lead_para_fechamento', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE ganho),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(ganho_at, NOW()) - created_at))/86400) FILTER (WHERE ganho))::NUMERIC, 0),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(ganho_at, NOW()) - created_at))/86400) FILTER (WHERE ganho))::NUMERIC, 0),
            'nota', 'tempo entre criação do card e data de ganho (field 87 AC)'
        )
    ) INTO v_tempos
    FROM _ww2_j;

    -- ── 3) Orçamento entrada × valor real fechado ─────────────────────────
    SELECT json_agg(json_build_object(
        'faixa_entrada', faixa_entrada, 'leads_total', leads_total, 'leads_fechados', leads_fechados,
        'leads_com_valor', leads_com_valor, 'valor_medio_real', valor_medio,
        'valor_mediano_real', valor_mediano, 'taxa_fechamento', taxa
    ) ORDER BY ordem_faixa) INTO v_orcamento_real
    FROM (
        SELECT faixa_entrada,
               CASE faixa_entrada
                 WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$50-100 mil' THEN 3
                 WHEN 'R$80-100 mil' THEN 4 WHEN 'R$100-200 mil' THEN 5 WHEN 'R$200-500 mil' THEN 6
                 WHEN 'Mais de R$500 mil' THEN 7 ELSE 99 END AS ordem_faixa,
               COUNT(*) AS leads_total,
               COUNT(*) FILTER (WHERE ganho) AS leads_fechados,
               COUNT(*) FILTER (WHERE ganho AND valor_final > 0) AS leads_com_valor,
               ROUND(COALESCE(AVG(valor_final) FILTER (WHERE ganho AND valor_final > 0), 0)::NUMERIC, 0) AS valor_medio,
               ROUND(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_final) FILTER (WHERE ganho AND valor_final > 0), 0)::NUMERIC, 0) AS valor_mediano,
               CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE ganho) / COUNT(*), 1) ELSE 0 END AS taxa
          FROM _ww2_j WHERE faixa_entrada IS NOT NULL
         GROUP BY faixa_entrada
    ) x;

    -- ── 4) Destino entrada × destino confirmado ───────────────────────────
    SELECT json_agg(json_build_object(
        'destino_entrada', destino_entrada, 'leads_total', leads_total, 'manteve', manteve,
        'mudou', mudou, 'sem_dado_final', sem_dado_final, 'principal_destino_final', principal_destino_final,
        'pct_manteve', pct_manteve
    ) ORDER BY leads_total DESC) INTO v_destino_mudou
    FROM (
        SELECT destino_entrada, COUNT(*) AS leads_total,
            COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) = LOWER(destino_entrada)) AS manteve,
            COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) != LOWER(destino_entrada)) AS mudou,
            COUNT(*) FILTER (WHERE destino_final IS NULL) AS sem_dado_final,
            (SELECT destino_final FROM _ww2_j j2 WHERE j2.destino_entrada = j1.destino_entrada AND j2.destino_final IS NOT NULL
              GROUP BY destino_final ORDER BY COUNT(*) DESC LIMIT 1) AS principal_destino_final,
            CASE WHEN COUNT(*) FILTER (WHERE destino_final IS NOT NULL) > 0
                 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) = LOWER(destino_entrada)) / COUNT(*) FILTER (WHERE destino_final IS NOT NULL), 1)
                 ELSE NULL END AS pct_manteve
          FROM _ww2_j j1 WHERE destino_entrada IS NOT NULL
         GROUP BY destino_entrada HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC LIMIT 12
    ) x;

    -- ── 5) Leads "presos" entre passos ────────────────────────────────────
    SELECT json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'gargalo', gargalo, 'dias', dias, 'origem', origem, 'faixa', faixa
    ) ORDER BY dias DESC) INTO v_ranking_lentos
    FROM (
        SELECT c.id AS card_id, c.titulo,
               'Marcou SDR sem confirmar reunião' AS gargalo,
               EXTRACT(DAY FROM NOW() - j.sdr_data_reuniao)::INT AS dias,
               j.origem, j.faixa_entrada AS faixa
          FROM _ww2_j j JOIN cards c ON c.id = j.id
         WHERE j.marcou_sdr AND NOT j.fez_sdr AND j.sdr_data_reuniao IS NOT NULL
           AND NOW() - j.sdr_data_reuniao BETWEEN INTERVAL '7 days' AND INTERVAL '120 days'
        UNION ALL
        SELECT c.id AS card_id, c.titulo,
               'Marcou Closer mas não realizou reunião' AS gargalo,
               EXTRACT(DAY FROM NOW() - j.closer_data_reuniao)::INT AS dias,
               j.origem, j.faixa_entrada AS faixa
          FROM _ww2_j j JOIN cards c ON c.id = j.id
         WHERE j.marcou_closer AND NOT j.fez_closer AND NOT j.ganho AND j.closer_data_reuniao IS NOT NULL
           AND NOW() - j.closer_data_reuniao BETWEEN INTERVAL '7 days' AND INTERVAL '120 days'
        ORDER BY 4 DESC LIMIT 8
    ) x;

    DROP TABLE _ww2_j;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'funil_real', COALESCE(v_funil_real, '[]'::JSON),
        'tempos', v_tempos,
        'orcamento_real', COALESCE(v_orcamento_real, '[]'::JSON),
        'destino_mudou', COALESCE(v_destino_mudou, '[]'::JSON),
        'ranking_lentos', COALESCE(v_ranking_lentos, '[]'::JSON),
        'fonte_marcos', 'ww_ac_deal_funnel_cache (v2)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_journey(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

COMMENT ON FUNCTION public.ww2_journey IS
  'v2 (2026-05-28): funil_real com 6 passos canônicos AC (substitui "Pagou taxa"/"Fechou contrato" por "Fez Closer"/"Ganho").';
