-- ============================================================================
-- Analytics Weddings v2 — 6 RPCs para o dashboard refeito
--
-- Diferente da v1 (analytics_weddings_overview): visões especializadas, filtros
-- ricos, suporte a "data de criação" vs "data de evento" (cohort vs throughput),
-- comparação vs período anterior e drill-down.
--
-- Funções:
--   ww2_overview            — KPIs com comparação + funil + conversões + alertas
--   ww2_team_performance    — Leaderboard SDR+Closer + detalhes por consultor
--   ww2_lead_quality        — Distribuições + cruzamentos faixa×conv, destino×conv, origem×faixa
--   ww2_marketing           — Volume + conversão por UTM source/campaign/medium
--   ww2_loss_reasons        — Motivos perda + cruzamentos + tendência temporal
--   ww2_drill_down          — Lista de cards filtrada (paginada)
--
-- Parâmetros comuns (todas aceitam):
--   p_date_start, p_date_end       — janela temporal
--   p_date_mode                    — 'cohort' (data de criação) ou 'throughput' (data de evento)
--   p_org_id                       — workspace (NULL = requesting_org_id)
--   p_origins TEXT[]               — filtro por UTM source (NULL = todas)
--   p_faixas TEXT[]                — filtro por faixa de investimento
--   p_destinos TEXT[]              — filtro por destino
--   p_tipos TEXT[]                 — filtro por DW/Elopment
--   p_consultor_ids UUID[]         — filtro por dono (qualquer dos sdr/closer/planner)
-- ============================================================================

