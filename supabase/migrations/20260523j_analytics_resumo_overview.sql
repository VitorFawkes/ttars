-- analytics_resumo_overview: RPC unificada pra hub Resumo.
-- Retorna 5 blocos:
--   A. Empresa  — receita, ticket, ganhos, conversão geral, sparklines 12m
--   B. Por Time — KPIs por fase (SDR/Planner/Pós) + tarefas feitas/faltando
--   C. Por Tipo — origem, destino, faixa de valor, novo vs repeat
--   D. Operação — funil atual snapshot, conversão por etapa, tempo médio em cada
--   E. Previsão — forecast usando orcamento + data_prevista_fechamento

CREATE OR REPLACE FUNCTION public.analytics_resumo_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_result JSONB;
BEGIN
    WITH
    -- BLOCO A: Empresa
    cards_ganhos_periodo AS (
        SELECT c.*
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.data_fechamento >= p_date_start
          AND c.data_fechamento < p_date_end
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    leads_periodo AS (
        SELECT c.*
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.created_at >= p_date_start AND c.created_at < p_date_end
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    kpis_empresa AS (
        SELECT
            COUNT(*)::BIGINT AS ganhos,
            COALESCE(SUM(valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(receita), 0)::NUMERIC AS receita,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(COALESCE(SUM(valor_final), 0) / COUNT(*), 0)
                 ELSE 0 END::NUMERIC AS ticket_medio,
            (SELECT COUNT(*) FROM leads_periodo)::BIGINT AS leads_entrada,
            CASE WHEN (SELECT COUNT(*) FROM leads_periodo) > 0
                 THEN ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM leads_periodo) * 100, 1)
                 ELSE 0 END AS conversao_geral
        FROM cards_ganhos_periodo
    ),
    sparkline_12m AS (
        SELECT
            DATE_TRUNC('month', c.data_fechamento)::DATE AS mes,
            COUNT(*)::BIGINT AS ganhos,
            COALESCE(SUM(c.valor_final), 0)::NUMERIC AS faturamento
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.data_fechamento >= DATE_TRUNC('month', NOW() - INTERVAL '11 months')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
        GROUP BY 1
        ORDER BY 1
    ),

    -- BLOCO B: Por Time (SDR / Planner / Pós-venda)
    cards_open AS (
        SELECT c.*, pp.slug AS phase_slug
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    por_time AS (
        SELECT
            cardo.phase_slug AS fase,
            COUNT(*)::BIGINT AS cards_abertos,
            COALESCE(SUM(COALESCE(cardo.valor_final, cardo.valor_estimado, 0)), 0)::NUMERIC AS valor_pipeline
        FROM cards_open cardo
        GROUP BY 1
        ORDER BY
            CASE cardo.phase_slug
                WHEN 'sdr' THEN 1
                WHEN 'planner' THEN 2
                WHEN 'pos_venda' THEN 3
                ELSE 99
            END
    ),
    tarefas_time AS (
        SELECT
            pp.slug AS fase,
            COUNT(*) FILTER (WHERE t.concluida = true)::BIGINT AS feitas,
            COUNT(*) FILTER (WHERE t.concluida = false AND t.data_vencimento IS NOT NULL AND t.data_vencimento < NOW())::BIGINT AS vencidas,
            COUNT(*) FILTER (WHERE t.concluida = false AND (t.data_vencimento IS NULL OR t.data_vencimento >= NOW()))::BIGINT AS pendentes
        FROM tarefas t
        JOIN cards c ON c.id = t.card_id
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE t.org_id = v_org
          AND t.deleted_at IS NULL
          AND t.created_at >= p_date_start AND t.created_at < p_date_end
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
        GROUP BY 1
    ),

    -- BLOCO C: Por Tipo
    por_origem AS (
        SELECT
            COALESCE(c.origem::TEXT, 'sem_origem') AS origem,
            COUNT(*)::BIGINT AS leads,
            COUNT(*) FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento >= p_date_start AND c.data_fechamento < p_date_end)::BIGINT AS ganhos,
            COALESCE(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho' AND c.data_fechamento >= p_date_start AND c.data_fechamento < p_date_end), 0)::NUMERIC AS faturamento
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.created_at >= p_date_start AND c.created_at < p_date_end
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
        GROUP BY 1
        ORDER BY faturamento DESC, leads DESC
    ),

    -- BLOCO D: Operação (snapshot funil + tempo médio por etapa)
    snapshot_fases AS (
        SELECT
            cardo.phase_slug AS fase,
            COUNT(*)::BIGINT AS qtd
        FROM cards_open cardo
        GROUP BY 1
    ),

    -- BLOCO E: Previsão (forecast)
    forecast AS (
        SELECT
            COUNT(*) FILTER (WHERE (c.produto_data->>'data_prevista_fechamento')::DATE BETWEEN p_date_start::DATE AND p_date_end::DATE)::BIGINT AS qtd_prevista,
            COALESCE(SUM(NULLIF(c.produto_data->>'orcamento', '')::NUMERIC)
                FILTER (WHERE (c.produto_data->>'data_prevista_fechamento')::DATE BETWEEN p_date_start::DATE AND p_date_end::DATE), 0)::NUMERIC AS valor_previsto,
            COUNT(*) FILTER (WHERE
                (c.produto_data->>'data_prevista_fechamento')::DATE >= NOW()::DATE
                AND (c.produto_data->>'data_prevista_fechamento')::DATE < (NOW() + INTERVAL '7 days')::DATE
            )::BIGINT AS qtd_prox_7d,
            COALESCE(SUM(NULLIF(c.produto_data->>'orcamento', '')::NUMERIC)
                FILTER (WHERE
                    (c.produto_data->>'data_prevista_fechamento')::DATE >= NOW()::DATE
                    AND (c.produto_data->>'data_prevista_fechamento')::DATE < (NOW() + INTERVAL '7 days')::DATE
                ), 0)::NUMERIC AS valor_prox_7d
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'aberto'
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND c.produto_data->>'data_prevista_fechamento' IS NOT NULL
          AND TRIM(c.produto_data->>'data_prevista_fechamento') != ''
    )

    SELECT jsonb_build_object(
        'empresa', jsonb_build_object(
            'kpis', (SELECT row_to_json(k.*) FROM kpis_empresa k),
            'sparkline', COALESCE((SELECT jsonb_agg(row_to_json(s.*)) FROM sparkline_12m s), '[]'::jsonb)
        ),
        'por_time', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM por_time p), '[]'::jsonb),
        'tarefas_time', COALESCE((SELECT jsonb_agg(row_to_json(t.*)) FROM tarefas_time t), '[]'::jsonb),
        'por_origem', COALESCE((SELECT jsonb_agg(row_to_json(o.*)) FROM por_origem o), '[]'::jsonb),
        'snapshot_fases', COALESCE((SELECT jsonb_agg(row_to_json(s.*)) FROM snapshot_fases s), '[]'::jsonb),
        'forecast', (SELECT row_to_json(f.*) FROM forecast f)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_resumo_overview TO authenticated;
