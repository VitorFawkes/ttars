-- ════════════════════════════════════════════════════════════════════════
-- Lente temporal (cohort ↔ atividade) nas RPCs executivas: Resumo + Financeiro
--
-- Adiciona p_date_ref TEXT DEFAULT 'stage' (no FIM da assinatura → chamadas
-- antigas de 3 args continuam válidas e com comportamento IDÊNTICO ao atual).
--   • 'stage'   (DEFAULT) = POR ATIVIDADE: ganhos contados pela data_fechamento
--                no período (o que FECHOU na janela). Comportamento histórico.
--   • 'created' = POR SAFRA (cohort): ganhos da turma de cards CRIADOS no período,
--                independente de quando fecharam.
--
-- Padrão idêntico ao funil v3 (p_date_ref) e ao ww2 (p_date_mode). Só a CTE de
-- população de ganhos muda; todo o resto (helpers, série 12m, forecast/pendente,
-- por_origem/por_consultor, grants) é preservado verbatim das versões vigentes:
--   • analytics_resumo_overview     → 20260523k_resumo_overview_fix_orcamento_jsonb.sql
--   • analytics_financeiro_overview → 20260530h_analytics_org_isolation_safe_casts.sql (cast _safe_date P1)
-- Usa branch `p_date_ref <> 'created'` p/ o ramo atividade → qualquer valor
-- inesperado (NULL incluso) cai no comportamento histórico (fail-safe).
-- ════════════════════════════════════════════════════════════════════════

-- ═══ 1. analytics_resumo_overview + p_date_ref ═══════════════════════════
DROP FUNCTION IF EXISTS public.analytics_resumo_overview(timestamptz, timestamptz, text);

