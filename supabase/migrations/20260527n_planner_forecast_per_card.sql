-- Reescrita: analytics_planner_forecast_by_dono agora retorna 1 linha POR CARD
-- (não mais pre-agregado por planner+data). Inclui campos adicionais pro
-- frontend cruzar dinamicamente: origem, etapa atual, destino.
--
-- Frontend agrupa em chartData conforme:
--   groupBy: planner | origem | etapa
--   granularity: dia | semana | mês
--
-- Filtros server-side mantidos: janela temporal, planners, faixa de valor.
-- Filtros adicionados: origens, stage_ids.

DROP FUNCTION IF EXISTS public.analytics_planner_forecast_by_dono(DATE, DATE, UUID[], NUMERIC, NUMERIC, TEXT);

CREATE FUNCTION public.analytics_planner_forecast_by_dono(
    p_date_start DATE        DEFAULT CURRENT_DATE,
    p_date_end   DATE        DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    p_owner_ids  UUID[]      DEFAULT NULL,
    p_value_min  NUMERIC     DEFAULT NULL,
    p_value_max  NUMERIC     DEFAULT NULL,
    p_origens    TEXT[]      DEFAULT NULL,
    p_stage_ids  UUID[]      DEFAULT NULL,
    p_product    TEXT        DEFAULT NULL
)
RETURNS TABLE(
    card_id        UUID,
    card_titulo    TEXT,
    valor          NUMERIC,
    data_prevista  DATE,
    planner_id     UUID,
    planner_nome   TEXT,
    origem         TEXT,
    stage_id       UUID,
    stage_nome     TEXT,
    phase_slug     TEXT,
    destino        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_start_str TEXT := TO_CHAR(p_date_start, 'YYYY-MM-DD');
    v_end_str   TEXT := TO_CHAR(p_date_end, 'YYYY-MM-DD');
BEGIN
    RETURN QUERY
    SELECT
        c.id AS card_id,
        c.titulo AS card_titulo,
        COALESCE(c.valor_estimado, c.valor_final, 0)::NUMERIC AS valor,
        SUBSTRING(c.produto_data->>'data_prevista_fechamento' FROM 1 FOR 10)::DATE AS data_prevista,
        c.vendas_owner_id AS planner_id,
        p.nome AS planner_nome,
        COALESCE(NULLIF(c.origem, ''), 'sem_origem')::TEXT AS origem,
        c.pipeline_stage_id AS stage_id,
        s.nome AS stage_nome,
        pp.slug AS phase_slug,
        -- destino vem de produto_data — pode ser string simples ou objeto
        COALESCE(
            NULLIF(c.produto_data->>'destino', ''),
            NULLIF(c.produto_data->>'ww_mkt_destino_form', ''),
            'sem_destino'
        )::TEXT AS destino
    FROM cards c
    JOIN profiles p ON p.id = c.vendas_owner_id
    LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.org_id = v_org
      AND c.vendas_owner_id IS NOT NULL
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial NOT IN ('ganho', 'perdido')
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
           OR c.vendas_owner_id = ANY(p_owner_ids))
      AND (p_origens IS NULL OR COALESCE(array_length(p_origens, 1), 0) = 0
           OR COALESCE(NULLIF(c.origem, ''), 'sem_origem') = ANY(p_origens))
      AND (p_stage_ids IS NULL OR COALESCE(array_length(p_stage_ids, 1), 0) = 0
           OR c.pipeline_stage_id = ANY(p_stage_ids))
      AND c.produto_data IS NOT NULL
      AND (c.produto_data->>'data_prevista_fechamento') IS NOT NULL
      AND (c.produto_data->>'data_prevista_fechamento') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      AND SUBSTRING(c.produto_data->>'data_prevista_fechamento' FROM 1 FOR 10) >= v_start_str
      AND SUBSTRING(c.produto_data->>'data_prevista_fechamento' FROM 1 FOR 10) <= v_end_str
      AND (p_value_min IS NULL OR COALESCE(c.valor_estimado, c.valor_final, 0) >= p_value_min)
      AND (p_value_max IS NULL OR COALESCE(c.valor_estimado, c.valor_final, 0) <= p_value_max)
    ORDER BY data_prevista ASC, valor DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_planner_forecast_by_dono TO authenticated;
