-- 20260602r — ww2_overview: o gráfico de funil deixa de contar CARDS do CRM por etapa
-- e passa a contar DEALS do Active (marcos da vw_ww_funnel_base), em 3 fases.
--
-- VERIFICAÇÃO REBASE (TOP 5 #5): esta def PARTE da 20260528o (def mais recente, pool já
-- em vw_ww_funnel_base/cache). 20260528n era a versão ANTIGA baseada em `FROM cards c`,
-- já superada por 528o. 525e mais antiga ainda. Nenhuma correção é revertida — só o bloco
-- do funil muda (cards→Active). KPIs/conversões/alertas/assinatura idênticos a 528o.
--
-- Mapeamento "até onde o lead chegou" (exclusivo, soma = total):
--   SDR (Pré-Venda) = entrou e NÃO avançou pro Closer e NÃO ganhou
--   Closer          = chegou ao Closer (agendou/fez) e NÃO ganhou
--   Pós-Venda       = ganho
-- Sem balde "Resolução": o Active não tem flag de perdido (limitação conhecida do cache).
-- O frontend agrega por phase_label e separa Resolução (que aqui fica 0) — visual estável (3 barras).

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
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_pool ON COMMIT DROP AS
    SELECT ac_deal_id, card_id, data_entrada AS created_at, status_comercial, valor_final,
           sdr_owner_id, vendas_owner_id, pos_owner_id, dono_atual_id,
           faixa, convidados, destino, tipo, origem,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho,
           sdr_agendou_at, closer_agendou_at, ganho_at
      FROM vw_ww_funnel_base;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_pool WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
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

    -- FUNIL — agora 100% Active: deals da vw_ww_funnel_base por marco (não mais cards do CRM).
    -- Cohort: leads criados no período, classificados pela fase mais avançada que alcançaram.
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

    v_conv := '[]'::JSON;
    v_alertas := '[]'::JSON;

    DROP TABLE _ww2_pool;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'prev_start', v_prev_start, 'prev_end', v_prev_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'conversoes', v_conv,
        'alertas', v_alertas,
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v4 — funil por marco Active)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

COMMENT ON FUNCTION public.ww2_overview IS
  'Overview Weddings — KPIs + funil 100% Active (vw_ww_funnel_base / cache AC). Funil por marco (SDR/Closer/Pos-Venda), nao mais contagem de cards do CRM por etapa.';
