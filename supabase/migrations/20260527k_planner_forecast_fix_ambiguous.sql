-- Fix: `valor` era ambíguo entre coluna da CTE e nome do RETURNS column.
-- Renomeia a coluna interna pra `card_valor`.

DROP FUNCTION IF EXISTS public.analytics_planner_forecast_by_dono(DATE, DATE, UUID[], NUMERIC, NUMERIC, TEXT);

CREATE FUNCTION public.analytics_planner_forecast_by_dono(
    p_date_start DATE        DEFAULT CURRENT_DATE,
    p_date_end   DATE        DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    p_owner_ids  UUID[]      DEFAULT NULL,
    p_value_min  NUMERIC     DEFAULT NULL,
    p_value_max  NUMERIC     DEFAULT NULL,
    p_product    TEXT        DEFAULT NULL
)
RETURNS TABLE(
    planner_id        UUID,
    planner_nome      TEXT,
    data_prevista     DATE,
    qtd               INT,
    valor             NUMERIC,
    cards             JSONB
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
    WITH cards_forecast AS (
        SELECT
            c.id AS card_id,
            c.titulo AS card_titulo,
            c.vendas_owner_id AS owner_id,
            COALESCE(c.valor_estimado, c.valor_final, 0)::NUMERIC AS card_valor,
            SUBSTRING(c.produto_data->>'data_prevista_fechamento' FROM 1 FOR 10) AS data_prev_str
        FROM cards c
        WHERE c.org_id = v_org
          AND c.vendas_owner_id IS NOT NULL
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR c.vendas_owner_id = ANY(p_owner_ids))
          AND c.produto_data IS NOT NULL
          AND (c.produto_data->>'data_prevista_fechamento') IS NOT NULL
          AND (c.produto_data->>'data_prevista_fechamento') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          AND SUBSTRING(c.produto_data->>'data_prevista_fechamento' FROM 1 FOR 10) >= v_start_str
          AND SUBSTRING(c.produto_data->>'data_prevista_fechamento' FROM 1 FOR 10) <= v_end_str
    ),
    cards_filtered AS (
        SELECT *
        FROM cards_forecast
        WHERE (p_value_min IS NULL OR card_valor >= p_value_min)
          AND (p_value_max IS NULL OR card_valor <= p_value_max)
    )
    SELECT
        cf.owner_id AS planner_id,
        p.nome AS planner_nome,
        cf.data_prev_str::DATE AS data_prevista,
        COUNT(*)::INT AS qtd,
        SUM(cf.card_valor)::NUMERIC AS valor,
        JSONB_AGG(
            JSONB_BUILD_OBJECT('id', cf.card_id, 'titulo', cf.card_titulo, 'valor', cf.card_valor)
            ORDER BY cf.card_valor DESC
        ) AS cards
    FROM cards_filtered cf
    JOIN profiles p ON p.id = cf.owner_id
    GROUP BY cf.owner_id, p.nome, cf.data_prev_str
    ORDER BY cf.data_prev_str ASC, SUM(cf.card_valor) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_planner_forecast_by_dono TO authenticated;
