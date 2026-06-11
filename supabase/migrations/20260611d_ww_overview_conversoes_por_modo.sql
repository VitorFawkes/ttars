-- 20260611d — ww2_overview v7: "Conversão entre fases" passa a seguir o MODO escolhido na barra
--
-- Pedido do Vitor (aprovado 2026-06-11): na Visão geral, os cartões de cima seguem o modo
-- (Leads do período × O que aconteceu no período) mas a "Conversão entre fases" era SEMPRE
-- por safra — duas réguas lado a lado sem aviso, números "não conversavam" (print dele).
--
-- Agora v_conv respeita p_date_mode:
--   • cohort (Leads do período): safra — leads criados no período e até onde ELES chegaram
--     (marcos cumulativos; mesma régua do funil v1). Comportamento atual mantido.
--   • throughput (O que aconteceu no período): eventos dentro da janela, MESMA régua dos
--     cartões — Entrou=criados; Marcou 1ª=agendamento SDR na janela; Fez 1ª=fez com
--     agendamento na janela; Marcou closer=agendamento closer na janela; Fez closer=fez com
--     agendamento na janela; Ganhou=ganho na janela. Taxa = razão entre etapas consecutivas.
--
-- REBASE conferido (TOP-5 #5): base = 20260611b (v6, escrita e promovida HOJE nesta mesma
-- sessão; cadeia anterior 20260602r→611a→611b toda relida). Única mudança: o bloco v_conv.
-- Mesma assinatura → DROP+CREATE (padrão da casa pra recriação revisada).

DROP FUNCTION IF EXISTS public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]);