-- ── Helper: normalizar faixa de investimento ────────────────────────────────
CREATE OR REPLACE FUNCTION public._ww2_norm_faixa(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    CASE
        WHEN p_raw ILIKE '%menos de r$50%' OR p_raw ILIKE '%até%r$50%' THEN RETURN 'Até R$50 mil';
        WHEN p_raw ILIKE '%r$50%80%' THEN RETURN 'R$50-80 mil';
        WHEN p_raw ILIKE '%r$80%100%' THEN RETURN 'R$80-100 mil';
        WHEN p_raw ILIKE '%r$50%100%' THEN RETURN 'R$50-100 mil';
        WHEN p_raw ILIKE '%r$100%200%' THEN RETURN 'R$100-200 mil';
        WHEN p_raw ILIKE '%r$200%500%' THEN RETURN 'R$200-500 mil';
        WHEN p_raw ILIKE '%mais de r$500%' OR p_raw ILIKE '%acima%500%' THEN RETURN 'Mais de R$500 mil';
        ELSE RETURN TRIM(REPLACE(p_raw, '_', ' '));
    END CASE;
END $$;

-- ── Helper: normalizar bucket de convidados ─────────────────────────────────
CREATE OR REPLACE FUNCTION public._ww2_norm_convidados(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    CASE
        WHEN p_raw ILIKE '%apenas o casal%' OR p_raw ILIKE '%só o casal%' THEN RETURN 'Apenas o casal';
        WHEN p_raw ILIKE '%até 20%' THEN RETURN 'Até 20';
        WHEN p_raw ILIKE '%20 a 50%' OR p_raw ILIKE '%menos de 50%' THEN RETURN '20-50';
        WHEN p_raw ILIKE '%50 a 80%' OR p_raw ILIKE '%50 e 100%' THEN RETURN '50-80';
        WHEN p_raw ILIKE '%80 a 100%' OR p_raw ILIKE '%80 e 100%' THEN RETURN '80-100';
        WHEN p_raw ILIKE '%acima de 100%' OR p_raw ILIKE '%mais de 100%' OR p_raw ILIKE '%+100%' THEN RETURN '+100';
        ELSE RETURN TRIM(REPLACE(p_raw, '_', ' '));
    END CASE;
END $$;

-- ── Helper: normalizar destino ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ww2_norm_destino(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    RETURN INITCAP(TRIM(REPLACE(LOWER(p_raw), '_', ' ')));
END $$;

-- ── Helper: derivar origem (UTM source) consolidada ─────────────────────────
CREATE OR REPLACE FUNCTION public._ww2_norm_origem(p_marketing_data JSONB) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT;
BEGIN
    v := COALESCE(
        p_marketing_data->>'utm_source',
        p_marketing_data->'card'->>'utm_source',
        p_marketing_data->>'source_origin',
        p_marketing_data->'card'->>'mkt_origem_ultima_conversao'
    );
    IF v IS NULL OR v = '' THEN RETURN 'Desconhecida'; END IF;
    v := LOWER(TRIM(v));
    CASE
        WHEN v ILIKE '%leadster%' THEN RETURN 'Leadster';
        WHEN v ILIKE '%instagram%' OR v ILIKE '%ig%' THEN RETURN 'Instagram';
        WHEN v ILIKE '%facebook%' OR v ILIKE '%fb%' OR v ILIKE '%meta%' THEN RETURN 'Facebook/Meta';
        WHEN v ILIKE '%google%' OR v ILIKE '%adwords%' THEN RETURN 'Google';
        WHEN v ILIKE '%site%' OR v ILIKE '%formul%' OR v ILIKE '%direct%' THEN RETURN 'Site direto';
        WHEN v ILIKE '%indicac%' OR v ILIKE '%referral%' OR v ILIKE '%boca%' THEN RETURN 'Indicação';
        ELSE RETURN INITCAP(v);
    END CASE;
END $$;

-- ============================================================================
-- ww2_overview: KPIs com comparação + funil + conversões + alertas
-- ============================================================================
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

    -- Pool de leads (sempre por created_at, filtros aplicados)
    CREATE TEMP TABLE _ww2_pool ON COMMIT DROP AS
    SELECT c.id, c.created_at, c.pipeline_stage_id, c.status_comercial, c.valor_final,
           c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
           c.updated_at,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_convidados(c.produto_data->>'ww_mkt_convidados_form') AS convidados,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino,
           c.produto_data->>'ww_tipo_casamento' AS tipo,
           _ww2_norm_origem(c.marketing_data) AS origem
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING' AND c.org_id = v_org_id;

    -- Aplicar filtros (faixa, destino, tipo, origem, consultor)
    IF p_origins IS NOT NULL THEN
        DELETE FROM _ww2_pool WHERE origem != ALL(p_origins);
    END IF;
    IF p_faixas IS NOT NULL THEN
        DELETE FROM _ww2_pool WHERE faixa IS NULL OR faixa != ALL(p_faixas);
    END IF;
    IF p_destinos IS NOT NULL THEN
        DELETE FROM _ww2_pool WHERE destino IS NULL OR destino != ALL(p_destinos);
    END IF;
    IF p_tipos IS NOT NULL THEN
        DELETE FROM _ww2_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos);
    END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww2_pool
         WHERE sdr_owner_id IS NULL OR sdr_owner_id != ALL(p_consultor_ids)
            AND (vendas_owner_id IS NULL OR vendas_owner_id != ALL(p_consultor_ids))
            AND (pos_owner_id IS NULL OR pos_owner_id != ALL(p_consultor_ids))
            AND (dono_atual_id IS NULL OR dono_atual_id != ALL(p_consultor_ids));
    END IF;

    CREATE INDEX ON _ww2_pool (pipeline_stage_id);
    CREATE INDEX ON _ww2_pool (created_at);

    -- ── KPIs com comparação ──
    -- Cohort: contar leads criados no período
    -- Throughput: contar EVENTOS no período (stage_changed + ganho_planner_event)
    IF p_date_mode = 'throughput' THEN
        WITH eventos AS (
            SELECT a.card_id, a.tipo, a.created_at, a.metadata
              FROM activities a
              JOIN _ww2_pool p ON p.id = a.card_id
             WHERE a.created_at >= p_date_start AND a.created_at <= p_date_end
        ),
        eventos_prev AS (
            SELECT a.card_id, a.tipo
              FROM activities a
              JOIN _ww2_pool p ON p.id = a.card_id
             WHERE a.created_at >= v_prev_start AND a.created_at <= v_prev_end
        ),
        agg AS (
            SELECT
                (SELECT COUNT(DISTINCT a.card_id) FROM activities a
                  JOIN _ww2_pool p ON p.id = a.card_id
                 WHERE a.tipo='card_created' AND a.created_at >= p_date_start AND a.created_at <= p_date_end) AS leads,
                (SELECT COUNT(DISTINCT a.card_id) FROM activities a
                  JOIN _ww2_pool p ON p.id = a.card_id
                 WHERE a.tipo='card_created' AND a.created_at >= v_prev_start AND a.created_at <= v_prev_end) AS leads_prev,
                (SELECT COUNT(DISTINCT card_id) FROM eventos WHERE tipo='stage_changed' AND metadata->>'new_stage_name' ILIKE '%reuni%') AS reunioes,
                (SELECT COUNT(DISTINCT card_id) FROM eventos_prev WHERE tipo='stage_changed') AS reunioes_prev,
                (SELECT COUNT(DISTINCT card_id) FROM eventos WHERE tipo='stage_changed' AND metadata->>'new_stage_name' ILIKE '%proposta%') AS propostas,
                0 AS propostas_prev,
                (SELECT COUNT(*) FROM eventos WHERE tipo IN ('ganho_planner_event','ganho_pos_event')) AS fechados,
                (SELECT COUNT(*) FROM eventos_prev WHERE tipo IN ('ganho_planner_event','ganho_pos_event')) AS fechados_prev
        )
        SELECT json_build_object(
            'mode', 'throughput',
            'leads', leads, 'leads_prev', leads_prev,
            'reunioes', reunioes, 'reunioes_prev', reunioes_prev,
            'propostas', propostas, 'propostas_prev', propostas_prev,
            'fechados', fechados, 'fechados_prev', fechados_prev
        ) INTO v_kpis FROM agg;
    ELSE
        -- COHORT: leads do período + onde estão hoje
        WITH cohort AS (
            SELECT p.*, COALESCE(ph.slug, '') AS phase_slug, COALESCE(ph.label, ph.name) AS phase_label
              FROM _ww2_pool p
              LEFT JOIN pipeline_stages s ON s.id = p.pipeline_stage_id
              LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
             WHERE p.created_at >= p_date_start AND p.created_at <= p_date_end
        ),
        cohort_prev AS (
            SELECT p.*, COALESCE(ph.slug, '') AS phase_slug
              FROM _ww2_pool p
              LEFT JOIN pipeline_stages s ON s.id = p.pipeline_stage_id
              LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
             WHERE p.created_at >= v_prev_start AND p.created_at <= v_prev_end
        )
        SELECT json_build_object(
            'mode', 'cohort',
            'leads', (SELECT COUNT(*) FROM cohort),
            'leads_prev', (SELECT COUNT(*) FROM cohort_prev),
            'reunioes', (SELECT COUNT(*) FROM cohort WHERE phase_slug IN ('closer','vendas','planner','pos_venda') OR EXISTS(SELECT 1 FROM activities a WHERE a.card_id = cohort.id AND a.tipo='stage_changed' AND a.metadata->>'new_stage_name' ILIKE '%reuni%')),
            'reunioes_prev', (SELECT COUNT(*) FROM cohort_prev WHERE phase_slug IN ('closer','vendas','planner','pos_venda')),
            'propostas', (SELECT COUNT(*) FROM cohort WHERE phase_slug IN ('planner','pos_venda') OR EXISTS(SELECT 1 FROM activities a WHERE a.card_id = cohort.id AND a.tipo='stage_changed' AND a.metadata->>'new_stage_name' ILIKE '%proposta%')),
            'propostas_prev', (SELECT COUNT(*) FROM cohort_prev WHERE phase_slug IN ('planner','pos_venda')),
            'fechados', (SELECT COUNT(*) FROM cohort WHERE status_comercial='ganho' OR phase_slug = 'pos_venda'),
            'fechados_prev', (SELECT COUNT(*) FROM cohort_prev WHERE status_comercial='ganho' OR phase_slug = 'pos_venda'),
            'ticket_medio', (SELECT ROUND(COALESCE(AVG(valor_final) FILTER (WHERE status_comercial='ganho' OR phase_slug='pos_venda' AND valor_final > 0), 0)::NUMERIC, 0) FROM cohort),
            'receita', (SELECT ROUND(COALESCE(SUM(valor_final) FILTER (WHERE status_comercial='ganho' OR phase_slug='pos_venda'), 0)::NUMERIC, 0) FROM cohort)
        ) INTO v_kpis;
    END IF;

    -- ── Funil (modo cohort): leads do período × etapa atual ──
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

    -- ── Conversões entre fases (taxa de avanço cumulativo) ──
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

    -- ── Alertas: cards parados em mesma etapa há >7 dias (top 5 por idade) ──
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
         WHERE c.status_comercial != 'perdido'
           AND s.ativo = TRUE
           AND s.is_won = FALSE
           AND s.is_lost = FALSE
           AND NOW() - GREATEST(c.updated_at, c.created_at) > INTERVAL '7 days'
         ORDER BY dias_parado DESC
         LIMIT 8
    ) a;

    DROP TABLE _ww2_pool;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'prev_start', v_prev_start, 'prev_end', v_prev_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'conversoes', COALESCE(v_conv, '[]'::JSON),
        'alertas', COALESCE(v_alertas, '[]'::JSON)
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ============================================================================
-- ww2_team_performance: leaderboard por consultor
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ww2_team_performance(
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
    v_sdr JSON; v_closer JSON; v_planner JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','sem pipeline'); END IF;

    CREATE TEMP TABLE _ww2_t ON COMMIT DROP AS
    SELECT c.id, c.created_at, c.pipeline_stage_id, c.status_comercial, c.valor_final,
           c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.ganho_sdr_at, c.ganho_planner_at,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino,
           c.produto_data->>'ww_tipo_casamento' AS tipo,
           _ww2_norm_origem(c.marketing_data) AS origem,
           ph.slug AS phase_slug
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_t WHERE origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_t WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_t WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_t WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    -- Leaderboard SDR
    SELECT json_agg(json_build_object(
        'user_id', user_id, 'nome', nome, 'leads', leads, 'qualificados', qualif, 'taxa_qualif', taxa_qualif,
        'perdidos', perdidos, 'tempo_medio_dias', tempo_medio
    ) ORDER BY taxa_qualif DESC NULLS LAST, leads DESC) INTO v_sdr
    FROM (
        SELECT t.sdr_owner_id AS user_id, pr.nome,
               COUNT(*) AS leads,
               COUNT(*) FILTER (WHERE t.ganho_sdr_at IS NOT NULL) AS qualif,
               COUNT(*) FILTER (WHERE t.status_comercial='perdido' AND t.phase_slug='sdr') AS perdidos,
               CASE WHEN COUNT(*) FILTER (WHERE t.ganho_sdr_at IS NOT NULL) > 0
                    THEN ROUND((COUNT(*) FILTER (WHERE t.ganho_sdr_at IS NOT NULL)::NUMERIC * 100 / COUNT(*)), 1)
                    ELSE 0 END AS taxa_qualif,
               ROUND(AVG(EXTRACT(EPOCH FROM (t.ganho_sdr_at - t.created_at))/86400) FILTER (WHERE t.ganho_sdr_at IS NOT NULL)::NUMERIC, 1) AS tempo_medio
          FROM _ww2_t t
          LEFT JOIN profiles pr ON pr.id = t.sdr_owner_id
         WHERE t.sdr_owner_id IS NOT NULL
           AND (p_consultor_ids IS NULL OR t.sdr_owner_id = ANY(p_consultor_ids))
         GROUP BY t.sdr_owner_id, pr.nome
        HAVING COUNT(*) >= 1
    ) sdr;

    -- Leaderboard Closer (vendas_owner_id)
    SELECT json_agg(json_build_object(
        'user_id', user_id, 'nome', nome, 'leads', leads, 'fechados', fechados, 'taxa_fechamento', taxa,
        'ticket_medio', ticket_medio, 'perdidos', perdidos, 'tempo_medio_dias', tempo_medio
    ) ORDER BY taxa DESC NULLS LAST, leads DESC) INTO v_closer
    FROM (
        SELECT t.vendas_owner_id AS user_id, pr.nome,
               COUNT(*) AS leads,
               COUNT(*) FILTER (WHERE t.status_comercial='ganho' OR t.phase_slug='pos_venda') AS fechados,
               COUNT(*) FILTER (WHERE t.status_comercial='perdido' AND t.phase_slug IN ('vendas','closer')) AS perdidos,
               CASE WHEN COUNT(*) > 0 THEN
                    ROUND(COUNT(*) FILTER (WHERE t.status_comercial='ganho' OR t.phase_slug='pos_venda')::NUMERIC * 100 / COUNT(*), 1)
                    ELSE 0 END AS taxa,
               ROUND(COALESCE(AVG(t.valor_final) FILTER (WHERE (t.status_comercial='ganho' OR t.phase_slug='pos_venda') AND t.valor_final > 0), 0)::NUMERIC, 0) AS ticket_medio,
               ROUND(AVG(EXTRACT(EPOCH FROM (t.ganho_planner_at - t.created_at))/86400) FILTER (WHERE t.ganho_planner_at IS NOT NULL)::NUMERIC, 1) AS tempo_medio
          FROM _ww2_t t
          LEFT JOIN profiles pr ON pr.id = t.vendas_owner_id
         WHERE t.vendas_owner_id IS NOT NULL
           AND (p_consultor_ids IS NULL OR t.vendas_owner_id = ANY(p_consultor_ids))
         GROUP BY t.vendas_owner_id, pr.nome
        HAVING COUNT(*) >= 1
    ) closer;

    -- Leaderboard Planner (pos_owner_id)
    SELECT json_agg(json_build_object(
        'user_id', user_id, 'nome', nome, 'casamentos_em_andamento', em_andamento, 'concluidos', concluidos
    ) ORDER BY em_andamento DESC NULLS LAST) INTO v_planner
    FROM (
        SELECT t.pos_owner_id AS user_id, pr.nome,
               COUNT(*) FILTER (WHERE t.phase_slug='pos_venda' AND t.status_comercial != 'perdido') AS em_andamento,
               COUNT(*) FILTER (WHERE t.status_comercial='ganho') AS concluidos
          FROM _ww2_t t
          LEFT JOIN profiles pr ON pr.id = t.pos_owner_id
         WHERE t.pos_owner_id IS NOT NULL
           AND (p_consultor_ids IS NULL OR t.pos_owner_id = ANY(p_consultor_ids))
         GROUP BY t.pos_owner_id, pr.nome
        HAVING COUNT(*) >= 1
    ) planner;

    DROP TABLE _ww2_t;
    RETURN json_build_object(
        'sdr', COALESCE(v_sdr, '[]'::JSON),
        'closer', COALESCE(v_closer, '[]'::JSON),
        'planner', COALESCE(v_planner, '[]'::JSON)
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_team_performance(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ============================================================================
-- ww2_lead_quality: distribuições + cruzamentos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ww2_lead_quality(
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
    v_faixa_dist JSON; v_conv_dist JSON; v_destino_dist JSON;
    v_faixa_conv JSON; v_destino_conv JSON; v_origem_faixa JSON;
    v_ideal JSON;
BEGIN
    CREATE TEMP TABLE _ww2_q ON COMMIT DROP AS
    SELECT c.id, c.status_comercial,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_convidados(c.produto_data->>'ww_mkt_convidados_form') AS convidados,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino,
           c.produto_data->>'ww_tipo_casamento' AS tipo,
           _ww2_norm_origem(c.marketing_data) AS origem,
           ph.slug AS phase_slug,
           (c.status_comercial='ganho' OR ph.slug='pos_venda') AS fechado
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_q WHERE origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_q WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_q WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_q WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    -- Distribuições simples
    SELECT json_agg(json_build_object('label', faixa, 'qtd', qtd, 'pct', pct) ORDER BY qtd DESC) INTO v_faixa_dist
    FROM (SELECT faixa, COUNT(*) AS qtd, ROUND(100.0*COUNT(*)/NULLIF(SUM(COUNT(*)) OVER(),0),1) AS pct
          FROM _ww2_q WHERE faixa IS NOT NULL GROUP BY faixa) x;

    SELECT json_agg(json_build_object('label', convidados, 'qtd', qtd, 'pct', pct) ORDER BY qtd DESC) INTO v_conv_dist
    FROM (SELECT convidados, COUNT(*) AS qtd, ROUND(100.0*COUNT(*)/NULLIF(SUM(COUNT(*)) OVER(),0),1) AS pct
          FROM _ww2_q WHERE convidados IS NOT NULL GROUP BY convidados) x;

    SELECT json_agg(json_build_object('label', destino, 'qtd', qtd, 'pct', pct) ORDER BY qtd DESC) INTO v_destino_dist
    FROM (SELECT destino, COUNT(*) AS qtd, ROUND(100.0*COUNT(*)/NULLIF(SUM(COUNT(*)) OVER(),0),1) AS pct
          FROM _ww2_q WHERE destino IS NOT NULL GROUP BY destino ORDER BY COUNT(*) DESC LIMIT 15) x;

    -- Cruzamento faixa × conversão
    SELECT json_agg(json_build_object('faixa', faixa, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_faixa_conv
    FROM (SELECT faixa, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_q WHERE faixa IS NOT NULL GROUP BY faixa) x;

    -- Cruzamento destino × conversão
    SELECT json_agg(json_build_object('destino', destino, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_destino_conv
    FROM (SELECT destino, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_q WHERE destino IS NOT NULL GROUP BY destino HAVING COUNT(*)>=5 ORDER BY COUNT(*) DESC LIMIT 10) x;

    -- Cruzamento origem × faixa (matriz)
    SELECT json_agg(json_build_object('origem', origem, 'faixa', faixa, 'qtd', qtd)) INTO v_origem_faixa
    FROM (SELECT origem, faixa, COUNT(*) AS qtd
          FROM _ww2_q WHERE origem IS NOT NULL AND faixa IS NOT NULL
          GROUP BY origem, faixa ORDER BY COUNT(*) DESC LIMIT 50) x;

    -- "Perfil ideal" — quais valores aparecem mais nos fechados
    SELECT json_build_object(
        'faixa_top', (SELECT faixa FROM _ww2_q WHERE fechado AND faixa IS NOT NULL GROUP BY faixa ORDER BY COUNT(*) DESC LIMIT 1),
        'convidados_top', (SELECT convidados FROM _ww2_q WHERE fechado AND convidados IS NOT NULL GROUP BY convidados ORDER BY COUNT(*) DESC LIMIT 1),
        'destino_top', (SELECT destino FROM _ww2_q WHERE fechado AND destino IS NOT NULL GROUP BY destino ORDER BY COUNT(*) DESC LIMIT 1),
        'origem_top', (SELECT origem FROM _ww2_q WHERE fechado AND origem IS NOT NULL GROUP BY origem ORDER BY COUNT(*) DESC LIMIT 1),
        'total_fechados', (SELECT COUNT(*) FROM _ww2_q WHERE fechado)
    ) INTO v_ideal;

    DROP TABLE _ww2_q;
    RETURN json_build_object(
        'distribuicoes', json_build_object(
            'faixa', COALESCE(v_faixa_dist, '[]'::JSON),
            'convidados', COALESCE(v_conv_dist, '[]'::JSON),
            'destino', COALESCE(v_destino_dist, '[]'::JSON)
        ),
        'cruzamentos', json_build_object(
            'faixa_conv', COALESCE(v_faixa_conv, '[]'::JSON),
            'destino_conv', COALESCE(v_destino_conv, '[]'::JSON),
            'origem_faixa', COALESCE(v_origem_faixa, '[]'::JSON)
        ),
        'perfil_ideal', v_ideal
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_lead_quality(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ============================================================================
-- ww2_marketing: análise por UTM source/campaign/medium
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ww2_marketing(
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
    v_por_origem JSON; v_por_campaign JSON; v_por_medium JSON; v_funil_origem JSON;
BEGIN
    CREATE TEMP TABLE _ww2_m ON COMMIT DROP AS
    SELECT c.id, c.status_comercial, c.created_at, c.ganho_sdr_at, c.valor_final,
           _ww2_norm_origem(c.marketing_data) AS origem,
           COALESCE(c.marketing_data->>'utm_campaign', c.marketing_data->'card'->>'utm_campaign', 'Desconhecida') AS campaign,
           COALESCE(c.marketing_data->>'utm_medium', c.marketing_data->'card'->>'utm_medium', 'Desconhecido') AS medium,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino,
           c.produto_data->>'ww_tipo_casamento' AS tipo,
           ph.slug AS phase_slug,
           (c.status_comercial='ganho' OR ph.slug='pos_venda') AS fechado
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_m WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_m WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_m WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    SELECT json_agg(json_build_object(
        'origem', origem, 'leads', leads, 'qualificados', qualif, 'fechados', fechados,
        'taxa_qualif', taxa_q, 'taxa_fechamento', taxa_f, 'ticket_medio', ticket,
        'tempo_qualif_medio_dias', tempo_q
    ) ORDER BY leads DESC) INTO v_por_origem
    FROM (SELECT origem,
                 COUNT(*) AS leads,
                 COUNT(*) FILTER (WHERE ganho_sdr_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE ganho_sdr_at IS NOT NULL)/COUNT(*),1) ELSE 0 END AS taxa_q,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa_f,
                 ROUND(COALESCE(AVG(valor_final) FILTER (WHERE fechado AND valor_final>0), 0)::NUMERIC, 0) AS ticket,
                 ROUND(AVG(EXTRACT(EPOCH FROM (ganho_sdr_at - created_at))/86400) FILTER (WHERE ganho_sdr_at IS NOT NULL)::NUMERIC, 1) AS tempo_q
          FROM _ww2_m
         WHERE (p_origins IS NULL OR origem = ANY(p_origins))
         GROUP BY origem) x;

    SELECT json_agg(json_build_object('campaign', campaign, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_por_campaign
    FROM (SELECT campaign, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_m WHERE campaign != 'Desconhecida' GROUP BY campaign ORDER BY COUNT(*) DESC LIMIT 15) x;

    SELECT json_agg(json_build_object('medium', medium, 'leads', leads, 'fechados', fechados) ORDER BY leads DESC) INTO v_por_medium
    FROM (SELECT medium, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados
          FROM _ww2_m WHERE medium != 'Desconhecido' GROUP BY medium ORDER BY COUNT(*) DESC LIMIT 10) x;

    -- Funil por origem (top 5): novo → qualificado → fechado
    SELECT json_agg(json_build_object('origem', origem, 'novo', novo, 'qualificado', qualif, 'fechado', fechado)) INTO v_funil_origem
    FROM (SELECT origem,
                 COUNT(*) AS novo,
                 COUNT(*) FILTER (WHERE ganho_sdr_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechado
          FROM _ww2_m GROUP BY origem ORDER BY COUNT(*) DESC LIMIT 5) x;

    DROP TABLE _ww2_m;
    RETURN json_build_object(
        'por_origem', COALESCE(v_por_origem, '[]'::JSON),
        'por_campaign', COALESCE(v_por_campaign, '[]'::JSON),
        'por_medium', COALESCE(v_por_medium, '[]'::JSON),
        'funil_origem', COALESCE(v_funil_origem, '[]'::JSON)
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_marketing(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ============================================================================
-- ww2_loss_reasons: motivos de perda + cruzamentos + tendência
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ww2_loss_reasons(
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
    v_sdr JSON; v_closer JSON; v_motivo_faixa JSON; v_tendencia JSON;
BEGIN
    CREATE TEMP TABLE _ww2_l ON COMMIT DROP AS
    SELECT c.id, c.created_at, c.status_comercial,
           c.produto_data->>'ww_motivo_perda_sdr' AS motivo_sdr,
           c.produto_data->>'ww_motivo_perda_closer' AS motivo_closer,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino,
           _ww2_norm_origem(c.marketing_data) AS origem,
           c.produto_data->>'ww_tipo_casamento' AS tipo
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_l WHERE origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_l WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_l WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_l WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_sdr
    FROM (SELECT motivo_sdr AS motivo, COUNT(*) AS qtd FROM _ww2_l WHERE motivo_sdr IS NOT NULL GROUP BY motivo_sdr ORDER BY COUNT(*) DESC LIMIT 12) x;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_closer
    FROM (SELECT motivo_closer AS motivo, COUNT(*) AS qtd FROM _ww2_l WHERE motivo_closer IS NOT NULL GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 12) x;

    -- Motivo (closer) × Faixa
    SELECT json_agg(json_build_object('motivo', motivo, 'faixa', faixa, 'qtd', qtd)) INTO v_motivo_faixa
    FROM (SELECT motivo_closer AS motivo, faixa, COUNT(*) AS qtd
          FROM _ww2_l WHERE motivo_closer IS NOT NULL AND faixa IS NOT NULL
          GROUP BY motivo_closer, faixa ORDER BY COUNT(*) DESC LIMIT 40) x;

    -- Tendência mensal (top 5 motivos closer)
    WITH top_motivos AS (
        SELECT motivo_closer AS motivo FROM _ww2_l WHERE motivo_closer IS NOT NULL
        GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 5
    )
    SELECT json_agg(json_build_object('mes', mes, 'motivo', motivo, 'qtd', qtd) ORDER BY mes, qtd DESC) INTO v_tendencia
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', l.created_at), 'YYYY-MM') AS mes,
                 l.motivo_closer AS motivo, COUNT(*) AS qtd
          FROM _ww2_l l
         WHERE l.motivo_closer IN (SELECT motivo FROM top_motivos)
         GROUP BY DATE_TRUNC('month', l.created_at), l.motivo_closer) x;

    DROP TABLE _ww2_l;
    RETURN json_build_object(
        'motivos_sdr', COALESCE(v_sdr, '[]'::JSON),
        'motivos_closer', COALESCE(v_closer, '[]'::JSON),
        'motivo_faixa', COALESCE(v_motivo_faixa, '[]'::JSON),
        'tendencia', COALESCE(v_tendencia, '[]'::JSON)
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ============================================================================
-- ww2_drill_down: lista de cards filtrada (drawer)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ww2_drill_down(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_stage_id   UUID DEFAULT NULL,
    p_phase_slug TEXT DEFAULT NULL,
    p_status     TEXT DEFAULT NULL,   -- 'aberto' | 'ganho' | 'perdido' | 'fechado_efetivo'
    p_faixa      TEXT DEFAULT NULL,
    p_destino    TEXT DEFAULT NULL,
    p_origem     TEXT DEFAULT NULL,
    p_consultor_id UUID DEFAULT NULL,
    p_motivo_perda TEXT DEFAULT NULL,
    p_limit      INT DEFAULT 50,
    p_offset     INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_total INT;
    v_rows JSON;
BEGIN
    CREATE TEMP TABLE _ww2_d ON COMMIT DROP AS
    SELECT c.id, c.titulo, c.created_at, c.updated_at, c.valor_estimado, c.valor_final,
           c.status_comercial, c.dono_atual_id,
           s.nome AS stage_name, COALESCE(ph.label, ph.name) AS phase_label, ph.slug AS phase_slug,
           pr.nome AS dono_nome,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino,
           _ww2_norm_origem(c.marketing_data) AS origem,
           c.produto_data->>'ww_motivo_perda_sdr' AS motivo_sdr,
           c.produto_data->>'ww_motivo_perda_closer' AS motivo_closer,
           EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
      LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_stage_id IS NOT NULL THEN DELETE FROM _ww2_d WHERE id NOT IN (SELECT id FROM _ww2_d t JOIN cards c2 ON c2.id=t.id WHERE c2.pipeline_stage_id = p_stage_id); END IF;
    IF p_phase_slug IS NOT NULL THEN DELETE FROM _ww2_d WHERE phase_slug != p_phase_slug; END IF;
    IF p_status IS NOT NULL THEN
        IF p_status = 'fechado_efetivo' THEN
            DELETE FROM _ww2_d WHERE NOT (status_comercial='ganho' OR phase_slug='pos_venda');
        ELSE
            DELETE FROM _ww2_d WHERE status_comercial != p_status OR status_comercial IS NULL;
        END IF;
    END IF;
    IF p_faixa IS NOT NULL THEN DELETE FROM _ww2_d WHERE faixa IS NULL OR faixa != p_faixa; END IF;
    IF p_destino IS NOT NULL THEN DELETE FROM _ww2_d WHERE destino IS NULL OR destino != p_destino; END IF;
    IF p_origem IS NOT NULL THEN DELETE FROM _ww2_d WHERE origem != p_origem; END IF;
    IF p_consultor_id IS NOT NULL THEN DELETE FROM _ww2_d WHERE dono_atual_id != p_consultor_id; END IF;
    IF p_motivo_perda IS NOT NULL THEN DELETE FROM _ww2_d WHERE motivo_sdr != p_motivo_perda AND motivo_closer != p_motivo_perda; END IF;

    SELECT COUNT(*) INTO v_total FROM _ww2_d;

    SELECT json_agg(row_to_json(t)) INTO v_rows FROM (
        SELECT id, titulo, created_at, updated_at, valor_estimado, valor_final,
               status_comercial, stage_name, phase_label, dono_nome,
               faixa, destino, origem, dias_parado,
               COALESCE(motivo_sdr, motivo_closer) AS motivo_perda
          FROM _ww2_d
         ORDER BY created_at DESC
         LIMIT p_limit OFFSET p_offset
    ) t;

    DROP TABLE _ww2_d;
    RETURN json_build_object(
        'total', v_total,
        'limit', p_limit,
        'offset', p_offset,
        'rows', COALESCE(v_rows, '[]'::JSON)
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_drill_down(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INT, INT) TO authenticated;

-- ============================================================================
-- ww2_filter_options: lista as opções disponíveis pra cada filtro
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ww2_filter_options(
    p_org_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_origens JSON; v_faixas JSON; v_destinos JSON; v_tipos JSON; v_consultores JSON;
BEGIN
    SELECT json_agg(DISTINCT origem) INTO v_origens
    FROM (SELECT _ww2_norm_origem(c.marketing_data) AS origem FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id AND c.archived_at IS NULL) x
    WHERE origem IS NOT NULL;

    SELECT json_agg(DISTINCT faixa) INTO v_faixas
    FROM (SELECT _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id AND c.archived_at IS NULL) x
    WHERE faixa IS NOT NULL;

    SELECT json_agg(DISTINCT destino) INTO v_destinos
    FROM (SELECT _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id AND c.archived_at IS NULL) x
    WHERE destino IS NOT NULL;

    SELECT json_agg(DISTINCT tipo) INTO v_tipos
    FROM (SELECT c.produto_data->>'ww_tipo_casamento' AS tipo FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id AND c.archived_at IS NULL) x
    WHERE tipo IS NOT NULL;

    -- Consultores via org_members (regra do projeto)
    SELECT json_agg(json_build_object('id', user_id, 'nome', nome) ORDER BY nome) INTO v_consultores
    FROM (SELECT DISTINCT om.user_id, pr.nome
          FROM org_members om
          JOIN profiles pr ON pr.id = om.user_id
          WHERE om.org_id = v_org_id AND COALESCE(pr.active, TRUE) != FALSE) x;

    RETURN json_build_object(
        'origens', COALESCE(v_origens, '[]'::JSON),
        'faixas', COALESCE(v_faixas, '[]'::JSON),
        'destinos', COALESCE(v_destinos, '[]'::JSON),
        'tipos', COALESCE(v_tipos, '[]'::JSON),
        'consultores', COALESCE(v_consultores, '[]'::JSON)
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_filter_options(UUID) TO authenticated;