CREATE FUNCTION public.analytics_resumo_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT        DEFAULT NULL,
    p_date_ref   TEXT        DEFAULT 'stage'   -- 'stage'=atividade (data_fechamento) | 'created'=safra (created_at)
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
    cards_ganhos_periodo AS (
        SELECT c.*
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND (
            (p_date_ref <> 'created' AND c.data_fechamento >= p_date_start AND c.data_fechamento < p_date_end)
            OR
            (p_date_ref =  'created' AND c.created_at      >= p_date_start AND c.created_at      < p_date_end)
          )
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
    por_origem AS (
        SELECT
            COALESCE(c.origem::TEXT, 'sem_origem') AS origem,
            COUNT(*)::BIGINT AS leads,
            COUNT(*) FILTER (WHERE c.status_comercial = 'ganho' AND (
                (p_date_ref <> 'created' AND c.data_fechamento >= p_date_start AND c.data_fechamento < p_date_end)
                OR (p_date_ref = 'created')
            ))::BIGINT AS ganhos,
            COALESCE(SUM(c.valor_final) FILTER (WHERE c.status_comercial = 'ganho' AND (
                (p_date_ref <> 'created' AND c.data_fechamento >= p_date_start AND c.data_fechamento < p_date_end)
                OR (p_date_ref = 'created')
            )), 0)::NUMERIC AS faturamento
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.created_at >= p_date_start AND c.created_at < p_date_end
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
        GROUP BY 1
        ORDER BY faturamento DESC, leads DESC
    ),
    snapshot_fases AS (
        SELECT
            cardo.phase_slug AS fase,
            COUNT(*)::BIGINT AS qtd
        FROM cards_open cardo
        GROUP BY 1
    ),
    forecast_calc AS (
        SELECT
            c.id,
            _extract_orcamento_numeric(c.produto_data) AS orc,
            NULLIF(c.produto_data->>'data_prevista_fechamento', '')::DATE AS data_prev
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'aberto'
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    forecast AS (
        SELECT
            COUNT(*) FILTER (WHERE data_prev BETWEEN p_date_start::DATE AND p_date_end::DATE)::BIGINT AS qtd_prevista,
            COALESCE(SUM(orc) FILTER (WHERE data_prev BETWEEN p_date_start::DATE AND p_date_end::DATE), 0)::NUMERIC AS valor_previsto,
            COUNT(*) FILTER (WHERE
                data_prev >= NOW()::DATE
                AND data_prev < (NOW() + INTERVAL '7 days')::DATE
            )::BIGINT AS qtd_prox_7d,
            COALESCE(SUM(orc) FILTER (WHERE
                data_prev >= NOW()::DATE
                AND data_prev < (NOW() + INTERVAL '7 days')::DATE
            ), 0)::NUMERIC AS valor_prox_7d
        FROM forecast_calc
        WHERE data_prev IS NOT NULL
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

GRANT EXECUTE ON FUNCTION public.analytics_resumo_overview(timestamptz, timestamptz, text, text) TO authenticated;


-- ═══ 2. analytics_financeiro_overview + p_date_ref ══════════════════════
-- Preserva o FIX P1 de cast seguro (_safe_date) em pendente (20260530h).
DROP FUNCTION IF EXISTS public.analytics_financeiro_overview(timestamptz, timestamptz, text);

CREATE FUNCTION public.analytics_financeiro_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT        DEFAULT NULL,
    p_date_ref   TEXT        DEFAULT 'stage'   -- 'stage'=atividade (data_fechamento) | 'created'=safra (created_at)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_org UUID := requesting_org_id();
    v_result JSONB;
BEGIN
    WITH
    ganhos AS (
        SELECT
            c.id, c.valor_final, c.receita, c.origem, c.data_fechamento,
            c.vendas_owner_id, c.dono_atual_id
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND (
            (p_date_ref <> 'created' AND c.data_fechamento >= p_date_start AND c.data_fechamento < p_date_end)
            OR
            (p_date_ref =  'created' AND c.created_at      >= p_date_start AND c.created_at      < p_date_end)
          )
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    kpis AS (
        SELECT
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(receita), 0)::NUMERIC AS receita,
            CASE WHEN SUM(valor_final) > 0
                 THEN ROUND(SUM(receita) / SUM(valor_final) * 100, 1)
                 ELSE 0 END AS margem_pct,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(SUM(valor_final) / COUNT(*), 0)
                 ELSE 0 END::NUMERIC AS ticket_medio
        FROM ganhos
    ),
    serie_mensal AS (
        SELECT
            DATE_TRUNC('month', c.data_fechamento)::DATE AS mes,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(c.valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(c.receita), 0)::NUMERIC AS receita
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
    por_origem AS (
        SELECT
            COALESCE(origem::TEXT, 'sem_origem') AS origem,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(receita), 0)::NUMERIC AS receita,
            CASE WHEN SUM(valor_final) > 0
                 THEN ROUND(SUM(receita) / SUM(valor_final) * 100, 1)
                 ELSE 0 END AS margem_pct
        FROM ganhos
        GROUP BY 1
        ORDER BY faturamento DESC
    ),
    por_consultor AS (
        SELECT
            COALESCE(g.vendas_owner_id, g.dono_atual_id) AS user_id,
            prof.nome AS user_nome,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(g.valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(g.receita), 0)::NUMERIC AS receita
        FROM ganhos g
        LEFT JOIN profiles prof ON prof.id = COALESCE(g.vendas_owner_id, g.dono_atual_id)
        WHERE COALESCE(g.vendas_owner_id, g.dono_atual_id) IS NOT NULL
        GROUP BY 1, prof.nome
        ORDER BY faturamento DESC
        LIMIT 20
    ),
    pendente AS (
        SELECT
            COUNT(*)::BIGINT AS qtd_pendente,
            COALESCE(SUM(_extract_orcamento_numeric(c.produto_data)), 0)::NUMERIC AS valor_pendente
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'aberto'
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _safe_date(c.produto_data->>'data_prevista_fechamento') BETWEEN p_date_start::DATE AND p_date_end::DATE  -- ✨ FIX P1
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k.*) FROM kpis k),
        'pendente', (SELECT row_to_json(p.*) FROM pendente p),
        'serie_mensal', COALESCE((SELECT jsonb_agg(row_to_json(s.*)) FROM serie_mensal s), '[]'::jsonb),
        'por_origem', COALESCE((SELECT jsonb_agg(row_to_json(o.*)) FROM por_origem o), '[]'::jsonb),
        'por_consultor', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM por_consultor p), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.analytics_financeiro_overview(timestamptz, timestamptz, text, text) TO authenticated;