CREATE FUNCTION public.ww2_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_convidados   TEXT[] DEFAULT NULL,
    p_sdr_canal    TEXT[] DEFAULT NULL,
    p_closer_canal TEXT[] DEFAULT NULL
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
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_pool ON COMMIT DROP AS
    SELECT ac_deal_id, card_id, data_entrada AS created_at, status_comercial, valor_final,
           sdr_owner_id, vendas_owner_id, pos_owner_id, dono_atual_id,
           faixa, convidados, destino, tipo, origem,
           _ww_norm_canal_strict(sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(closer_canal) AS canal_closer,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho,
           sdr_agendou_at, closer_agendou_at, ganho_at
      FROM vw_ww_funnel_base;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_pool WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_pool WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww2_pool WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww2_pool WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_pool WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww2_pool
         WHERE (sdr_owner_id IS NULL OR sdr_owner_id != ALL(p_consultor_ids))
            AND (vendas_owner_id IS NULL OR vendas_owner_id != ALL(p_consultor_ids))
            AND (pos_owner_id IS NULL OR pos_owner_id != ALL(p_consultor_ids))
            AND (dono_atual_id IS NULL OR dono_atual_id != ALL(p_consultor_ids));
    END IF;

    IF p_date_mode = 'throughput' THEN
        WITH base AS (
            SELECT
                COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end) AS leads,
                COUNT(*) FILTER (WHERE created_at >= v_prev_start AND created_at <  v_prev_end) AS leads_prev,
                COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at BETWEEN p_date_start AND p_date_end) AS reunioes,
                COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at BETWEEN v_prev_start AND v_prev_end) AS reunioes_prev,
                COUNT(*) FILTER (WHERE marcou_closer AND closer_agendou_at BETWEEN p_date_start AND p_date_end) AS propostas,
                COUNT(*) FILTER (WHERE marcou_closer AND closer_agendou_at BETWEEN v_prev_start AND v_prev_end) AS propostas_prev,
                COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN p_date_start AND p_date_end) AS fechados,
                COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN v_prev_start AND v_prev_end) AS fechados_prev
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
            'leads',          (SELECT COUNT(*) FROM cohort),
            'leads_prev',     (SELECT COUNT(*) FROM cohort_prev),
            'reunioes',       (SELECT COUNT(*) FROM cohort WHERE fez_sdr),
            'reunioes_prev',  (SELECT COUNT(*) FROM cohort_prev WHERE fez_sdr),
            'propostas',      (SELECT COUNT(*) FROM cohort WHERE marcou_closer),
            'propostas_prev', (SELECT COUNT(*) FROM cohort_prev WHERE marcou_closer),
            'fechados',       (SELECT COUNT(*) FROM cohort WHERE ganho),
            'fechados_prev',  (SELECT COUNT(*) FROM cohort_prev WHERE ganho),
            'ticket_medio',   (SELECT ROUND(COALESCE(AVG(valor_final) FILTER (WHERE ganho AND valor_final > 0), 0)::NUMERIC, 0) FROM cohort),
            'receita',        (SELECT ROUND(COALESCE(SUM(valor_final) FILTER (WHERE ganho), 0)::NUMERIC, 0) FROM cohort)
        ) INTO v_kpis;
    END IF;

    -- FUNIL — 100% Active: deals da vw_ww_funnel_base por marco.
    SELECT json_agg(json_build_object(
        'phase_label', phase_label, 'phase_order', phase_order, 'phase_slug', phase_slug,
        'stage_id', stage_id, 'stage_name', stage_name, 'stage_order', stage_order,
        'stage_active', stage_active, 'is_won', is_won, 'is_lost', is_lost,
        'leads_count', leads_count
    ) ORDER BY phase_order) INTO v_funnel
    FROM (
        SELECT 'SDR (Pré-Venda)'::TEXT AS phase_label, 1 AS phase_order, 'sdr'::TEXT AS phase_slug,
               NULL::UUID AS stage_id, NULL::TEXT AS stage_name, 1 AS stage_order,
               TRUE AS stage_active, FALSE AS is_won, FALSE AS is_lost,
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND NOT ganho AND NOT marcou_closer AND NOT fez_closer)::INT AS leads_count
          FROM _ww2_pool
        UNION ALL
        SELECT 'Closer', 2, 'closer', NULL::UUID, NULL::TEXT, 1, TRUE, FALSE, FALSE,
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND NOT ganho AND (marcou_closer OR fez_closer))::INT
          FROM _ww2_pool
        UNION ALL
        SELECT 'Pós-Venda', 3, 'pos_venda', NULL::UUID, NULL::TEXT, 1, TRUE, TRUE, FALSE,
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND ganho)::INT
          FROM _ww2_pool
    ) sc;

    -- CONVERSÃO ENTRE FASES — v7: segue o MODO escolhido (mesma régua dos cartões).
    IF p_date_mode = 'throughput' THEN
        -- Eventos DENTRO da janela, etapa a etapa (taxa = razão entre etapas consecutivas).
        WITH m AS (
            SELECT COUNT(*) FILTER (WHERE created_at BETWEEN p_date_start AND p_date_end) AS entrou,
                   COUNT(*) FILTER (WHERE sdr_agendou_at BETWEEN p_date_start AND p_date_end) AS marcou_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at BETWEEN p_date_start AND p_date_end) AS fez_sdr,
                   COUNT(*) FILTER (WHERE closer_agendou_at BETWEEN p_date_start AND p_date_end) AS marcou_closer,
                   COUNT(*) FILTER (WHERE fez_closer AND closer_agendou_at BETWEEN p_date_start AND p_date_end) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN p_date_start AND p_date_end) AS ganho
              FROM _ww2_pool
        ),
        passos AS (
            SELECT t.* FROM m,
            LATERAL (VALUES
                ('Entrou'::TEXT,      1, m.entrou,        NULL::NUMERIC),
                ('Marcou 1ª reunião', 2, m.marcou_sdr,    CASE WHEN m.entrou        > 0 THEN ROUND(100.0*m.marcou_sdr/m.entrou, 1) END),
                ('Fez 1ª reunião',    3, m.fez_sdr,       CASE WHEN m.marcou_sdr    > 0 THEN ROUND(100.0*m.fez_sdr/m.marcou_sdr, 1) END),
                ('Marcou closer',     4, m.marcou_closer, CASE WHEN m.fez_sdr       > 0 THEN ROUND(100.0*m.marcou_closer/m.fez_sdr, 1) END),
                ('Fez closer',        5, m.fez_closer,    CASE WHEN m.marcou_closer > 0 THEN ROUND(100.0*m.fez_closer/m.marcou_closer, 1) END),
                ('Ganhou',            6, m.ganho,         CASE WHEN m.fez_closer    > 0 THEN ROUND(100.0*m.ganho/m.fez_closer, 1) END)
            ) AS t(phase_label, phase_order, leads, taxa)
            WHERE m.entrou > 0 OR m.marcou_sdr > 0 OR m.ganho > 0
        )
        SELECT COALESCE(json_agg(json_build_object(
            'phase_label', phase_label, 'phase_order', phase_order,
            'leads', leads, 'taxa_vs_anterior', taxa
        ) ORDER BY phase_order), '[]'::JSON) INTO v_conv
        FROM passos;
    ELSE
        -- Safra: leads criados no período, marcos CUMULATIVOS (até onde ELES chegaram).
        WITH cohort AS (
            SELECT * FROM _ww2_pool WHERE created_at >= p_date_start AND created_at <= p_date_end
        ),
        m AS (
            SELECT COUNT(*) AS entrou,
                   COUNT(*) FILTER (WHERE marcou_sdr OR fez_sdr OR marcou_closer OR fez_closer OR ganho) AS marcou_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr OR marcou_closer OR fez_closer OR ganho) AS fez_sdr,
                   COUNT(*) FILTER (WHERE marcou_closer OR fez_closer OR ganho) AS marcou_closer,
                   COUNT(*) FILTER (WHERE fez_closer OR ganho) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho) AS ganho
              FROM cohort
        ),
        passos AS (
            SELECT t.* FROM m,
            LATERAL (VALUES
                ('Entrou'::TEXT,      1, m.entrou,        NULL::NUMERIC),
                ('Marcou 1ª reunião', 2, m.marcou_sdr,    CASE WHEN m.entrou        > 0 THEN ROUND(100.0*m.marcou_sdr/m.entrou, 1) END),
                ('Fez 1ª reunião',    3, m.fez_sdr,       CASE WHEN m.marcou_sdr    > 0 THEN ROUND(100.0*m.fez_sdr/m.marcou_sdr, 1) END),
                ('Marcou closer',     4, m.marcou_closer, CASE WHEN m.fez_sdr       > 0 THEN ROUND(100.0*m.marcou_closer/m.fez_sdr, 1) END),
                ('Fez closer',        5, m.fez_closer,    CASE WHEN m.marcou_closer > 0 THEN ROUND(100.0*m.fez_closer/m.marcou_closer, 1) END),
                ('Ganhou',            6, m.ganho,         CASE WHEN m.fez_closer    > 0 THEN ROUND(100.0*m.ganho/m.fez_closer, 1) END)
            ) AS t(phase_label, phase_order, leads, taxa)
            WHERE m.entrou > 0
        )
        SELECT COALESCE(json_agg(json_build_object(
            'phase_label', phase_label, 'phase_order', phase_order,
            'leads', leads, 'taxa_vs_anterior', taxa
        ) ORDER BY phase_order), '[]'::JSON) INTO v_conv
        FROM passos;
    END IF;

    -- Alertas — cards ABERTOS do recorte filtrado, parados > 7 dias, top 8.
    SELECT COALESCE(json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'stage_name', stage_name,
        'phase_label', phase_label, 'dias_parado', dias_parado, 'valor_estimado', valor_estimado
    ) ORDER BY dias_parado DESC), '[]'::JSON) INTO v_alertas
    FROM (
        SELECT c.id AS card_id, c.titulo,
               COALESCE(s.nome, '—') AS stage_name,
               COALESCE(ph.label, ph.name, '—') AS phase_label,
               EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado,
               c.valor_estimado
          FROM cards c
          LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
          LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE c.id IN (SELECT card_id FROM _ww2_pool WHERE card_id IS NOT NULL)
           AND (c.status_comercial IS NULL OR c.status_comercial NOT IN ('ganho','perdido'))
           AND COALESCE(ph.slug,'') NOT IN ('resolucao','pos_venda')
           AND GREATEST(c.updated_at, c.created_at) < NOW() - INTERVAL '7 days'
         ORDER BY EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at)) DESC
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
        'alertas', COALESCE(v_alertas, '[]'::JSON),
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v7 — conversões seguem o modo escolhido)'
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww2_overview IS
  'Overview Weddings — KPIs + funil 100% Active. v7: Conversão entre fases segue p_date_mode (safra cumulativa OU eventos no período — mesma régua dos KPIs).';
